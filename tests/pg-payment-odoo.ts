/**
 * Cheque + receipt ↔ Odoo mirror regression. Needs DATABASE_URL; no Odoo creds.
 * Runs the real sync code against the stand-in Odoo (tests/fake-odoo.ts).
 *
 * Rule under test: Postgres is the source of truth; a cheque/receipt is mirrored
 * to a draft account.payment whose id it keeps for life, and no Odoo outage may
 * lose a financial row or duplicate it in the ledger.
 */
import assert from "node:assert";
import { pool } from "@/lib/db";
import { backend } from "@/lib/data";
import { startFakeOdoo } from "./fake-odoo";

async function reconnect() {
  await pool().end();
  (globalThis as Record<string, unknown>).__pmsPool = undefined;
}

async function main() {
  assert.strictEqual(backend(), "postgres", "DATABASE_URL must be set");
  const odoo = await startFakeOdoo();
  process.env.ODOO_URL = odoo.url;
  process.env.ODOO_DB = "almanara_test";
  process.env.ODOO_USERNAME = "integration@test.local";
  process.env.ODOO_API_KEY = "fake-key-not-a-secret";

  const sync = await import("@/lib/actions/payment-sync");
  const cheques = await import("@/lib/repos/cheques");

  // Two pending cheques, reset to unsynced so this test is self-sufficient even
  // after a full backfill has stamped everything.
  const picked = (
    await pool().query("SELECT id FROM cheques WHERE status='pending' ORDER BY due_date LIMIT 2")
  ).rows;
  await pool().query(
    "UPDATE cheques SET odoo_payment_id=NULL, odoo_synced_at=NULL, odoo_error=NULL WHERE id = ANY($1)",
    [picked.map((r) => r.id)]
  );
  const chequeId = picked[0].id;
  const original = await cheques.findCheque(chequeId);
  await reconnect();

  /* 1 --------------------------------------------- mirror cheque → payment */
  const first = await sync.syncChequeById(chequeId);
  assert.ok(first.synced && first.odooPaymentId, "cheque did not mirror");
  await reconnect();
  const afterCreate = await cheques.findCheque(chequeId);
  assert.strictEqual(afterCreate!.odooPaymentId, first.odooPaymentId, "Odoo id did not persist");
  assert.strictEqual(afterCreate!.odooError, undefined);
  const rec = odoo.store.get("account.payment")!.get(first.odooPaymentId!)!;
  assert.strictEqual(rec.payment_type, "inbound");
  assert.strictEqual(rec.partner_type, "customer");
  assert.strictEqual(Number(rec.amount), original!.amount, "amount did not round-trip");
  assert.match(String(rec.memo), /^PMS Cheque .* status: pending/);
  assert.ok(rec.partner_id, "cheque payment not attributed to a tenant partner");
  console.log(`1. cheque mirrored     account.payment id=${first.odooPaymentId} amount=${rec.amount} "${rec.memo}"`);

  const carrier = odoo.store.get("res.partner");
  assert.ok((carrier?.size ?? 0) >= 1, "no tenant partner was found or created");
  console.log(`2. tenant partner      ${carrier!.size} partner(s) resolved`);

  /* 3 -------------------------------- status change updates the SAME record */
  await pool().query("UPDATE cheques SET status='deposited', deposited_at=now() WHERE id=$1", [chequeId]);
  await reconnect();
  const second = await sync.syncChequeById(chequeId);
  assert.strictEqual(second.odooPaymentId, first.odooPaymentId, "status change created a SECOND payment");
  assert.strictEqual(odoo.countOf("account.payment"), 1, "duplicate payment in the ledger");
  assert.match(String(odoo.store.get("account.payment")!.get(first.odooPaymentId!)!.memo), /status: deposited/);
  console.log(`3. deposited → same id ${second.odooPaymentId}, 1 record, memo now "…deposited"`);

  /* 4 --------------------------------------------------- outage loses nothing */
  const other = picked[1].id;
  odoo.failNext = { count: 1, kind: "server" };
  const failed = await sync.syncChequeById(other);
  assert.strictEqual(failed.synced, false, "a 502 was reported as success");
  await reconnect();
  const stranded = await cheques.findCheque(other);
  assert.ok(stranded, "THE CHEQUE WAS LOST when Odoo failed");
  assert.strictEqual(stranded!.odooPaymentId, undefined);
  assert.ok(stranded!.odooError, "the failure was not recorded");
  console.log(`4. outage survived     cheque intact, odooError="${stranded!.odooError!.slice(0, 40)}…"`);

  /* 5 ------------------------------------------ retry heals, no duplicate */
  const before = odoo.countOf("account.payment");
  const retried = await sync.retryChequeSync(other);
  assert.ok(retried.synced, "retry did not succeed");
  assert.strictEqual(odoo.countOf("account.payment"), before + 1, "retry duplicated a payment");
  await reconnect();
  assert.strictEqual((await cheques.findCheque(other))!.odooError, undefined);
  console.log(`5. retry healed        id=${retried.odooPaymentId}, error cleared, no duplicate`);

  /* 6 -------------------------------------- receipt mirror on a fresh row */
  const contractId = original!.contractId;
  const receiptId = (
    await pool().query(
      `INSERT INTO payments (receipt_no, contract_id, cheque_id, amount, method, category, received_at, reference)
       VALUES ('RCP-PROOF1', $1, $2, 990000, 'cheque', 'rent', now(), 'FAB / PROOF')
       RETURNING id`,
      [contractId, chequeId]
    )
  ).rows[0].id;
  await reconnect();
  const rsync = await sync.syncPaymentById(receiptId);
  assert.ok(rsync.synced && rsync.odooPaymentId, "receipt did not mirror");
  const rrec = odoo.store.get("account.payment")!.get(rsync.odooPaymentId!)!;
  assert.match(String(rrec.memo), /^PMS Receipt RCP-PROOF1/);
  assert.strictEqual(Number(rrec.amount), 9900, "receipt amount wrong (fils vs AED)");
  console.log(`6. receipt mirrored    account.payment id=${rsync.odooPaymentId} "${rrec.memo}"`);

  /* -------------------------------------------------------------- cleanup */
  await pool().query("DELETE FROM payments WHERE id=$1", [receiptId]);
  await pool().query(
    `UPDATE cheques SET status='pending', deposited_at=NULL,
       odoo_payment_id=NULL, odoo_synced_at=NULL, odoo_error=NULL WHERE id=ANY($1)`,
    [[chequeId, other]]
  );
  await reconnect();
  console.log("7. cleaned up          cheques reset, proof receipt removed");

  await odoo.close();
  await pool().end();
  console.log("\nPASS — cheque + receipt mirror: create, status-update, outage, retry, no duplicates.");
}

main().catch((e) => { console.error("FAIL", e); process.exit(1); });
