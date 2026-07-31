"use server";

import { revalidatePath } from "next/cache";
import { requirePerm } from "@/lib/auth";
import { db, nextId, write } from "@/lib/store";
import { logAudit } from "@/lib/audit";
import { MaintenanceRequest, MaintenanceStatus } from "@/lib/types";
import { addDays, today } from "@/lib/utils";
import {
  MaintenanceDraft, SLA_DAYS, SPEND_APPROVAL_LIMIT, maintenanceProblems,
} from "./maintenance-rules";

type Result = { ok: true; href: string; message?: string } | { ok: false; message: string };

export async function createMaintenanceAction(payload: string): Promise<Result> {
  const user = await requirePerm("maintenance.manage");
  const draft = JSON.parse(payload) as MaintenanceDraft;

  const d = db();
  const unit = d.units.find((u) => u.id === draft.unitId);
  if (!unit) return { ok: false, message: "Unit not found." };

  const problems = maintenanceProblems(draft, unit.unitNo).flat();
  if (problems.length) return { ok: false, message: problems[0] };

  const contract = d.contracts.find(
    (c) => c.unitId === unit.id && (c.status === "active" || c.status === "expiring")
  );
  const id = "M" + (d.maintenance.length + 1);
  const ref = `WO-${String(1200 + d.maintenance.length + 1).padStart(4, "0")}`;
  const now = new Date().toISOString();
  const needsApproval = draft.quoteAmount >= SPEND_APPROVAL_LIMIT;

  write((store) => {
    const wo: MaintenanceRequest = {
      id,
      ref,
      unitId: unit.id,
      tenantId: contract?.tenantId,
      category: draft.category,
      priority: draft.priority,
      description:
        draft.description.trim() +
        (draft.safetyRisk ? `\n\nSAFETY RISK: ${draft.safetyNotes.trim()}` : "") +
        `\n\nAccess: ${draft.accessArrangement.replace(/_/g, " ")}${
          draft.accessNotes ? ` — ${draft.accessNotes.trim()}` : ""
        }`,
      status: needsApproval ? "awaiting_approval" : "assigned",
      reportedAt: now,
      reportedBy: user.id,
      assignedTo: "U8",
      vendor: draft.vendor,
      quoteAmount: draft.quoteAmount || undefined,
      slaDueAt: addDays(today(), SLA_DAYS[draft.priority]),
    };
    store.maintenance.push(wo);

    store.tasks.push({
      id: nextId("task", "TK"),
      title: `${ref} — ${draft.category} at ${unit.unitNo}`,
      detail: draft.description.trim().slice(0, 140),
      assignedTo: "U8",
      dueDate: wo.slaDueAt,
      status: "open",
      priority: draft.priority === "emergency" || draft.priority === "high" ? "high" : "medium",
      entityType: "maintenance",
      entityId: id,
      createdAt: now,
      source: "system",
    });

    if (needsApproval) {
      const apId = nextId("approval", "AP");
      const apRef = `APR-${apId.replace("AP", "").padStart(4, "0")}`;
      store.approvals.push({
        id: apId,
        ref: apRef,
        type: "maintenance_spend",
        title: `Maintenance spend — ${ref} (${unit.unitNo})`,
        summary: `${draft.category} · ${draft.vendor} · quote AED ${draft.quoteAmount.toLocaleString("en-US")}`,
        entityType: "maintenance",
        entityId: id,
        amount: draft.quoteAmount,
        requestedBy: user.id,
        requestedAt: now,
        status: "pending",
      });
      store.tasks.push({
        id: nextId("task", "TK"),
        title: `Review approval ${apRef}`,
        detail: `Maintenance spend for ${unit.unitNo}`,
        assignedTo: "U3",
        dueDate: addDays(today(), 2),
        status: "open",
        priority: "high",
        entityType: "approval",
        entityId: apId,
        createdAt: now,
        source: "system",
      });
    }
  });

  logAudit(user, "maintenance.created", "maintenance", id, `Raised work order ${ref} for unit ${unit.unitNo}`, [
    { field: "priority", from: "—", to: draft.priority },
    { field: "vendor", from: "—", to: draft.vendor },
    { field: "quote", from: "—", to: String(draft.quoteAmount) },
  ]);

  revalidatePath("/", "layout");
  return { ok: true, href: `/maintenance/${id}?created=1` };
}

const NEXT_STATUS: Partial<Record<MaintenanceStatus, MaintenanceStatus>> = {
  new: "assigned",
  assigned: "in_progress",
  in_progress: "completed",
  completed: "closed",
};

export async function advanceMaintenanceAction(id: string, note: string): Promise<Result> {
  const user = await requirePerm("maintenance.manage");
  const wo = db().maintenance.find((m) => m.id === id);
  if (!wo) return { ok: false, message: "Work order not found." };

  if (wo.status === "awaiting_approval")
    return { ok: false, message: "This job is waiting on a manager approving the spend." };

  const next = NEXT_STATUS[wo.status];
  if (!next) return { ok: false, message: "This work order is already closed." };
  if ((next === "completed" || next === "closed") && note.trim().length < 8)
    return { ok: false, message: "Write what was done before completing or closing the job." };

  write((store) => {
    const m = store.maintenance.find((x) => x.id === id)!;
    m.status = next;
    if (next === "completed") {
      m.completedAt = today();
      m.resolutionNotes = note.trim();
    }
    if (next === "closed") {
      m.resolutionNotes = (m.resolutionNotes ? m.resolutionNotes + " — " : "") + note.trim();
      store.tasks
        .filter((t) => t.entityType === "maintenance" && t.entityId === id && t.status !== "done")
        .forEach((t) => {
          t.status = "done";
          t.completedAt = new Date().toISOString();
        });
    }
  });

  logAudit(user, "maintenance.status", "maintenance", id, `Moved ${wo.ref} to ${next.replace("_", " ")}`, [
    { field: "status", from: wo.status, to: next },
  ]);

  revalidatePath("/", "layout");
  return { ok: true, href: `/maintenance/${id}` };
}
