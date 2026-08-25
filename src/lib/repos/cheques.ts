import "server-only";
import { q, q1, tx } from "../db";
import { backend } from "../data";
import { toCheque } from "../repo";
import { db as jsonDb, nextId as nextJsonId, write as jsonWrite , pickAssigneeJson } from "../store";
import { addDays, today } from "../utils";
import type { Cheque } from "../types";
import {
  ConflictError, assigneeFor, closeTasksFor, insertApproval, insertTask, nextRefIn,
} from "./shared";

/**
 * The cheque lifecycle: deposited → cleared, or deposited → bounced.
 *
 * Each step writes several tables at once — the cheque itself, the task that was
 * chasing it, and either a receipt or a replacement approval. In Postgres those
 * go inside one transaction, because a cleared cheque with no matching payment
 * row is money the accounts cannot see, and a payment with no cleared cheque is
 * money counted twice.
 *
 * Amounts arrive here in AED and are stored as integer fils; nothing in this
 * module puts a fractional value into the database.
 */

export async function findCheque(id: string): Promise<Cheque | null> {
  if (backend() === "json") return jsonDb().cheques.find((c) => c.id === id) ?? null;
  const row = await q1(
    "SELECT *, due_date::text AS due_date FROM cheques WHERE id = $1",
    [id]
  );
  return row ? toCheque(row) : null;
}

/** The tenant behind a cheque, for the wording of chase tasks and approvals. */
export async function chequeTenantName(chequeId: string): Promise<string> {
  if (backend() === "json") {
    const d = jsonDb();
    const cheque = d.cheques.find((c) => c.id === chequeId);
    const contract = d.contracts.find((c) => c.id === cheque?.contractId);
    return d.tenants.find((t) => t.id === contract?.tenantId)?.name ?? "";
  }
  const row = await q1<{ name: string }>(
    `SELECT t.name FROM cheques ch
       JOIN contracts c ON c.id = ch.contract_id
       JOIN tenants   t ON t.id = c.tenant_id
      WHERE ch.id = $1`,
    [chequeId]
  );
  return row?.name ?? "";
}

/* ---------------------------------------------------------------- deposit */

export interface DepositInput {
  chequeId: string;
  depositDate: string;
  depositSlipNo: string;
  bankAccount: string;
  userId: string;
  now: string;
}

export async function depositCheque(input: DepositInput): Promise<void> {
  if (backend() === "json") {
    jsonWrite((store) => {
      const c = store.cheques.find((x) => x.id === input.chequeId)!;
      c.status = "deposited";
      c.depositedAt = input.depositDate;
      c.depositedBy = input.userId;
      c.depositSlipNo = input.depositSlipNo;

      closeJsonTasks(store.tasks, "cheque", c.id, input.now);

      store.tasks.push({
        id: nextJsonId("task", "TK"),
        title: `Confirm clearance of cheque ${c.chequeNo}`,
        detail: `Deposited ${input.depositDate} into ${input.bankAccount}. Check the bank statement.`,
        assignedTo: input.userId,
        dueDate: addDays(input.depositDate, 3),
        status: "open",
        priority: "medium",
        entityType: "cheque",
        entityId: c.id,
        createdAt: input.now,
        source: "system",
      });
    });
    return;
  }

  await tx(async (c) => {
    // The status guard is repeated in SQL so two people pressing Deposit at the
    // same moment cannot both succeed; the second update matches no rows.
    const { rows } = await c.query(
      `UPDATE cheques
          SET status = 'deposited', deposited_at = $2, deposited_by = $3,
              deposit_slip_no = $4
        WHERE id = $1 AND status = 'pending'
        RETURNING cheque_no`,
      [input.chequeId, input.depositDate, input.userId, input.depositSlipNo]
    );
    if (rows.length === 0) throw new ConflictError("Cheque is no longer pending.");
    const chequeNo = String(rows[0].cheque_no);

    await closeTasksFor(c, "cheque", input.chequeId, input.now);

    // The job is not finished until the bank confirms clearance.
    await insertTask(c, {
      title: `Confirm clearance of cheque ${chequeNo}`,
      detail: `Deposited ${input.depositDate} into ${input.bankAccount}. Check the bank statement.`,
      assignedTo: input.userId,
      dueDate: addDays(input.depositDate, 3),
      status: "open",
      priority: "medium",
      entityType: "cheque",
      entityId: input.chequeId,
      createdAt: input.now,
    });
  });
}

/* ---------------------------------------------------------------- cleared */

export async function markChequeCleared(
  chequeId: string,
  userId: string,
  now: string
): Promise<void> {
  if (backend() === "json") {
    jsonWrite((store) => {
      const c = store.cheques.find((x) => x.id === chequeId)!;
      c.status = "cleared";
      c.clearedAt = today();
      closeJsonTasks(store.tasks, "cheque", c.id, now);

      const payId = nextJsonId("payment", "PY");
      store.payments.push({
        id: payId,
        receiptNo: `RCP-${payId.replace("PY", "").padStart(5, "0")}`,
        contractId: c.contractId,
        chequeId: c.id,
        amount: c.amount,
        method: "cheque",
        category: "rent",
        receivedAt: today(),
        receivedBy: userId,
        reference: `${c.bank} / ${c.chequeNo}`,
      });
    });
    return;
  }

  await tx(async (c) => {
    const { rows } = await c.query(
      `UPDATE cheques SET status = 'cleared', cleared_at = $2
        WHERE id = $1 AND status = 'deposited'
        RETURNING contract_id, amount, bank, cheque_no`,
      [chequeId, today()]
    );
    if (rows.length === 0) throw new ConflictError("Only a deposited cheque can clear.");
    const ch = rows[0];

    await closeTasksFor(c, "cheque", chequeId, now);

    const receiptNo = await nextRefIn(c, "receipt", (n) => `RCP-${String(n).padStart(5, "0")}`);

    // unit_id is denormalised onto the payment so per-unit income does not have
    // to reach back through a contract that may later be terminated.
    await c.query(
      `INSERT INTO payments
         (receipt_no, contract_id, unit_id, cheque_id, amount, method, category,
          received_at, received_by, reference)
       VALUES ($1, $2, (SELECT unit_id FROM contracts WHERE id = $2), $3, $4,
               'cheque', 'rent', $5, $6, $7)`,
      [
        receiptNo, ch.contract_id, chequeId, ch.amount, today(), userId,
        `${ch.bank} / ${ch.cheque_no}`,
      ]
    );
  });
}

/* ----------------------------------------------------------------- bounce */

export interface BounceInput {
  chequeId: string;
  returnDate: string;
  reason: string;
  replacementRequired: boolean;
  replacementDeadline: string;
  userId: string;
  tenantName: string;
  now: string;
}

export async function reportChequeBounce(input: BounceInput): Promise<void> {
  if (backend() === "json") {
    jsonWrite((store) => {
      const c = store.cheques.find((x) => x.id === input.chequeId)!;
      c.status = "bounced";
      c.bouncedAt = input.returnDate;
      c.bounceReason = input.reason;
      closeJsonTasks(store.tasks, "cheque", c.id, input.now);

      store.tasks.push({
        id: nextJsonId("task", "TK"),
        title: `Collect replacement for bounced cheque ${c.chequeNo}`,
        detail: `${input.tenantName || "Tenant"} · ${input.reason} · AED ${c.amount.toLocaleString("en-US")}`,
        assignedTo: input.userId,
        dueDate: input.replacementDeadline || addDays(input.returnDate, 3),
        status: "open",
        priority: "high",
        entityType: "cheque",
        entityId: c.id,
        createdAt: input.now,
        source: "system",
      });

      if (input.replacementRequired) {
        const apId = nextJsonId("approval", "AP");
        const ref = `APR-${apId.replace("AP", "").padStart(4, "0")}`;
        store.approvals.push({
          id: apId,
          ref,
          type: "cheque_replacement",
          title: `Replace bounced cheque ${c.chequeNo}`,
          summary: `${input.tenantName} · ${c.bank} · AED ${c.amount.toLocaleString("en-US")} · ${input.reason}`,
          entityType: "cheque",
          entityId: c.id,
          amount: c.amount,
          requestedBy: input.userId,
          requestedAt: input.now,
          status: "pending",
        });
        store.tasks.push({
          id: nextJsonId("task", "TK"),
          title: `Review approval ${ref}`,
          detail: `Replacement cheque for ${input.tenantName || "tenant"}`,
          assignedTo: pickAssigneeJson(["manager", "admin"]) ?? "",
          dueDate: addDays(today(), 2),
          status: "open",
          priority: "high",
          entityType: "approval",
          entityId: apId,
          createdAt: input.now,
          source: "system",
        });
      }
    });
    return;
  }

  await tx(async (c) => {
    const { rows } = await c.query(
      `UPDATE cheques
          SET status = 'bounced', bounced_at = $2, bounce_reason = $3
        WHERE id = $1 AND status = 'deposited'
        RETURNING cheque_no, bank, amount`,
      [input.chequeId, input.returnDate, input.reason]
    );
    if (rows.length === 0) throw new ConflictError("Only a deposited cheque can be returned.");
    const ch = rows[0];
    const aed = Number(ch.amount) / 100;

    await closeTasksFor(c, "cheque", input.chequeId, input.now);

    // Chasing the replacement is a tracked task, not a note in someone's head.
    await insertTask(c, {
      title: `Collect replacement for bounced cheque ${ch.cheque_no}`,
      detail: `${input.tenantName || "Tenant"} · ${input.reason} · AED ${aed.toLocaleString("en-US")}`,
      assignedTo: input.userId,
      dueDate: input.replacementDeadline || addDays(input.returnDate, 3),
      status: "open",
      priority: "high",
      entityType: "cheque",
      entityId: input.chequeId,
      createdAt: input.now,
    });

    if (input.replacementRequired) {
      const ref = await nextRefIn(c, "approval", (n) => `APR-${String(n).padStart(4, "0")}`);
      const approvalId = await insertApproval(c, {
        ref,
        type: "cheque_replacement",
        title: `Replace bounced cheque ${ch.cheque_no}`,
        summary: `${input.tenantName} · ${ch.bank} · AED ${aed.toLocaleString("en-US")} · ${input.reason}`,
        entityType: "cheque",
        entityId: input.chequeId,
        amount: Number(ch.amount),
        requestedBy: input.userId,
        requestedAt: input.now,
      });
      await insertTask(c, {
        title: `Review approval ${ref}`,
        detail: `Replacement cheque for ${input.tenantName || "tenant"}`,
        assignedTo: await assigneeFor(c, ["manager", "admin"]),
        dueDate: addDays(today(), 2),
        status: "open",
        priority: "high",
        entityType: "approval",
        entityId: approvalId,
        createdAt: input.now,
      });
    }
  });
}

/* -------------------------------------------------------------- json only */

/** Mirrors {@link closeTasksFor} for the in-memory store. */
function closeJsonTasks(
  tasks: { entityId?: string; entityType?: string; status: string; completedAt?: string }[],
  entityType: string,
  entityId: string,
  at: string
) {
  tasks
    .filter((t) => t.entityId === entityId && t.entityType === entityType && t.status !== "done")
    .forEach((t) => {
      t.status = "done";
      t.completedAt = at;
    });
}

/* ------------------------------------------------------------ odoo mirror */

/** The Odoo mirror state a cheque carries. Mirrors {@link TaskSyncPatch}. */
export interface ChequeSyncPatch {
  odooPaymentId?: number | null;
  odooSyncedAt?: string | null;
  odooError?: string | null;
}

const CHEQUE_SYNC_COLUMN: Record<keyof ChequeSyncPatch, string> = {
  odooPaymentId: "odoo_payment_id",
  odooSyncedAt: "odoo_synced_at",
  odooError: "odoo_error",
};

export async function updateChequeSync(id: string, patch: ChequeSyncPatch): Promise<void> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;

  if (backend() === "json") {
    jsonWrite((store) => {
      const c = store.cheques.find((x) => x.id === id) as Record<string, unknown> | undefined;
      if (!c) return;
      for (const [k, v] of entries) {
        if (v === null) delete c[k];
        else c[k] = v;
      }
    });
    return;
  }

  const sets = entries.map(([k], i) => `${CHEQUE_SYNC_COLUMN[k as keyof ChequeSyncPatch]} = $${i + 2}`);
  await q(`UPDATE cheques SET ${sets.join(", ")} WHERE id = $1`, [id, ...entries.map(([, v]) => v)]);
}

/** Cheques never pushed to Odoo, newest-due first. See {@link unsyncedTasks}. */
export async function unsyncedCheques(limit = 25): Promise<Cheque[]> {
  if (backend() === "json") {
    return (jsonDb().cheques as (Cheque & { odooPaymentId?: number; odooError?: string })[])
      .filter((c) => c.odooPaymentId == null && c.odooError == null)
      .slice(0, limit);
  }
  const rows = await q(
    `SELECT *, due_date::text AS due_date FROM cheques
      WHERE odoo_payment_id IS NULL AND odoo_error IS NULL
      ORDER BY cheques.due_date DESC LIMIT $1`,
    [limit]
  );
  return rows.map(toCheque);
}

/** Tenant name behind a cheque, for the Odoo payment's partner + memo. */
export async function chequeMemoContext(
  chequeId: string
): Promise<{ tenantName: string; contractRef: string } | null> {
  if (backend() === "json") {
    const d = jsonDb();
    const cheque = d.cheques.find((c) => c.id === chequeId);
    const contract = d.contracts.find((c) => c.id === cheque?.contractId);
    const tenant = d.tenants.find((t) => t.id === contract?.tenantId);
    return { tenantName: tenant?.name ?? "", contractRef: contract?.ref ?? "" };
  }
  const row = await q1<{ tenant_name: string; ref: string }>(
    `SELECT t.name AS tenant_name, c.ref
       FROM cheques ch
       JOIN contracts c ON c.id = ch.contract_id
       JOIN tenants   t ON t.id = c.tenant_id
      WHERE ch.id = $1`,
    [chequeId]
  );
  return row ? { tenantName: row.tenant_name, contractRef: row.ref } : null;
}
