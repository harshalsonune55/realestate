/**
 * Proves approval decisions and everything they cascade into reach Postgres
 * and survive a reconnect. Needs DATABASE_URL. Not part of `npm test`.
 *
 * Both outcomes are exercised on contracts this test creates itself, so no
 * real tenancy is decided. Everything is removed at the end.
 */
import assert from "node:assert";
import { pool } from "@/lib/db";
import { backend } from "@/lib/data";
import { decideApproval, findApproval } from "@/lib/repos/approvals";
import { createContract, findContract, findUnit } from "@/lib/repos/contracts";

async function reconnect() {
  await pool().end();
  (globalThis as Record<string, unknown>).__pmsPool = undefined;
}

async function fresh<T>(fn: () => Promise<T>): Promise<T> {
  const out = await fn();
  await reconnect();
  return out;
}

const stamp = Date.now();

async function makeContract(unitId: string, tenantId: string, userId: string, tag: string) {
  const now = new Date().toISOString();
  // Dated so the tenancy lands as `active`, not `expiring` — the branch under
  // test is the status rule, and this keeps it unambiguous.
  return createContract({
    unitId,
    existingTenantId: tenantId,
    startDate: "2026-09-01",
    endDate: "2027-08-31",
    termMonths: 12,
    annualRent: 90000,
    securityDeposit: 4500,
    commission: 0,
    ejariNo: `EJ-${tag}`,
    notes: "approval proof",
    cheques: [
      // Due immediately, so the "deposit soon" branch fires.
      { chequeNo: `AP${tag}A`, bank: "FAB", amount: 45000, dueDate: new Date().toISOString().slice(0, 10) },
      // Far out, so it must NOT get a task yet.
      { chequeNo: `AP${tag}B`, bank: "FAB", amount: 45000, dueDate: "2027-03-01" },
    ],
    docs: [{ key: "ejari", label: "Ejari certificate", provided: true }],
    createdBy: userId,
    createdByName: "Proof",
    now,
  });
}

async function approvalFor(contractId: string) {
  const { rows } = await pool().query(
    "SELECT * FROM approvals WHERE entity_type='contract' AND entity_id=$1",
    [contractId]
  );
  return rows[0];
}

async function main() {
  assert.strictEqual(backend(), "postgres", "DATABASE_URL must be set");

  const units = (
    await pool().query("SELECT id FROM units WHERE status='vacant' LIMIT 2")
  ).rows;
  assert.strictEqual(units.length, 2, "need two vacant units for this proof");
  const tenantId = (await pool().query("SELECT id FROM tenants LIMIT 1")).rows[0].id;
  const leasing = (await pool().query("SELECT id FROM users WHERE role='leasing' LIMIT 1")).rows[0].id;
  const manager = (await pool().query("SELECT id, name FROM users WHERE role='manager' LIMIT 1")).rows[0];
  await reconnect();

  /* ================================================================ approve */
  const yes = await fresh(() => makeContract(units[0].id, tenantId, leasing, `${stamp}Y`));
  const yesApproval = await fresh(() => approvalFor(yes.id));
  console.log(`1. tenancy submitted   ${yes.ref}, approval ${yesApproval.ref}`);

  await fresh(() =>
    decideApproval({
      approvalId: yesApproval.id,
      decision: "approved",
      note: "",
      actorId: manager.id,
      now: new Date().toISOString(),
    })
  );

  const decided = await fresh(() => findApproval(yesApproval.id));
  assert.strictEqual(decided!.status, "approved");
  assert.strictEqual(decided!.decidedBy, manager.id);
  assert.ok(decided!.decidedAt);
  console.log(`2. decision persisted  status=${decided!.status} by=${manager.name}`);

  const live = await fresh(() => findContract(yes.id));
  assert.strictEqual(live!.status, "active", "an approved tenancy did not go live");
  assert.strictEqual(live!.approvedBy, manager.id);
  const unit = await fresh(() => findUnit(units[0].id));
  assert.strictEqual(unit!.status, "occupied", "the unit was not marked occupied");
  console.log(`3. cascade applied     contract=${live!.status} unit=${unit!.status}`);

  const depositTasks = await fresh(async () => {
    const { rows } = await pool().query(
      `SELECT t.title, t.assigned_to FROM tasks t
         JOIN cheques c ON c.id = t.entity_id
        WHERE t.entity_type='cheque' AND c.contract_id=$1`,
      [yes.id]
    );
    return rows;
  });
  // Only the cheque due now earns a task; the one due in 2027 does not.
  assert.strictEqual(depositTasks.length, 1, "the wrong number of deposit tasks was raised");
  assert.ok(depositTasks[0].assigned_to, "deposit task has no assignee");
  console.log(`4. deposit task        1 of 2 cheques (only the one due now) → ${depositTasks[0].assigned_to}`);

  const renewalTask = await fresh(async () => {
    const { rows } = await pool().query(
      "SELECT title, due_date::text AS due_date FROM tasks WHERE entity_type='contract' AND entity_id=$1",
      [yes.id]
    );
    return rows[0];
  });
  assert.ok(String(renewalTask.title).startsWith("Start renewal"), "no renewal reminder was raised");
  assert.strictEqual(renewalTask.due_date, "2027-06-02", "renewal reminder is not 90 days before expiry");
  console.log(`5. renewal clock       "${renewalTask.title}" due ${renewalTask.due_date}`);

  const reviewClosed = await fresh(async () => {
    const { rows } = await pool().query(
      "SELECT status FROM tasks WHERE entity_type='approval' AND entity_id=$1",
      [yesApproval.id]
    );
    return rows[0];
  });
  assert.strictEqual(reviewClosed.status, "done", "the review task stayed open");
  console.log("6. review task closed  in the same transaction as the decision");

  // Deciding twice must be refused — the transition is not caller-controlled.
  await assert.rejects(
    () =>
      decideApproval({
        approvalId: yesApproval.id,
        decision: "rejected",
        note: "trying to overturn it",
        actorId: manager.id,
        now: new Date().toISOString(),
      }),
    "an already-decided approval was decided again"
  );
  await reconnect();
  assert.strictEqual((await fresh(() => findApproval(yesApproval.id)))!.status, "approved");
  console.log("7. re-decision refused decision stayed 'approved'");

  /* ================================================================= reject */
  const no = await fresh(() => makeContract(units[1].id, tenantId, leasing, `${stamp}N`));
  const noApproval = await fresh(() => approvalFor(no.id));
  await fresh(() =>
    decideApproval({
      approvalId: noApproval.id,
      decision: "rejected",
      note: "Rent above the approved band for this building.",
      actorId: manager.id,
      now: new Date().toISOString(),
    })
  );

  const rejected = await fresh(() => findContract(no.id));
  assert.strictEqual(rejected!.status, "rejected");
  const freed = await fresh(() => findUnit(units[1].id));
  assert.strictEqual(freed!.status, "vacant", "a rejected tenancy left the unit held");
  const cancelled = await fresh(async () => {
    const { rows } = await pool().query(
      "SELECT DISTINCT status FROM cheques WHERE contract_id=$1",
      [no.id]
    );
    return rows.map((r) => r.status);
  });
  assert.deepStrictEqual(cancelled, ["cancelled"], "cheques were not cancelled with the contract");
  const rework = await fresh(async () => {
    const { rows } = await pool().query(
      "SELECT title, detail FROM tasks WHERE entity_type='contract' AND entity_id=$1",
      [no.id]
    );
    return rows[0];
  });
  assert.match(String(rework.title), /^Rework rejected contract/);
  assert.strictEqual(rework.detail, "Rent above the approved band for this building.");
  console.log(`8. rejection cascade   contract=${rejected!.status} unit=${freed!.status} cheques=cancelled`);
  console.log(`9. rework task raised  "${rework.title}" carrying the reason`);

  /* ---------------------------------------------------------------- cleanup */
  const contractIds = [yes.id, no.id];
  const approvalIds = [yesApproval.id, noApproval.id];
  await pool().query(
    "DELETE FROM tasks WHERE entity_type='cheque' AND entity_id IN (SELECT id FROM cheques WHERE contract_id = ANY($1))",
    [contractIds]
  );
  await pool().query("DELETE FROM tasks WHERE entity_type='contract' AND entity_id = ANY($1)", [contractIds]);
  await pool().query("DELETE FROM tasks WHERE entity_type='approval' AND entity_id = ANY($1)", [approvalIds]);
  await pool().query("DELETE FROM approvals WHERE id = ANY($1)", [approvalIds]);
  await pool().query("DELETE FROM cheques WHERE contract_id = ANY($1)", [contractIds]);
  await pool().query("DELETE FROM contracts WHERE id = ANY($1)", [contractIds]);
  await pool().query("UPDATE units SET status='vacant' WHERE id = ANY($1)", [[units[0].id, units[1].id]]);
  await reconnect();
  assert.strictEqual(await findContract(yes.id), null);
  assert.strictEqual(await findContract(no.id), null);
  console.log(`10. cleaned up         ${yes.ref} and ${no.ref} removed, units back to vacant`);

  console.log("\nPASS — both decisions and their full cascades survived a fresh session.");
  await pool().end();
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
