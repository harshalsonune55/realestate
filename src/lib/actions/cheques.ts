"use server";

import { revalidatePath } from "next/cache";
import { requirePerm } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  chequeTenantName, depositCheque, findCheque, markChequeCleared, reportChequeBounce,
} from "@/lib/repos/cheques";
import { BounceDraft, DepositDraft, bounceProblems, depositProblems } from "./cheque-rules";
import { syncPendingTasks } from "@/lib/actions/task-sync";
import { retryChequeSync, syncChequeById, syncPendingPayments } from "@/lib/actions/payment-sync";

type Result = { ok: true; href: string; message?: string } | { ok: false; message: string };

export async function depositChequeAction(payload: string): Promise<Result> {
  const user = await requirePerm("cheques.deposit");
  const draft = JSON.parse(payload) as DepositDraft;

  const cheque = await findCheque(draft.chequeId);
  if (!cheque) return { ok: false, message: "Cheque not found." };
  if (cheque.status !== "pending")
    return { ok: false, message: `This cheque is already marked as ${cheque.status}.` };

  const problems = depositProblems(draft, cheque).flat();
  if (problems.length) return { ok: false, message: problems[0] };

  await depositCheque({
    chequeId: draft.chequeId,
    depositDate: draft.depositDate,
    depositSlipNo: draft.depositSlipNo.trim(),
    bankAccount: draft.bankAccount,
    userId: user.id,
    now: new Date().toISOString(),
  });

  await logAudit(user, "cheque.deposited", "cheque", cheque.id, `Deposited cheque ${cheque.chequeNo}`, [
    { field: "status", from: "pending", to: "deposited" },
    { field: "depositSlipNo", from: "—", to: draft.depositSlipNo },
    { field: "account", from: "—", to: draft.bankAccount },
  ]);

  await syncChequeById(cheque.id);
  await syncPendingTasks();
  revalidatePath("/", "layout");
  return { ok: true, href: `/cheques/${cheque.id}?deposited=1` };
}

export async function markClearedAction(chequeId: string): Promise<Result> {
  const user = await requirePerm("cheques.deposit");
  const cheque = await findCheque(chequeId);
  if (!cheque) return { ok: false, message: "Cheque not found." };
  if (cheque.status !== "deposited")
    return { ok: false, message: "Only a deposited cheque can be marked as cleared." };

  await markChequeCleared(chequeId, user.id, new Date().toISOString());

  await logAudit(user, "cheque.cleared", "cheque", chequeId, `Recorded clearance of cheque ${cheque.chequeNo}`, [
    { field: "status", from: "deposited", to: "cleared" },
  ]);

  await syncChequeById(chequeId);   // move the cheque's draft to "cleared"
  await syncPendingPayments();      // mirror the receipt this clearance created
  await syncPendingTasks();
  revalidatePath("/", "layout");
  return { ok: true, href: `/cheques/${chequeId}?cleared=1` };
}

export async function reportBounceAction(payload: string): Promise<Result> {
  const user = await requirePerm("cheques.bounce");
  const draft = JSON.parse(payload) as BounceDraft;

  const cheque = await findCheque(draft.chequeId);
  if (!cheque) return { ok: false, message: "Cheque not found." };
  if (cheque.status !== "deposited")
    return { ok: false, message: "A cheque can only be returned after it has been deposited." };

  const problems = bounceProblems(draft, cheque).flat();
  if (problems.length) return { ok: false, message: problems[0] };

  await reportChequeBounce({
    chequeId: draft.chequeId,
    returnDate: draft.returnDate,
    reason: draft.reason,
    replacementRequired: draft.replacementRequired,
    replacementDeadline: draft.replacementDeadline,
    userId: user.id,
    tenantName: await chequeTenantName(draft.chequeId),
    now: new Date().toISOString(),
  });

  await logAudit(user, "cheque.bounced", "cheque", cheque.id, `Recorded bank return of cheque ${cheque.chequeNo}`, [
    { field: "status", from: "deposited", to: "bounced" },
    { field: "reason", from: "—", to: draft.reason },
    { field: "bankCharges", from: "0", to: String(draft.bankCharges) },
  ]);

  await syncChequeById(cheque.id);
  await syncPendingTasks();
  revalidatePath("/", "layout");
  return { ok: true, href: `/cheques/${cheque.id}?bounced=1` };
}

/**
 * Retries the Odoo payment push for one cheque, on an explicit action.
 *
 * Mirrors the viewing retry: chooses create or update from whether an
 * account.payment id is already held, so it can never leave two payments for
 * one cheque.
 */
export async function retryChequeSyncAction(chequeId: string): Promise<Result> {
  const user = await requirePerm("cheques.view");
  const cheque = await findCheque(chequeId);
  if (!cheque) return { ok: false, message: "Cheque not found." };

  const sync = await retryChequeSync(chequeId);
  await logAudit(user, "cheque.sync_retried", "cheque", chequeId,
    `${cheque.chequeNo} — ${sync.synced ? "synced" : "failed"}`);

  revalidatePath("/", "layout");
  return sync.synced
    ? { ok: true, href: `/cheques/${chequeId}`, message: "Synced to Odoo." }
    : { ok: false, message: sync.message ?? "Odoo is still unreachable." };
}
