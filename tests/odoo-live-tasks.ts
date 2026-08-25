/**
 * Live round trip for the task mirror. Needs ODOO_* + DATABASE_URL and network
 * reach. Not part of `npm test`. Creates one clearly marked activity and a
 * carrier partner, and removes the activity at the end.
 *
 * This is the one thing tests/pg-task-odoo.ts cannot prove: that a real
 * Odoo 18 accepts these `mail.activity` field names on the live database.
 *
 * Run:  npm run test:odoo:tasks
 *
 * The assertion that matters: every change after creation must WRITE to the
 * activity the task already owns, never create a second one.
 */
import assert from "node:assert";
import { pool } from "@/lib/db";
import { backend } from "@/lib/data";
import {
  ACTIVITY_MARK,
  activityExists,
  odooConfig,
  readActivity,
} from "@/lib/odoo";
import { completeTaskInOdoo, syncTaskById } from "@/lib/actions/task-sync";
import { findTask } from "@/lib/repos/tasks";

const cfg = odooConfig();

async function main() {
  assert.strictEqual(backend(), "postgres", "DATABASE_URL must be set");
  assert.ok(cfg, "ODOO_URL / ODOO_DB / ODOO_USERNAME / ODOO_API_KEY must all be set");

  const stamp = Date.now();
  const title = `PMS CONNECTIVITY TEST ${stamp} — safe to delete`;
  const assignee = (await pool().query("SELECT id FROM users WHERE status='active' LIMIT 1")).rows[0].id;

  const taskId = (
    await pool().query(
      `INSERT INTO tasks (title, detail, assigned_to, due_date, status, priority, source, created_at)
       VALUES ($1, 'Raised by tests/odoo-live-tasks.ts. Safe to delete.', $2,
               DATE '2026-09-30', 'open', 'low', 'system', now())
       RETURNING id`,
      [title, assignee]
    )
  ).rows[0].id;
  console.log(`1. PMS task created   ${taskId}`);

  /* --------------------------------------------------- create in Odoo */
  const created = await syncTaskById(taskId);
  assert.ok(created.synced, `create failed: ${created.message}`);
  assert.ok(created.odooTaskId, "no Odoo activity id returned");
  console.log(`2. mirrored to Odoo   mail.activity id=${created.odooTaskId}`);

  const remote = await readActivity(cfg!, created.odooTaskId!);
  assert.ok(remote, "the activity could not be read back from Odoo");
  assert.strictEqual(remote!.summary, title, "the summary did not land");
  assert.strictEqual(remote!.date_deadline, "2026-09-30", "the deadline did not land");
  console.log(`3. read back          summary="${remote!.summary}" deadline=${remote!.date_deadline}`);

  /* ---------------------------------------------- update keeps the same id */
  await pool().query("UPDATE tasks SET due_date = DATE '2026-10-07' WHERE id=$1", [taskId]);
  const updated = await syncTaskById(taskId);
  assert.ok(updated.synced, `update failed: ${updated.message}`);
  assert.strictEqual(
    updated.odooTaskId,
    created.odooTaskId,
    "THE UPDATE CREATED A SECOND ODOO ACTIVITY — the mirror is duplicating records"
  );
  const moved = await readActivity(cfg!, created.odooTaskId!);
  assert.strictEqual(moved!.date_deadline, "2026-10-07", "the new deadline did not land");
  console.log(`4. updated, same id   ${updated.odooTaskId} deadline now ${moved!.date_deadline}`);

  /* ------------------------------------------------------------- complete */
  await pool().query("UPDATE tasks SET status='done', completed_at=now() WHERE id=$1", [taskId]);
  const done = await completeTaskInOdoo(taskId);
  assert.ok(done.synced, `completion failed: ${done.message}`);
  assert.strictEqual(done.odooTaskId, created.odooTaskId, "completion moved to a different record");

  const final = await readActivity(cfg!, created.odooTaskId!);
  assert.ok(final, "the activity was destroyed by completion — it must be retained");
  assert.ok(
    String(final!.summary).startsWith(ACTIVITY_MARK.done),
    `completion marker not written; summary is "${final!.summary}"`
  );
  console.log(`5. completed          same id ${done.odooTaskId}, summary="${final!.summary}", record retained`);

  /* ----------------------------------------------------------- persistence */
  await pool().end();
  (globalThis as Record<string, unknown>).__pmsPool = undefined;
  const persisted = await findTask(taskId);
  assert.strictEqual(persisted!.odooTaskId, created.odooTaskId, "the Odoo id did not survive a reconnect");
  assert.strictEqual(persisted!.odooError, undefined, "a sync error was left behind");
  console.log(`6. survived reconnect odooTaskId=${persisted!.odooTaskId}`);

  /* --------------------------------------------------------------- cleanup */
  // Delete the activity in Odoo and the PMS row, leaving nothing behind.
  await deleteActivity(created.odooTaskId!);
  const gone = !(await activityExists(cfg!, created.odooTaskId!));
  assert.ok(gone, "the test activity was not removed from Odoo");
  await pool().query("DELETE FROM tasks WHERE id=$1", [taskId]);
  await pool().end();
  console.log(`7. cleaned up         activity ${created.odooTaskId} deleted, PMS task removed`);

  console.log(`\nPASS — live task mirror: create, update, complete, same record throughout; nothing left behind.`);
}

/** Direct unlink for cleanup — not part of the mirror's own API. */
async function deleteActivity(id: number): Promise<void> {
  await fetch(`${cfg!.url}/jsonrpc`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service: "object", method: "execute_kw",
      args: [cfg!.db, await liveUid(), cfg!.apiKey, "mail.activity", "unlink", [[id]]] }, id: 1 }),
  });
}

let _uid: number | null = null;
async function liveUid(): Promise<number> {
  if (_uid) return _uid;
  const res = await fetch(`${cfg!.url}/jsonrpc`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call",
      params: { service: "common", method: "login", args: [cfg!.db, cfg!.username, cfg!.apiKey] }, id: 1 }),
  });
  _uid = (await res.json()).result;
  return _uid!;
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
