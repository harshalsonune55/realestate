"use server";

import { revalidatePath } from "next/cache";
import { requirePerm } from "@/lib/auth";
import { db, nextId, write } from "@/lib/store";
import { logAudit } from "@/lib/audit";
import { addDays, today } from "@/lib/utils";
import { BounceDraft, DepositDraft, bounceProblems, depositProblems } from "./cheque-rules";

type Result = { ok: true; href: string; message?: string } | { ok: false; message: string };

/** Marks the task that pointed at this cheque as done, so lists stay honest. */
function closeTasksFor(store: ReturnType<typeof db>, entityId: string, entityType: string) {
  store.tasks
    .filter((t) => t.entityId === entityId && t.entityType === entityType && t.status !== "done")
    .forEach((t) => {
      t.status = "done";
      t.completedAt = new Date().toISOString();
    });
}

export async function depositChequeAction(payload: string): Promise<Result> {
  const user = await requirePerm("cheques.deposit");
  const draft = JSON.parse(payload) as DepositDraft;

  const cheque = db().cheques.find((c) => c.id === draft.chequeId);
  if (!cheque) return { ok: false, message: "Cheque not found." };
  if (cheque.status !== "pending")
    return { ok: false, message: `This cheque is already marked as ${cheque.status}.` };

  const problems = depositProblems(draft, cheque).flat();
  if (problems.length) return { ok: false, message: problems[0] };

  write((store) => {
    const c = store.cheques.find((x) => x.id === draft.chequeId)!;
    c.status = "deposited";
    c.depositedAt = draft.depositDate;
    c.depositedBy = user.id;
    c.depositSlipNo = draft.depositSlipNo.trim();

    closeTasksFor(store, c.id, "cheque");

    // the job is not finished until the bank confirms clearance
    store.tasks.push({
      id: nextId("task", "TK"),
      title: `Confirm clearance of cheque ${c.chequeNo}`,
      detail: `Deposited ${draft.depositDate} into ${draft.bankAccount}. Check the bank statement.`,
      assignedTo: user.id,
      dueDate: addDays(draft.depositDate, 3),
      status: "open",
      priority: "medium",
      entityType: "cheque",
      entityId: c.id,
      createdAt: new Date().toISOString(),
      source: "system",
    });
  });

  logAudit(user, "cheque.deposited", "cheque", cheque.id, `Deposited cheque ${cheque.chequeNo}`, [
    { field: "status", from: "pending", to: "deposited" },
    { field: "depositSlipNo", from: "—", to: draft.depositSlipNo },
    { field: "account", from: "—", to: draft.bankAccount },
  ]);

  revalidatePath("/", "layout");
  return { ok: true, href: `/cheques/${cheque.id}?deposited=1` };
}

export async function markClearedAction(chequeId: string): Promise<Result> {
  const user = await requirePerm("cheques.deposit");
  const cheque = db().cheques.find((c) => c.id === chequeId);
  if (!cheque) return { ok: false, message: "Cheque not found." };
  if (cheque.status !== "deposited")
    return { ok: false, message: "Only a deposited cheque can be marked as cleared." };

  write((store) => {
    const c = store.cheques.find((x) => x.id === chequeId)!;
    c.status = "cleared";
    c.clearedAt = today();
    closeTasksFor(store, c.id, "cheque");

    const payId = nextId("payment", "PY");
    store.payments.push({
      id: payId,
      receiptNo: `RCP-${payId.replace("PY", "").padStart(5, "0")}`,
      contractId: c.contractId,
      chequeId: c.id,
      amount: c.amount,
      method: "cheque",
      category: "rent",
      receivedAt: today(),
      receivedBy: user.id,
      reference: `${c.bank} / ${c.chequeNo}`,
    });
  });

  logAudit(user, "cheque.cleared", "cheque", chequeId, `Recorded clearance of cheque ${cheque.chequeNo}`, [
    { field: "status", from: "deposited", to: "cleared" },
  ]);

  revalidatePath("/", "layout");
  return { ok: true, href: `/cheques/${chequeId}?cleared=1` };
}

export async function reportBounceAction(payload: string): Promise<Result> {
  const user = await requirePerm("cheques.bounce");
  const draft = JSON.parse(payload) as BounceDraft;

  const d = db();
  const cheque = d.cheques.find((c) => c.id === draft.chequeId);
  if (!cheque) return { ok: false, message: "Cheque not found." };
  if (cheque.status !== "deposited")
    return { ok: false, message: "A cheque can only be returned after it has been deposited." };

  const problems = bounceProblems(draft, cheque).flat();
  if (problems.length) return { ok: false, message: problems[0] };

  const contract = d.contracts.find((c) => c.id === cheque.contractId);
  const tenant = d.tenants.find((t) => t.id === contract?.tenantId);

  write((store) => {
    const c = store.cheques.find((x) => x.id === draft.chequeId)!;
    c.status = "bounced";
    c.bouncedAt = draft.returnDate;
    c.bounceReason = draft.reason;
    closeTasksFor(store, c.id, "cheque");

    const now = new Date().toISOString();

    // chasing the replacement is a tracked task, not a note in someone's head
    store.tasks.push({
      id: nextId("task", "TK"),
      title: `Collect replacement for bounced cheque ${c.chequeNo}`,
      detail: `${tenant?.name ?? "Tenant"} · ${draft.reason} · AED ${c.amount.toLocaleString("en-US")}`,
      assignedTo: user.id,
      dueDate: draft.replacementDeadline || addDays(draft.returnDate, 3),
      status: "open",
      priority: "high",
      entityType: "cheque",
      entityId: c.id,
      createdAt: now,
      source: "system",
    });

    if (draft.replacementRequired) {
      const apId = nextId("approval", "AP");
      const ref = `APR-${apId.replace("AP", "").padStart(4, "0")}`;
      store.approvals.push({
        id: apId,
        ref,
        type: "cheque_replacement",
        title: `Replace bounced cheque ${c.chequeNo}`,
        summary: `${tenant?.name ?? ""} · ${c.bank} · AED ${c.amount.toLocaleString("en-US")} · ${draft.reason}`,
        entityType: "cheque",
        entityId: c.id,
        amount: c.amount,
        requestedBy: user.id,
        requestedAt: now,
        status: "pending",
      });
      store.tasks.push({
        id: nextId("task", "TK"),
        title: `Review approval ${ref}`,
        detail: `Replacement cheque for ${tenant?.name ?? "tenant"}`,
        assignedTo: "U2",
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

  logAudit(user, "cheque.bounced", "cheque", cheque.id, `Recorded bank return of cheque ${cheque.chequeNo}`, [
    { field: "status", from: "deposited", to: "bounced" },
    { field: "reason", from: "—", to: draft.reason },
    { field: "bankCharges", from: "0", to: String(draft.bankCharges) },
  ]);

  revalidatePath("/", "layout");
  return { ok: true, href: `/cheques/${cheque.id}?bounced=1` };
}
