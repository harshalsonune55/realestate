/**
 * Proves a new tenancy reaches Postgres whole and survives a reconnect.
 * Needs DATABASE_URL. Not part of `npm test`.
 *
 * The contract, its tenant, its cheque schedule, the unit hold and the approval
 * are all created by one call; this checks every one of them is still there
 * after the pool is thrown away, then removes them.
 */
import assert from "node:assert";
import { pool } from "@/lib/db";
import { backend } from "@/lib/data";
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

async function main() {
  assert.strictEqual(backend(), "postgres", "DATABASE_URL must be set");
  const now = new Date().toISOString();
  const stamp = Date.now();

  const unitId = (
    await pool().query("SELECT id FROM units WHERE status = 'vacant' LIMIT 1")
  ).rows[0].id;
  const userId = (await pool().query("SELECT id, name FROM users WHERE role='leasing' LIMIT 1")).rows[0];
  await reconnect();

  const created = await fresh(() =>
    createContract({
      unitId,
      newTenant: {
        name: `Cutover Proof Tenant ${stamp}`,
        kind: "individual",
        emiratesId: "784-1990-1234567-1",
        passportNo: "P1234567",
        nationality: "United Arab Emirates",
        phone: "+971500000456",
        email: `proof.${stamp}@example.ae`,
      },
      startDate: "2026-09-01",
      endDate: "2027-08-31",
      termMonths: 12,
      annualRent: 120000,
      securityDeposit: 6000,
      commission: 2500,
      ejariNo: `EJ-${stamp}`,
      notes: "persistence proof",
      cheques: [
        { chequeNo: `PRF${stamp}A`, bank: "FAB", amount: 60000, dueDate: "2026-09-01" },
        { chequeNo: `PRF${stamp}B`, bank: "FAB", amount: 60000, dueDate: "2027-03-01" },
      ],
      docs: [
        { key: "ejari", label: "Ejari certificate", provided: true },
        { key: "passport", label: "Passport copy", provided: false },
      ],
      createdBy: userId.id,
      createdByName: userId.name,
      now,
    })
  );
  console.log(`1. tenancy created     ${created.ref}  ${created.id}`);
  assert.match(created.ref, /^CTR-2026-\d{4}$/);

  /* ------------------------------------------------ read back cold */
  const contract = await fresh(() => findContract(created.id));
  assert.ok(contract, "contract missing after reconnect");
  assert.strictEqual(contract!.status, "pending_approval", "a contract must never go live on its own");
  // Dates must survive as written: a tenancy starting 2026-09-01 in Dubai must
  // not read back as 2026-08-31 because the server is on UTC.
  assert.strictEqual(contract!.startDate, "2026-09-01");
  assert.strictEqual(contract!.endDate, "2027-08-31");
  assert.strictEqual(contract!.annualRent, 120000, "money did not round-trip exactly");
  assert.strictEqual(contract!.securityDeposit, 6000);
  assert.strictEqual(contract!.commission, 2500);
  assert.strictEqual(contract!.chequeCount, 2);
  assert.strictEqual(contract!.documents.length, 2);
  assert.strictEqual(contract!.documents[0].provided, true);
  console.log(`2. survived reconnect  status=${contract!.status} rent=${contract!.annualRent} ${contract!.startDate}→${contract!.endDate}`);

  const tenant = await fresh(async () => {
    const { rows } = await pool().query("SELECT * FROM tenants WHERE id=$1", [contract!.tenantId]);
    return rows[0];
  });
  assert.ok(tenant, "tenant record was not written");
  assert.strictEqual(tenant.name, `Cutover Proof Tenant ${stamp}`);
  console.log(`3. tenant linked       ${tenant.name}`);

  const cheques = await fresh(async () => {
    const { rows } = await pool().query(
      "SELECT * FROM cheques WHERE contract_id=$1 ORDER BY seq",
      [created.id]
    );
    return rows;
  });
  assert.strictEqual(cheques.length, 2, "cheque schedule did not persist");
  assert.strictEqual(String(cheques[0].amount), "6000000", "cheque amount is not integer fils");
  assert.strictEqual(cheques[0].seq, 1);
  assert.strictEqual(cheques[0].of_total, 2);
  assert.strictEqual(cheques[0].status, "pending");
  console.log(`4. cheques persisted   ${cheques.length} cheques, ${cheques[0].amount} fils each`);

  const unit = await fresh(() => findUnit(unitId));
  assert.strictEqual(unit!.status, "reserved", "the unit was not held — it could be leased twice");
  console.log(`5. unit held           ${unit!.unitNo} → ${unit!.status}`);

  const approval = await fresh(async () => {
    const { rows } = await pool().query(
      "SELECT * FROM approvals WHERE entity_type='contract' AND entity_id=$1",
      [created.id]
    );
    return rows[0];
  });
  assert.ok(approval, "no approval was raised");
  assert.strictEqual(approval.status, "pending");
  assert.strictEqual(String(approval.amount), "12000000");
  const task = await fresh(async () => {
    const { rows } = await pool().query(
      "SELECT assigned_to, status FROM tasks WHERE entity_type='approval' AND entity_id=$1",
      [approval.id]
    );
    return rows[0];
  });
  assert.ok(task?.assigned_to, "review task has no assignee");
  console.log(`6. approval + review   ${approval.ref} → assignee ${task.assigned_to}`);

  /* ---------------------------------------------------------- cleanup */
  await pool().query("DELETE FROM tasks WHERE entity_type='approval' AND entity_id=$1", [approval.id]);
  await pool().query("DELETE FROM approvals WHERE id=$1", [approval.id]);
  await pool().query("DELETE FROM cheques WHERE contract_id=$1", [created.id]);
  await pool().query("DELETE FROM contracts WHERE id=$1", [created.id]);
  await pool().query("DELETE FROM tenants WHERE id=$1", [contract!.tenantId]);
  await pool().query("UPDATE units SET status='vacant' WHERE id=$1", [unitId]);
  await reconnect();
  assert.strictEqual(await findContract(created.id), null, "test contract was not removed");
  assert.strictEqual((await findUnit(unitId))!.status, "vacant");
  console.log(`7. cleaned up          ${created.ref} removed, unit back to vacant`);

  console.log("\nPASS — contract, tenant, cheques, unit hold and approval all survived a fresh session.");
  await pool().end();
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
