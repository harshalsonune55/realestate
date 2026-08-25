/**
 * Proves audit events reach Postgres and survive a reconnect.
 * Needs DATABASE_URL. Not part of `npm test`.
 */
import assert from "node:assert";
import { pool } from "@/lib/db";
import { appendAudit, backend, loadData } from "@/lib/data";

async function reconnect() {
  await pool().end();
  (globalThis as Record<string, unknown>).__pmsPool = undefined;
}

async function main() {
  assert.strictEqual(backend(), "postgres", "DATABASE_URL must be set");

  const { rows } = await pool().query("SELECT id, name FROM users LIMIT 1");
  const actor = rows[0];
  const marker = "audit-proof-" + Date.now();

  await appendAudit({
    at: new Date().toISOString(),
    actorId: actor.id,
    actorName: actor.name,
    action: "test.audit",
    entityType: "visit",
    entityId: null as unknown as string,
    summary: marker,
    changes: [{ field: "status", from: "scheduled", to: "cancelled" }],
    ip: "",
  });
  console.log("1. audit row written  " + marker);

  await reconnect();

  const found = await pool().query("SELECT * FROM activity_log WHERE summary = $1", [marker]);
  assert.strictEqual(found.rowCount, 1, "audit row did not survive the reconnect");
  const row = found.rows[0];
  assert.strictEqual(row.actor_name, actor.name);
  assert.strictEqual(row.action, "test.audit");
  // The fabricated 10.0.0.24 is gone; unknown is now genuinely unknown.
  assert.strictEqual(row.ip, null);
  assert.deepStrictEqual(row.changes, [{ field: "status", from: "scheduled", to: "cancelled" }]);
  console.log("2. survived reconnect actor=" + row.actor_name + "  ip=" + row.ip + " (null, not fabricated)");

  await reconnect();
  const d = await loadData();
  assert.ok(d.audit.some((a) => a.summary === marker), "loadData did not return the audit row");
  console.log("3. visible via loadData among " + d.audit.length + " row(s)");

  console.log("\nPASS — audit writes go to Postgres and persist.");
  await pool().end();
}

main().catch((e) => { console.error("FAIL", e); process.exit(1); });
