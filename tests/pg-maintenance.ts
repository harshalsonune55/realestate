/**
 * Proves work orders reach Postgres and survive a reconnect.
 * Needs DATABASE_URL. Not part of `npm test`.
 *
 * Runs both paths: a cheap job that starts assigned, and an expensive one that
 * starts blocked on an approval. Both are removed at the end.
 */
import assert from "node:assert";
import { pool } from "@/lib/db";
import { backend } from "@/lib/data";
import { findUnit } from "@/lib/repos/contracts";
import {
  advanceMaintenance, createMaintenance, findMaintenance, tenantOfUnit,
} from "@/lib/repos/maintenance";

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

  const unitId = (
    await pool().query("SELECT id FROM units WHERE status = 'occupied' LIMIT 1")
  ).rows[0].id;
  const userId = (await pool().query("SELECT id FROM users WHERE role='maintenance' LIMIT 1")).rows[0].id;
  await reconnect();

  const unit = await fresh(() => findUnit(unitId));
  const tenantId = await fresh(() => tenantOfUnit(unitId));
  assert.ok(tenantId, "an occupied unit should resolve to a tenant");

  /* ------------------------------------------- cheap job: straight to work */
  const cheap = await fresh(() =>
    createMaintenance({
      unitId, unitNo: unit!.unitNo, tenantId,
      category: "Plumbing", priority: "high",
      description: "Persistence proof — leaking mixer tap.",
      vendor: "Proof Plumbing LLC", quoteAmount: 400, slaDays: 2,
      needsApproval: false, reportedBy: userId, now,
    })
  );
  console.log(`1. work order created  ${cheap.ref}  ${cheap.id}`);

  const wo = await fresh(() => findMaintenance(cheap.id));
  assert.ok(wo, "work order missing after reconnect");
  assert.strictEqual(wo!.status, "assigned");
  assert.strictEqual(wo!.quoteAmount, 400, "quote did not round-trip exactly");
  assert.strictEqual(wo!.tenantId, tenantId, "tenant link lost");
  assert.ok(wo!.assignedTo, "nobody was assigned — the hardcoded id would be dangling");
  assert.ok(wo!.slaDueAt, "SLA deadline did not persist");
  console.log(`2. survived reconnect  status=${wo!.status} quote=${wo!.quoteAmount} assignee=${wo!.assignedTo}`);

  /* ---------------------------------------------------- advance the status */
  await fresh(() => advanceMaintenance(cheap.id, "assigned", "in_progress", "", new Date().toISOString()));
  assert.strictEqual((await fresh(() => findMaintenance(cheap.id)))!.status, "in_progress");

  await fresh(() =>
    advanceMaintenance(cheap.id, "in_progress", "completed", "Replaced the cartridge.", new Date().toISOString())
  );
  const completed = await fresh(() => findMaintenance(cheap.id));
  assert.strictEqual(completed!.status, "completed");
  assert.strictEqual(completed!.resolutionNotes, "Replaced the cartridge.");
  assert.ok(completed!.completedAt, "completion date did not persist");
  console.log(`3. advanced, persisted status=${completed!.status} notes="${completed!.resolutionNotes}"`);

  await fresh(() =>
    advanceMaintenance(cheap.id, "completed", "closed", "Tenant confirmed.", new Date().toISOString())
  );
  const closed = await fresh(() => findMaintenance(cheap.id));
  assert.strictEqual(closed!.status, "closed");
  assert.match(closed!.resolutionNotes!, /Replaced the cartridge\. — Tenant confirmed\./);
  const openTasks = await fresh(async () => {
    const { rows } = await pool().query(
      "SELECT count(*)::int AS n FROM tasks WHERE entity_type='maintenance' AND entity_id=$1 AND status<>'done'",
      [cheap.id]
    );
    return rows[0].n;
  });
  assert.strictEqual(openTasks, 0, "tasks stayed open after the job closed");
  console.log(`4. closed              notes appended, ${openTasks} tasks left open`);

  // A stale transition must be refused, not silently applied twice.
  await assert.rejects(
    () => advanceMaintenance(cheap.id, "in_progress", "completed", "again", new Date().toISOString()),
    "a stale status transition was accepted"
  );
  await reconnect();
  console.log("5. stale move refused  guarded on the status the caller validated");

  /* --------------------------------------- expensive job: needs an approval */
  const dear = await fresh(() =>
    createMaintenance({
      unitId, unitNo: unit!.unitNo, tenantId,
      category: "HVAC", priority: "medium",
      description: "Persistence proof — chiller replacement.",
      vendor: "Proof Cooling LLC", quoteAmount: 25000, slaDays: 5,
      needsApproval: true, reportedBy: userId, now,
    })
  );
  const blocked = await fresh(() => findMaintenance(dear.id));
  assert.strictEqual(blocked!.status, "awaiting_approval", "an over-limit job must not start on its own");
  const approval = await fresh(async () => {
    const { rows } = await pool().query(
      "SELECT * FROM approvals WHERE entity_type='maintenance' AND entity_id=$1",
      [dear.id]
    );
    return rows[0];
  });
  assert.ok(approval, "no spend approval was raised");
  assert.strictEqual(String(approval.amount), "2500000");
  console.log(`6. spend gated         ${dear.ref} status=${blocked!.status}, approval ${approval.ref}`);

  /* ---------------------------------------------------------------- cleanup */
  const ids = [cheap.id, dear.id];
  await pool().query(
    "DELETE FROM tasks WHERE entity_type='approval' AND entity_id IN (SELECT id FROM approvals WHERE entity_type='maintenance' AND entity_id = ANY($1))",
    [ids]
  );
  await pool().query("DELETE FROM approvals WHERE entity_type='maintenance' AND entity_id = ANY($1)", [ids]);
  await pool().query("DELETE FROM tasks WHERE entity_type='maintenance' AND entity_id = ANY($1)", [ids]);
  await pool().query("DELETE FROM maintenance_requests WHERE id = ANY($1)", [ids]);
  await reconnect();
  assert.strictEqual(await findMaintenance(cheap.id), null);
  assert.strictEqual(await findMaintenance(dear.id), null);
  console.log(`7. cleaned up          ${cheap.ref} and ${dear.ref} removed`);

  console.log("\nPASS — work orders, status advances and spend gating all survived a fresh session.");
  await pool().end();
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
