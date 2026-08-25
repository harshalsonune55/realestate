import "server-only";

import {
  ODOO_MISSING,
  ODOO_NOT_CONFIGURED,
  OdooError,
  createPayment,
  odooConfig,
  syncPaymentState,
  updatePayment,
} from "@/lib/odoo";
import {
  chequeMemoContext,
  findCheque,
  unsyncedCheques,
  updateChequeSync,
} from "@/lib/repos/cheques";
import {
  findPayment,
  paymentTenantName,
  unsyncedPayments,
  updatePaymentSync,
} from "@/lib/repos/payments";
import type { Cheque, Payment } from "@/lib/types";

/**
 * Mirrors cheque and receipt detail into Odoo as draft `account.payment`s.
 *
 * Same shape and ordering as the viewing and task mirrors: the row is committed
 * to Postgres first, pushed after. Postgres is the source of truth; Odoo holds
 * a reviewable draft. Nothing here throws — every failure is written to the
 * row's `odooError` and left for an explicit retry, so a mirror that is behind
 * never costs anybody a financial record.
 */

export interface SyncOutcome {
  synced: boolean;
  odooPaymentId?: number;
  message?: string;
}

/* -------------------------------------------------------------- cheques */

function chequeMemo(cheque: Cheque, ctx: { contractRef: string } | null): string {
  const ref = ctx?.contractRef ? `${ctx.contractRef} · ` : "";
  return (
    `PMS Cheque ${cheque.chequeNo} · ${cheque.bank} · ${ref}` +
    `cheque ${cheque.seq} of ${cheque.ofTotal} · status: ${cheque.status}`
  );
}

export async function syncChequeToOdoo(cheque: Cheque): Promise<SyncOutcome> {
  const cfg = odooConfig();
  if (!cfg) return { synced: false, message: ODOO_NOT_CONFIGURED };

  const ctx = await chequeMemoContext(cheque.id);
  const payload = {
    amount: cheque.amount,
    date: cheque.dueDate,
    memo: chequeMemo(cheque, ctx),
    partnerName: ctx?.tenantName,
  };

  try {
    let odooPaymentId = cheque.odooPaymentId;
    if (odooPaymentId) {
      await updatePayment(cfg, odooPaymentId, {
        amount: payload.amount, date: payload.date, memo: payload.memo,
      });
    } else {
      odooPaymentId = await createPayment(cfg, payload);
    }
    // Reflect the cheque status in the Odoo payment's State badge.
    await syncPaymentState(cfg, odooPaymentId, cheque.status);
    await updateChequeSync(cheque.id, {
      odooPaymentId, odooSyncedAt: new Date().toISOString(), odooError: null,
    });
    return { synced: true, odooPaymentId };
  } catch (err) {
    return recordFailure(err, (reason) => updateChequeSync(cheque.id, { odooError: reason }));
  }
}

export async function syncChequeById(chequeId: string): Promise<SyncOutcome> {
  const cheque = await findCheque(chequeId);
  if (!cheque) return { synced: false, message: "Cheque not found." };
  return syncChequeToOdoo(cheque);
}

export async function retryChequeSync(chequeId: string): Promise<SyncOutcome> {
  const cheque = await findCheque(chequeId);
  if (!cheque) return { synced: false, message: "Cheque not found." };

  let target = cheque;
  if (cheque.odooPaymentId && cheque.odooError?.includes("no longer exists")) {
    await updateChequeSync(chequeId, { odooPaymentId: null });
    target = { ...cheque, odooPaymentId: undefined };
  } else if (!cheque.odooPaymentId) {
    target = { ...cheque, odooError: undefined };
  }
  return syncChequeToOdoo(target);
}

export async function syncPendingCheques(limit = 25): Promise<{ attempted: number; synced: number }> {
  if (!odooConfig()) return { attempted: 0, synced: 0 };
  const pending = await unsyncedCheques(limit);
  let synced = 0;
  for (const c of pending) if ((await syncChequeToOdoo(c)).synced) synced += 1;
  return { attempted: pending.length, synced };
}

/* -------------------------------------------------------------- receipts */

function receiptMemo(payment: Payment): string {
  return `PMS Receipt ${payment.receiptNo} · ${payment.method} · ${payment.category} · ${payment.reference}`;
}

export async function syncPaymentToOdoo(payment: Payment): Promise<SyncOutcome> {
  const cfg = odooConfig();
  if (!cfg) return { synced: false, message: ODOO_NOT_CONFIGURED };

  const payload = {
    amount: payment.amount,
    date: payment.receivedAt.slice(0, 10),
    memo: receiptMemo(payment),
    partnerName: await paymentTenantName(payment.id),
  };

  try {
    let odooPaymentId = payment.odooPaymentId;
    if (odooPaymentId) {
      await updatePayment(cfg, odooPaymentId, {
        amount: payload.amount, date: payload.date, memo: payload.memo,
      });
    } else {
      odooPaymentId = await createPayment(cfg, payload);
    }
    // A receipt is realised money — post it so it reads as In Process in Odoo.
    await syncPaymentState(cfg, odooPaymentId, "cleared");
    await updatePaymentSync(payment.id, {
      odooPaymentId, odooSyncedAt: new Date().toISOString(), odooError: null,
    });
    return { synced: true, odooPaymentId };
  } catch (err) {
    return recordFailure(err, (reason) => updatePaymentSync(payment.id, { odooError: reason }));
  }
}

export async function syncPaymentById(paymentId: string): Promise<SyncOutcome> {
  const payment = await findPayment(paymentId);
  if (!payment) return { synced: false, message: "Receipt not found." };
  return syncPaymentToOdoo(payment);
}

export async function retryPaymentSync(paymentId: string): Promise<SyncOutcome> {
  const payment = await findPayment(paymentId);
  if (!payment) return { synced: false, message: "Receipt not found." };

  let target = payment;
  if (payment.odooPaymentId && payment.odooError?.includes("no longer exists")) {
    await updatePaymentSync(paymentId, { odooPaymentId: null });
    target = { ...payment, odooPaymentId: undefined };
  } else if (!payment.odooPaymentId) {
    target = { ...payment, odooError: undefined };
  }
  return syncPaymentToOdoo(target);
}

export async function syncPendingPayments(limit = 25): Promise<{ attempted: number; synced: number }> {
  if (!odooConfig()) return { attempted: 0, synced: 0 };
  const pending = await unsyncedPayments(limit);
  let synced = 0;
  for (const p of pending) if ((await syncPaymentToOdoo(p)).synced) synced += 1;
  return { attempted: pending.length, synced };
}

/* --------------------------------------------------------------- shared */

/** Records a push failure the same way both mirrors do, and shapes the reply. */
async function recordFailure(
  err: unknown,
  save: (reason: string) => Promise<void>
): Promise<SyncOutcome> {
  const odooErr = err instanceof OdooError ? err : null;
  const vanished = odooErr?.odooException === ODOO_MISSING;
  const reason = vanished
    ? "The linked Odoo payment no longer exists. Use Retry sync to recreate it."
    : (odooErr?.message ?? String(err));
  await save(reason);
  return {
    synced: false,
    message: vanished
      ? "The Odoo payment was deleted at the Odoo end — retry to recreate it."
      : "This record has not reached Odoo yet — it can be retried.",
  };
}
