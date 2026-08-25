"use server";

import { revalidatePath } from "next/cache";
import { requirePerm } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { findUnit } from "@/lib/repos/contracts";
import { ConflictError } from "@/lib/repos/shared";
import {
  advanceMaintenance, createMaintenance, findMaintenance, tenantOfUnit,
} from "@/lib/repos/maintenance";
import { MaintenanceStatus } from "@/lib/types";
import { syncPendingTasks } from "@/lib/actions/task-sync";
import {
  MaintenanceDraft, SLA_DAYS, SPEND_APPROVAL_LIMIT, maintenanceProblems,
} from "./maintenance-rules";

type Result = { ok: true; href: string; message?: string } | { ok: false; message: string };

export async function createMaintenanceAction(payload: string): Promise<Result> {
  const user = await requirePerm("maintenance.manage");
  const draft = JSON.parse(payload) as MaintenanceDraft;

  const unit = await findUnit(draft.unitId);
  if (!unit) return { ok: false, message: "Unit not found." };

  const problems = maintenanceProblems(draft, unit.unitNo).flat();
  if (problems.length) return { ok: false, message: problems[0] };

  const created = await createMaintenance({
    unitId: unit.id,
    unitNo: unit.unitNo,
    tenantId: await tenantOfUnit(unit.id),
    category: draft.category,
    priority: draft.priority,
    description:
      draft.description.trim() +
      (draft.safetyRisk ? `\n\nSAFETY RISK: ${draft.safetyNotes.trim()}` : "") +
      `\n\nAccess: ${draft.accessArrangement.replace(/_/g, " ")}${
        draft.accessNotes ? ` — ${draft.accessNotes.trim()}` : ""
      }`,
    vendor: draft.vendor,
    quoteAmount: draft.quoteAmount,
    slaDays: SLA_DAYS[draft.priority],
    needsApproval: draft.quoteAmount >= SPEND_APPROVAL_LIMIT,
    reportedBy: user.id,
    now: new Date().toISOString(),
  });

  await logAudit(
    user,
    "maintenance.created",
    "maintenance",
    created.id,
    `Raised work order ${created.ref} for unit ${unit.unitNo}`,
    [
      { field: "priority", from: "—", to: draft.priority },
      { field: "vendor", from: "—", to: draft.vendor },
      { field: "quote", from: "—", to: String(draft.quoteAmount) },
    ]
  );

  await syncPendingTasks();
  revalidatePath("/", "layout");
  return { ok: true, href: `/maintenance/${created.id}?created=1` };
}

const NEXT_STATUS: Partial<Record<MaintenanceStatus, MaintenanceStatus>> = {
  new: "assigned",
  assigned: "in_progress",
  in_progress: "completed",
  completed: "closed",
};

export async function advanceMaintenanceAction(id: string, note: string): Promise<Result> {
  const user = await requirePerm("maintenance.manage");
  const wo = await findMaintenance(id);
  if (!wo) return { ok: false, message: "Work order not found." };

  if (wo.status === "awaiting_approval")
    return { ok: false, message: "This job is waiting on a manager approving the spend." };

  const next = NEXT_STATUS[wo.status];
  if (!next) return { ok: false, message: "This work order is already closed." };
  if ((next === "completed" || next === "closed") && note.trim().length < 8)
    return { ok: false, message: "Write what was done before completing or closing the job." };

  try {
    await advanceMaintenance(id, wo.status, next, note.trim(), new Date().toISOString());
  } catch (err) {
    if (!(err instanceof ConflictError)) throw err;
    return { ok: false, message: "Somebody else moved this work order while you were writing." };
  }

  await logAudit(user, "maintenance.status", "maintenance", id, `Moved ${wo.ref} to ${next.replace("_", " ")}`, [
    { field: "status", from: wo.status, to: next },
  ]);

  await syncPendingTasks();
  revalidatePath("/", "layout");
  return { ok: true, href: `/maintenance/${id}` };
}
