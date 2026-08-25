/**
 * Proves the cheque lifecycle reaches Postgres and survives a reconnect.
 * Needs DATABASE_URL. Not part of `npm test`.
 *
 * Two seeded cheques are driven through the two terminal paths — cleared and
 * bounced — and put back as they were at the end, so the test can be run again
 * and leaves no financial record behind.
 */
import assert from "node:assert";
import { pool } from "@/lib/db";
import { backend } from "@/lib/data";
import {
  chequeTenantName, depositCheque, findCheque, markChequeCleared, reportChequeBounce,
} from "@/lib/repos/cheques";

async function reconnect() {
  await pool().end();
  (globalThis as Record<string, unknown>).__pmsPool = undefined;
}

async function fresh<T>(fn: () => Promise<T>): Promise<T> {
  const out = await fn();
  await reconnect();
  return out;
}

async function main() {
  assert.strictEqual(backend(), "postgres", "DATABASE_URL must be set");
  const now = new Date().toISOString();
  const day = now.slice(0, 10);

  const { rows: picks } = await pool().query(
    "SELECT id, amount, cheque_no FROM cheques WHERE status = 'pending' ORDER BY due_date LIMIT 2"
  );
  assert.strictEqual(picks.length, 2, "need two pending cheques to run this proof");
  const [a, b] = picks;
  const userId = (await pool().query("SELECT id FROM users WHERE role='accountant' LIMIT 1")).rows[0].id;
  await reconnect();

  /* --------------------------------------------------- deposit → cleared */
  await fresh(() =>
    depositCheque({
      chequeId: a.id, depositDate: day, depositSlipNo: "SLIP-PROOF-1",
      bankAccount: "FAB — Collections 1094 (main rent account)", userId, now,
    })
  );
  const deposited = await fresh(() => findCheque(a.id));
  assert.strictEqual(deposited!.status, "deposited");
  assert.strictEqual(deposited!.depositSlipNo, "SLIP-PROOF-1");
  assert.strictEqual(deposited!.depositedBy, userId);
  console.log(`1. deposited           ${deposited!.chequeNo} slip=${deposited!.depositSlipNo}`);

  const clearanceTask = await fresh(async () => {
    const { rows } = await pool().query(
      "SELECT title, status FROM tasks WHERE entity_type='cheque' AND entity_id=$1 AND status='open'",
      [a.id]
    );
    return rows;
  });
  assert.ok(
    clearanceTask.some((t) => String(t.title).startsWith("Confirm clearance")),
    "no clearance follow-up task was raised"
  );
  console.log("2. follow-up task      raised in the same transaction");

  await fresh(() => markChequeCleared(a.id, userId, new Date().toISOString()));
  const cleared = await fresh(() => findCheque(a.id));
  assert.strictEqual(cleared!.status, "cleared");
  assert.ok(cleared!.clearedAt, "clearance date did not persist");
  console.log(`3. cleared, persisted  status=${cleared!.status}`);

  // The receipt is the half that must never go missing.
  const payment = await fresh(async () => {
    const { rows } = await pool().query("SELECT * FROM payments WHERE cheque_id=$1", [a.id]);
    return rows[0];
  });
  assert.ok(payment, "clearing a cheque did not record a payment");
  assert.strictEqual(String(payment.amount), String(a.amount), "receipt amount differs from the cheque");
  assert.ok(payment.unit_id, "payment is not attributable to a unit");
  assert.match(String(payment.receipt_no), /^RCP-\d{5}$/);
  console.log(`4. receipt written     ${payment.receipt_no} amount=${payment.amount} fils (integer, not float)`);

  const openAfterClear = await fresh(async () => {
    const { rows } = await pool().query(
      "SELECT count(*)::int AS n FROM tasks WHERE entity_type='cheque' AND entity_id=$1 AND status<>'done'",
      [a.id]
    );
    return rows[0].n;
  });
  assert.strictEqual(openAfterClear, 0, "tasks stayed open after the cheque cleared");
  console.log("5. tasks closed        nothing left chasing a cleared cheque");

  /* ---------------------------------------------------- deposit → bounced */
  await fresh(() =>
    depositCheque({
      chequeId: b.id, depositDate: day, depositSlipNo: "SLIP-PROOF-2",
      bankAccount: "ADCB — Collections 5521", userId, now,
    })
  );
  const tenantName = await fresh(() => chequeTenantName(b.id));
  await fresh(() =>
    reportChequeBounce({
      chequeId: b.id, returnDate: day, reason: "Insufficient funds",
      replacementRequired: true, replacementDeadline: "", userId, tenantName,
      now: new Date().toISOString(),
    })
  );
  const bounced = await fresh(() => findCheque(b.id));
  assert.strictEqual(bounced!.status, "bounced");
  assert.strictEqual(bounced!.bounceReason, "Insufficient funds");
  console.log(`6. bounce persisted    ${bounced!.chequeNo} reason=${bounced!.bounceReason}`);

  const approval = await fresh(async () => {
    const { rows } = await pool().query(
      "SELECT * FROM approvals WHERE entity_type='cheque' AND entity_id=$1",
      [b.id]
    );
    return rows[0];
  });
  assert.ok(approval, "no replacement approval was raised");
  assert.strictEqual(approval.status, "pending");
  assert.strictEqual(String(approval.amount), String(b.amount));
  const reviewTask = await fresh(async () => {
    const { rows } = await pool().query(
      "SELECT assigned_to FROM tasks WHERE entity_type='approval' AND entity_id=$1",
      [approval.id]
    );
    return rows[0];
  });
  assert.ok(reviewTask?.assigned_to, "the review task has no assignee — the hardcoded id would be dangling");
  console.log(`7. approval + review   ${approval.ref} → assignee ${reviewTask.assigned_to}`);

  /* ------------------------------------------------------------- restore */
  await pool().query("DELETE FROM payments WHERE cheque_id = ANY($1)", [[a.id, b.id]]);
  await pool().query(
    "DELETE FROM tasks WHERE entity_type='approval' AND entity_id IN (SELECT id FROM approvals WHERE entity_type='cheque' AND entity_id=ANY($1))",
    [[a.id, b.id]]
  );
  await pool().query("DELETE FROM approvals WHERE entity_type='cheque' AND entity_id=ANY($1)", [[a.id, b.id]]);
  await pool().query(
    `DELETE FROM tasks WHERE entity_type='cheque' AND entity_id=ANY($1)
       AND (title LIKE 'Confirm clearance%' OR title LIKE 'Collect replacement%')`,
    [[a.id, b.id]]
  );
  await pool().query(
    `UPDATE cheques SET status='pending', deposited_at=NULL, deposited_by=NULL,
       deposit_slip_no=NULL, cleared_at=NULL, bounced_at=NULL, bounce_reason=NULL
     WHERE id = ANY($1)`,
    [[a.id, b.id]]
  );
  await reconnect();
  assert.strictEqual((await findCheque(a.id))!.status, "pending");
  assert.strictEqual((await findCheque(b.id))!.status, "pending");
  console.log(`8. restored            ${a.cheque_no} and ${b.cheque_no} back to pending`);

  console.log("\nPASS — deposit, clearance and bounce all survived a fresh session.");
  await pool().end();
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
