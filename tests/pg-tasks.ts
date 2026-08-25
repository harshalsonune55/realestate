/**
 * Proves task closure and reassignment reach Postgres and survive a reconnect.
 * Needs DATABASE_URL. Not part of `npm test`.
 */
import assert from "node:assert";
import { pool } from "@/lib/db";
import { backend } from "@/lib/data";
import { completeTask, findTask, reassignTask, userNames } from "@/lib/repos/tasks";

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

  const staff = (
    await pool().query("SELECT id, name FROM users WHERE status='active' ORDER BY name LIMIT 2")
  ).rows;
  const [first, second] = staff;

  // A task of our own, so no real work item is disturbed.
  const created = (
    await pool().query(
      `INSERT INTO tasks (title, detail, assigned_to, due_date, status, priority, source, created_at)
       VALUES ('Persistence proof task', 'raised by tests/pg-tasks.ts', $1, CURRENT_DATE, 'open', 'low', 'system', now())
       RETURNING id`,
      [first.id]
    )
  ).rows[0];
  await reconnect();
  console.log(`1. task raised         ${created.id} → ${first.name}`);

  /* ------------------------------------------------------------- reassign */
  const before = await fresh(() => findTask(created.id));
  const nameMap = await fresh(() => userNames([before!.assignedTo]));
  assert.strictEqual(nameMap.get(first.id), first.name, "assignee name lookup failed");

  await fresh(() => reassignTask(created.id, second.id));
  const reassigned = await fresh(() => findTask(created.id));
  assert.strictEqual(reassigned!.assignedTo, second.id, "reassignment did not persist");
  console.log(`2. reassigned          → ${second.name}, survived reconnect`);

  /* -------------------------------------------------------------- close */
  await fresh(() => completeTask(created.id, "Checked and filed.", new Date().toISOString()));
  const done = await fresh(() => findTask(created.id));
  assert.strictEqual(done!.status, "done");
  assert.ok(done!.completedAt, "completion time did not persist");
  assert.match(done!.detail, / — closed: Checked and filed\.$/);
  console.log(`3. closed, persisted   status=${done!.status} detail ends "${done!.detail.slice(-24)}"`);

  // Closing twice must be refused, or two notes land on one record.
  await assert.rejects(
    () => completeTask(created.id, "again", new Date().toISOString()),
    "a second close was accepted"
  );
  await reconnect();
  const stillOne = await fresh(() => findTask(created.id));
  assert.strictEqual((stillOne!.detail.match(/closed:/g) ?? []).length, 1);
  console.log("4. double close refused only one closing note on the record");

  await pool().query("DELETE FROM tasks WHERE id=$1", [created.id]);
  await reconnect();
  assert.strictEqual(await findTask(created.id), null);
  console.log("5. cleaned up          proof task removed");

  console.log("\nPASS — reassignment and closure survived a fresh session.");
  await pool().end();
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
