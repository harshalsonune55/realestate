"use server";

import { revalidatePath } from "next/cache";
import { requirePerm } from "@/lib/auth";
import { db, nextId, write } from "@/lib/store";
import { logAudit } from "@/lib/audit";
import { addDays, daysFromToday, today } from "@/lib/utils";

type Result = { ok: true; message: string } | { ok: false; message: string };

export async function decideApprovalAction(
  approvalId: string,
  decision: "approved" | "rejected",
  note: string
): Promise<Result> {
  const user = await requirePerm("approvals.decide");

  const d = db();
  const approval = d.approvals.find((a) => a.id === approvalId);
  if (!approval) return { ok: false, message: "Approval not found." };
  if (approval.status !== "pending")
    return { ok: false, message: `This item was already ${approval.status}.` };
  if (approval.requestedBy === user.id)
    return { ok: false, message: "You cannot approve a request you raised yourself." };
  if (decision === "rejected" && note.trim().length < 10)
    return { ok: false, message: "Give a reason of at least 10 characters when rejecting." };

  const now = new Date().toISOString();

  write((store) => {
    const a = store.approvals.find((x) => x.id === approvalId)!;
    a.status = decision;
    a.decidedBy = user.id;
    a.decidedAt = now;
    a.decisionNote = note.trim() || undefined;

    // close the manager's review task
    store.tasks
      .filter((t) => t.entityType === "approval" && t.entityId === approvalId && t.status !== "done")
      .forEach((t) => {
        t.status = "done";
        t.completedAt = now;
      });

    if (a.type === "new_contract" || a.type === "renewal") {
      const contract = store.contracts.find((c) => c.id === a.entityId);
      if (!contract) return;
      const unit = store.units.find((u) => u.id === contract.unitId);

      if (decision === "approved") {
        contract.status =
          daysFromToday(contract.endDate) <= 90 && daysFromToday(contract.endDate) >= 0
            ? "expiring"
            : "active";
        contract.approvedBy = user.id;
        contract.approvedAt = now;
        if (unit) unit.status = "occupied";

        // every cheque now gets a real owner and a real deadline
        store.cheques
          .filter((c) => c.contractId === contract.id && c.status === "pending")
          .forEach((c, i) => {
            if (daysFromToday(c.dueDate) > 10) return;
            store.tasks.push({
              id: nextId("task", "TK"),
              title: `Deposit cheque ${c.chequeNo}`,
              detail: `Contract ${contract.ref} · AED ${c.amount.toLocaleString("en-US")} · cheque ${c.seq} of ${c.ofTotal}`,
              assignedTo: i % 2 === 0 ? "U4" : "U5",
              dueDate: c.dueDate,
              status: daysFromToday(c.dueDate) < 0 ? "overdue" : "open",
              priority: "medium",
              entityType: "cheque",
              entityId: c.id,
              createdAt: now,
              source: "system",
            });
          });

        // and the renewal clock starts immediately
        store.tasks.push({
          id: nextId("task", "TK"),
          title: `Start renewal — ${unit?.unitNo ?? ""} (${contract.ref})`,
          detail: `Contract expires ${contract.endDate}. Begin the renewal 90 days before.`,
          assignedTo: contract.createdBy,
          dueDate: addDays(contract.endDate, -90),
          status: "open",
          priority: "medium",
          entityType: "contract",
          entityId: contract.id,
          createdAt: now,
          source: "system",
        });
      } else {
        contract.status = "rejected";
        if (unit) unit.status = "vacant";
        store.cheques
          .filter((c) => c.contractId === contract.id)
          .forEach((c) => {
            c.status = "cancelled";
          });
        store.tasks.push({
          id: nextId("task", "TK"),
          title: `Rework rejected contract ${contract.ref}`,
          detail: note.trim(),
          assignedTo: contract.createdBy,
          dueDate: addDays(today(), 2),
          status: "open",
          priority: "high",
          entityType: "contract",
          entityId: contract.id,
          createdAt: now,
          source: "system",
        });
      }
    }

    if (a.type === "maintenance_spend") {
      const m = store.maintenance.find((x) => x.id === a.entityId);
      if (m) m.status = decision === "approved" ? "in_progress" : "rejected";
    }

    if (a.type === "cheque_replacement" && decision === "approved") {
      store.tasks.push({
        id: nextId("task", "TK"),
        title: "Register the replacement cheque",
        detail: `${a.summary}. Add the new cheque against the contract once received.`,
        assignedTo: a.requestedBy,
        dueDate: addDays(today(), 3),
        status: "open",
        priority: "high",
        entityType: "cheque",
        entityId: a.entityId,
        createdAt: now,
        source: "system",
      });
    }
  });

  logAudit(
    user,
    decision === "approved" ? "approval.approved" : "approval.rejected",
    "approval",
    approvalId,
    `${decision === "approved" ? "Approved" : "Rejected"} ${approval.ref} — ${approval.title}`,
    [{ field: "status", from: "pending", to: decision }]
  );

  revalidatePath("/", "layout");
  return {
    ok: true,
    message:
      decision === "approved"
        ? "Approved. The change is now live and the follow-up tasks have been created."
        : "Rejected. The requester has been given a task to rework it.",
  };
}
