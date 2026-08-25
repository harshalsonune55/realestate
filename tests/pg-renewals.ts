/**
 * Proves renewals and non-renewals reach Postgres and survive a reconnect.
 * Needs DATABASE_URL. Not part of `npm test`.
 *
 * Runs against a seeded active tenancy without altering it — a renewal creates
 * a second contract linked back to the first, and the original must come
 * through untouched. Everything created here is removed at the end.
 */
import assert from "node:assert";
import { pool } from "@/lib/db";
import { backend } from "@/lib/data";
import { findContract } from "@/lib/repos/contracts";
import { renewalContext, submitNonRenewal, submitRenewal } from "@/lib/repos/renewals";

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
  const stamp = Date.now();
  const now = new Date().toISOString();

  const picks = (
    await pool().query(
      "SELECT id FROM contracts WHERE status IN ('active','expiring') ORDER BY end_date LIMIT 2"
    )
  ).rows;
  assert.strictEqual(picks.length, 2, "need two live tenancies for this proof");
  const [renewMe, leaveMe] = picks;
  const userId = (await pool().query("SELECT id, name FROM users WHERE role='leasing' LIMIT 1")).rows[0];
  await reconnect();

  /* =============================================================== renewal */
  const old = await fresh(() => findContract(renewMe.id));
  const ctx = await fresh(() => renewalContext(renewMe.id));
  assert.ok(ctx, "renewal context could not be resolved");
  console.log(`1. renewing            ${old!.ref} — ${ctx!.tenantName}, unit ${ctx!.unitNo}`);

  const newRent = old!.annualRent + 5000;
  const created = await fresh(() =>
    submitRenewal({
      previousId: old!.id,
      previousRef: old!.ref,
      unitId: ctx!.unitId,
      unitNo: ctx!.unitNo,
      propertyName: ctx!.propertyName,
      tenantId: ctx!.tenantId,
      tenantName: ctx!.tenantName,
      startDate: "2027-01-01",
      endDate: "2027-12-31",
      termMonths: 12,
      previousRent: old!.annualRent,
      newRent,
      securityDeposit: old!.securityDeposit,
      ejariNo: old!.ejariNo,
      notes: "renewal persistence proof",
      cheques: [
        { chequeNo: `RN${stamp}A`, bank: "ADCB", amount: newRent / 2, dueDate: "2027-01-01" },
        { chequeNo: `RN${stamp}B`, bank: "ADCB", amount: newRent / 2, dueDate: "2027-07-01" },
      ],
      docs: [{ key: "ejari", label: "Ejari renewal", provided: true }],
      createdBy: userId.id,
      createdByName: userId.name,
      now,
    })
  );
  console.log(`2. renewal submitted   ${created.ref}`);

  const renewed = await fresh(() => findContract(created.id));
  assert.ok(renewed, "renewal missing after reconnect");
  assert.strictEqual(renewed!.status, "pending_approval", "a renewal must go through approval too");
  assert.strictEqual(renewed!.renewedFromId, old!.id, "the link back to the previous tenancy was lost");
  assert.strictEqual(renewed!.tenantId, old!.tenantId, "renewal changed the tenant");
  assert.strictEqual(renewed!.unitId, old!.unitId, "renewal changed the unit");
  assert.strictEqual(renewed!.annualRent, newRent, "new rent did not round-trip exactly");
  assert.strictEqual(renewed!.securityDeposit, old!.securityDeposit, "deposit was not carried over");
  assert.strictEqual(renewed!.commission, 0, "a renewal charges no commission");
  assert.strictEqual(renewed!.startDate, "2027-01-01");
  assert.strictEqual(renewed!.endDate, "2027-12-31");
  console.log(`3. survived reconnect  status=${renewed!.status} rent=${old!.annualRent}→${renewed!.annualRent} renewedFrom=${old!.ref}`);

  // The original must be exactly as it was signed.
  const untouched = await fresh(() => findContract(old!.id));
  assert.strictEqual(untouched!.status, old!.status, "the previous tenancy was modified");
  assert.strictEqual(untouched!.annualRent, old!.annualRent);
  assert.strictEqual(untouched!.endDate, old!.endDate);
  console.log(`4. original intact     ${untouched!.ref} still ${untouched!.status} at ${untouched!.annualRent}`);

  const cheques = await fresh(async () => {
    const { rows } = await pool().query(
      "SELECT * FROM cheques WHERE contract_id=$1 ORDER BY seq",
      [created.id]
    );
    return rows;
  });
  assert.strictEqual(cheques.length, 2);
  assert.strictEqual(String(cheques[0].amount), String(Math.round((newRent / 2) * 100)));
  console.log(`5. cheques persisted   ${cheques.length} cheques, ${cheques[0].amount} fils each`);

  const renewalApproval = await fresh(async () => {
    const { rows } = await pool().query(
      "SELECT * FROM approvals WHERE entity_type='contract' AND entity_id=$1",
      [created.id]
    );
    return rows[0];
  });
  assert.ok(renewalApproval, "no renewal approval was raised");
  assert.strictEqual(renewalApproval.type, "renewal");
  assert.match(String(renewalApproval.summary), /→ AED/);
  console.log(`6. approval raised     ${renewalApproval.ref} — ${renewalApproval.summary}`);

  const reminderClosed = await fresh(async () => {
    const { rows } = await pool().query(
      "SELECT count(*)::int AS n FROM tasks WHERE entity_type='contract' AND entity_id=$1 AND status<>'done'",
      [old!.id]
    );
    return rows[0].n;
  });
  assert.strictEqual(reminderClosed, 0, "the renewal reminder that started this stayed open");
  console.log("7. reminder closed     nothing left telling anyone to start this renewal");

  /* =========================================================== non-renewal */
  const leaving = await fresh(() => findContract(leaveMe.id));
  const leavingCtx = await fresh(() => renewalContext(leaveMe.id));
  await fresh(() =>
    submitNonRenewal({
      contractId: leaving!.id,
      unitNo: leavingCtx!.unitNo,
      propertyName: leavingCtx!.propertyName,
      tenantName: leavingCtx!.tenantName,
      endDate: leaving!.endDate,
      securityDeposit: leaving!.securityDeposit,
      reason: "Tenant relocating abroad",
      requestedBy: userId.id,
      now: new Date().toISOString(),
    })
  );

  const term = await fresh(async () => {
    const { rows } = await pool().query(
      "SELECT * FROM approvals WHERE entity_type='contract' AND entity_id=$1 AND type='contract_termination'",
      [leaving!.id]
    );
    return rows[0];
  });
  assert.ok(term, "no termination approval was raised");
  assert.strictEqual(term.status, "pending");
  assert.strictEqual(String(term.amount), String(Math.round(leaving!.securityDeposit * 100)));
  const moveOut = await fresh(async () => {
    const { rows } = await pool().query(
      "SELECT title, assigned_to, due_date::text AS due_date FROM tasks WHERE entity_type='contract' AND entity_id=$1 AND title LIKE 'Move-out%'",
      [leaving!.id]
    );
    return rows[0];
  });
  assert.ok(moveOut, "no move-out inspection was raised");
  assert.ok(moveOut.assigned_to, "move-out inspection has no assignee");
  assert.strictEqual(moveOut.due_date, leaving!.endDate, "inspection is not due on the end date");
  console.log(`8. non-renewal         ${term.ref} pending, move-out due ${moveOut.due_date}`);

  // The tenancy itself is untouched until the approval is decided.
  const stillLive = await fresh(() => findContract(leaving!.id));
  assert.strictEqual(stillLive!.status, leaving!.status, "the tenancy ended before the approval was decided");
  console.log(`9. still live          ${stillLive!.ref} remains ${stillLive!.status} pending the decision`);

  /* ---------------------------------------------------------------- cleanup */
  await pool().query(
    "DELETE FROM tasks WHERE entity_type='approval' AND entity_id IN ($1, $2)",
    [renewalApproval.id, term.id]
  );
  await pool().query("DELETE FROM tasks WHERE entity_type='contract' AND entity_id=$1 AND title LIKE 'Move-out%'", [leaving!.id]);
  await pool().query("DELETE FROM approvals WHERE id IN ($1, $2)", [renewalApproval.id, term.id]);
  await pool().query("DELETE FROM cheques WHERE contract_id=$1", [created.id]);
  await pool().query("DELETE FROM contracts WHERE id=$1", [created.id]);
  await reconnect();
  assert.strictEqual(await findContract(created.id), null, "test renewal was not removed");
  console.log(`10. cleaned up         ${created.ref} and both approvals removed`);
  console.log(
    `    NOTE: the renewal reminder tasks on ${old!.ref} were closed by the renewal and are left closed.`
  );

  console.log("\nPASS — renewal and non-renewal both survived a fresh session.");
  await pool().end();
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
