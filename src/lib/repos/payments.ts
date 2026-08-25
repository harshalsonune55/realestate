import "server-only";
import { q, q1 } from "../db";
import { backend } from "../data";
import { toPayment } from "../repo";
import { db as jsonDb, write as jsonWrite } from "../store";
import type { Payment } from "../types";

/**
 * Receipts, and their Odoo mirror state.
 *
 * A receipt is written when a cheque clears (see `markChequeCleared`). It is a
 * realised money-in, so it mirrors to a draft `account.payment` in Odoo — the
 * same model the cheque instrument mirrors to, but a distinct record labelled
 * as a receipt. Postgres remains the source of truth.
 */

export async function findPayment(id: string): Promise<Payment | null> {
  if (backend() === "json") return jsonDb().payments.find((p) => p.id === id) ?? null;
  const row = await q1("SELECT * FROM payments WHERE id = $1", [id]);
  return row ? toPayment(row) : null;
}

export interface PaymentSyncPatch {
  odooPaymentId?: number | null;
  odooSyncedAt?: string | null;
  odooError?: string | null;
}

const COLUMN: Record<keyof PaymentSyncPatch, string> = {
  odooPaymentId: "odoo_payment_id",
  odooSyncedAt: "odoo_synced_at",
  odooError: "odoo_error",
};

export async function updatePaymentSync(id: string, patch: PaymentSyncPatch): Promise<void> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;

  if (backend() === "json") {
    jsonWrite((store) => {
      const p = store.payments.find((x) => x.id === id) as Record<string, unknown> | undefined;
      if (!p) return;
      for (const [k, v] of entries) {
        if (v === null) delete p[k];
        else p[k] = v;
      }
    });
    return;
  }

  const sets = entries.map(([k], i) => `${COLUMN[k as keyof PaymentSyncPatch]} = $${i + 2}`);
  await q(`UPDATE payments SET ${sets.join(", ")} WHERE id = $1`, [id, ...entries.map(([, v]) => v)]);
}

/** Receipts never pushed to Odoo, newest first. */
export async function unsyncedPayments(limit = 25): Promise<Payment[]> {
  if (backend() === "json") {
    return (jsonDb().payments as (Payment & { odooPaymentId?: number; odooError?: string })[])
      .filter((p) => p.odooPaymentId == null && p.odooError == null)
      .slice(0, limit);
  }
  const rows = await q(
    `SELECT * FROM payments
      WHERE odoo_payment_id IS NULL AND odoo_error IS NULL
      ORDER BY received_at DESC LIMIT $1`,
    [limit]
  );
  return rows.map(toPayment);
}

/** Tenant name behind a receipt, for the Odoo payment's partner + memo. */
export async function paymentTenantName(paymentId: string): Promise<string> {
  if (backend() === "json") {
    const d = jsonDb();
    const payment = d.payments.find((p) => p.id === paymentId);
    const contract = d.contracts.find((c) => c.id === payment?.contractId);
    return d.tenants.find((t) => t.id === contract?.tenantId)?.name ?? "";
  }
  const row = await q1<{ name: string }>(
    `SELECT t.name FROM payments p
       JOIN contracts c ON c.id = p.contract_id
       JOIN tenants   t ON t.id = c.tenant_id
      WHERE p.id = $1`,
    [paymentId]
  );
  return row?.name ?? "";
}
