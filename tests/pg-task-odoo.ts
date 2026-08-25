/**
 * Task ↔ Odoo mirror regression. Needs DATABASE_URL; no Odoo credentials.
 *
 * Runs the real sync code against a stand-in Odoo (tests/fake-odoo.ts), so the
 * whole path is exercised — Postgres write, RPC, id capture, retry, failure
 * handling — on a machine with no ERP. What it cannot prove is that a live
 * Odoo 18 accepts these `mail.activity` field names; tests/odoo-live-tasks.ts does
 * that, and needs the integration account.
 *
 * The rule under test throughout: Postgres is the source of truth, and no Odoo
 * outage may cost a task or duplicate one.
 */
import assert from "node:assert";
import { pool } from "@/lib/db";
import { backend } from "@/lib/data";
import { startFakeOdoo } from "./fake-odoo";

async function reconnect() {
  await pool().end();
  (globalThis as Record<string, unknown>).__pmsPool = undefined;
}

/** Imported lazily so ODOO_* is in place before the module reads it. */
async function mod() {
  return {
    sync: await import("@/lib/actions/task-sync"),
    repo: await import("@/lib/repos/tasks"),
  };
}

async function main() {
  assert.strictEqual(backend(), "postgres", "DATABASE_URL must be set");

  const odoo = await startFakeOdoo();
  process.env.ODOO_URL = odoo.url;
  process.env.ODOO_DB = "almanara_test";
  process.env.ODOO_USERNAME = "integration@test.local";
  process.env.ODOO_API_KEY = "fake-key-not-a-secret";

  const { sync, repo } = await mod();
  const assignee = (await pool().query("SELECT id FROM users WHERE status='active' LIMIT 1")).rows[0].id;

  const mk = async (title: string) =>
    (
      await pool().query(
        `INSERT INTO tasks (title, detail, assigned_to, due_date, status, priority, source, created_at)
         VALUES ($1, 'raised by tests/pg-task-odoo.ts', $2, DATE '2026-09-15', 'open', 'high', 'system', now())
         RETURNING id`,
        [title, assignee]
      )
    ).rows[0].id;

  const created: string[] = [];

  /* 1 ------------------------------------------------------ create + mirror */
  const t1 = await mk("Odoo mirror proof — create");
  created.push(t1);
  const first = await sync.syncTaskById(t1);
  assert.ok(first.synced, "first push did not sync");
  assert.ok(first.odooTaskId, "no Odoo id was captured");
  await reconnect();

  const afterCreate = await repo.findTask(t1);
  assert.strictEqual(afterCreate!.odooTaskId, first.odooTaskId, "Odoo id did not persist");
  assert.ok(afterCreate!.odooSyncedAt, "sync time did not persist");
  assert.strictEqual(afterCreate!.odooError, undefined, "a successful sync left an error behind");
  console.log(`1. mirrored + persisted   odooTaskId=${first.odooTaskId} (survived reconnect)`);

  const carrier = odoo.store.get("res.partner");
  assert.strictEqual(carrier?.size, 1, "the carrier partner was not created exactly once");
  const rec = odoo.store.get("mail.activity")!.get(first.odooTaskId!)!;
  assert.strictEqual(rec.summary, "Odoo mirror proof — create");
  assert.strictEqual(rec.date_deadline, "2026-09-15", "deadline did not reach Odoo");
  assert.strictEqual(rec.res_id, [...carrier!.keys()][0], "activity not anchored to the carrier partner");
  console.log(`2. activity in Odoo       summary="${rec.summary}" deadline=${rec.date_deadline} anchored to partner ${rec.res_id}`);

  /* 3 ------------------------------------------------- update keeps same id */
  await pool().query("UPDATE tasks SET title = $2, due_date = DATE '2026-10-01' WHERE id = $1", [
    t1, "Odoo mirror proof — rescheduled",
  ]);
  await reconnect();
  const second = await sync.syncTaskById(t1);
  assert.ok(second.synced);
  assert.strictEqual(second.odooTaskId, first.odooTaskId, "reschedule created a SECOND Odoo record");
  assert.strictEqual(odoo.countOf("mail.activity"), 1, "a duplicate activity appeared in Odoo");
  const rescheduled = odoo.store.get("mail.activity")!.get(first.odooTaskId!)!;
  assert.strictEqual(rescheduled.summary, "Odoo mirror proof — rescheduled");
  assert.strictEqual(rescheduled.date_deadline, "2026-10-01");
  console.log(`3. reschedule → same id   ${second.odooTaskId} updated in place, 1 record total`);

  /* 4 --------------------------------------------------------- completion */
  await pool().query("UPDATE tasks SET status='done', completed_at=now() WHERE id=$1", [t1]);
  await reconnect();
  const done = await sync.completeTaskInOdoo(t1);
  assert.ok(done.synced);
  assert.strictEqual(done.odooTaskId, first.odooTaskId, "completion moved to a different record");
  const doneRec = odoo.store.get("mail.activity")!.get(first.odooTaskId!)!;
  assert.match(String(doneRec.summary), /^✓ Completed — /, "completion marker not written to the activity");
  assert.strictEqual(odoo.countOf("mail.activity"), 1, "completion created a record");
  console.log(`4. completed              same id ${done.odooTaskId}, summary="${doneRec.summary}", record retained`);

  /* 5 ------------------------------------------------- outage loses nothing */
  const t2 = await mk("Odoo mirror proof — outage");
  created.push(t2);
  odoo.failNext = { count: 1, kind: "server" };
  const failed = await sync.syncTaskById(t2);
  assert.strictEqual(failed.synced, false, "a 502 was reported as a success");
  await reconnect();

  const stranded = await repo.findTask(t2);
  assert.ok(stranded, "THE TASK WAS LOST when Odoo failed");
  assert.strictEqual(stranded!.status, "open", "the task was altered by an Odoo failure");
  assert.strictEqual(stranded!.odooTaskId, undefined, "an id was recorded despite the failure");
  assert.ok(stranded!.odooError, "the failure was not recorded on the task");
  console.log(`5. outage survived        task intact, odooError="${stranded!.odooError!.slice(0, 44)}…"`);

  /* 6 ----------------------------------------------- retry, without doubling */
  const before = odoo.countOf("mail.activity");
  const retried = await sync.retryTaskSync(t2);
  assert.ok(retried.synced, "retry after an outage did not succeed");
  assert.strictEqual(odoo.countOf("mail.activity"), before + 1, "retry created more than one record");
  await reconnect();
  const healed = await repo.findTask(t2);
  assert.strictEqual(healed!.odooTaskId, retried.odooTaskId);
  assert.strictEqual(healed!.odooError, undefined, "a successful retry left the old error behind");
  console.log(`6. retry succeeded        odooTaskId=${retried.odooTaskId}, error cleared, no duplicate`);

  // Retrying an already-synced task must update, never create.
  const beforeIdem = odoo.countOf("mail.activity");
  const again = await sync.retryTaskSync(t2);
  assert.ok(again.synced);
  assert.strictEqual(again.odooTaskId, retried.odooTaskId);
  assert.strictEqual(odoo.countOf("mail.activity"), beforeIdem, "a second retry duplicated the record");
  console.log(`7. retry is idempotent    still ${odoo.countOf("mail.activity")} records, same id`);

  /* 8 --------------------------------------- deleted at the Odoo end */
  const t3 = await mk("Odoo mirror proof — vanished");
  created.push(t3);
  const linked = await sync.syncTaskById(t3);
  assert.ok(linked.odooTaskId);
  // Somebody deletes it inside Odoo.
  odoo.store.get("mail.activity")!.delete(linked.odooTaskId!);
  await reconnect();

  const missed = await sync.syncTaskById(t3);
  assert.strictEqual(missed.synced, false, "writing to a deleted record reported success");
  await reconnect();
  const recorded = await repo.findTask(t3);
  assert.match(recorded!.odooError!, /no longer exists/, "MissingError was not recognised");
  assert.strictEqual(recorded!.odooTaskId, linked.odooTaskId, "the dead id was dropped automatically");
  console.log(`8. vanished record        id ${linked.odooTaskId} kept, not silently recreated`);

  // Only an explicit retry may replace it.
  const replaced = await sync.retryTaskSync(t3);
  assert.ok(replaced.synced, "explicit retry did not recreate the record");
  assert.notStrictEqual(replaced.odooTaskId, linked.odooTaskId, "retry reused a dead id");
  console.log(`9. retry recreated it     new id ${replaced.odooTaskId}, only on an explicit action`);

  /* 10 ----------------------------------------------------------- the sweep */
  const t4 = await mk("Odoo mirror proof — sweep");
  created.push(t4);
  await reconnect();
  const swept = await sync.syncPendingTasks(50);
  assert.ok(swept.attempted >= 1, "the sweep found nothing to mirror");
  // The window keeps the sweep to tasks this request raised. Without it the
  // seeded history — a couple of hundred rows — would be pushed to Odoo too.
  assert.ok(swept.attempted < 20, `the sweep reached back into history: ${swept.attempted} tasks`);
  // The demo portfolio dates tasks days ahead; a one-sided window would sweep
  // those too. Only the task this test just raised may be picked up.
  assert.strictEqual(swept.attempted, 1, `the sweep took ${swept.attempted} tasks, expected only the new one`);
  await reconnect();
  const sweptTask = await repo.findTask(t4);
  assert.ok(sweptTask!.odooTaskId, "the sweep did not mirror a new task");
  console.log(`10. sweep mirrored        ${swept.synced}/${swept.attempted} pending task(s)`);

  // A task that already failed must not be picked up by the automatic sweep —
  // that is what keeps a retry a human decision.
  await pool().query("UPDATE tasks SET odoo_error='forced', odoo_task_id=NULL WHERE id=$1", [t4]);
  await reconnect();
  const pendingIds = (await repo.unsyncedTasks(100)).map((t) => t.id);
  assert.ok(!pendingIds.includes(t4), "the sweep would retry a task that already failed");
  console.log("11. failed tasks excluded  automatic sweep leaves them for an explicit retry");

  /* 12 --------------------------------------------- credentials never logged */
  const errText = (await repo.findTask(t2))?.odooError ?? "";
  assert.ok(!errText.includes("fake-key-not-a-secret"), "the API key leaked into a stored error");
  console.log("12. no credential leak     API key absent from stored sync errors");

  /* -------------------------------------------------------------- cleanup */
  await pool().query("DELETE FROM tasks WHERE id = ANY($1)", [created]);
  await reconnect();
  assert.strictEqual(await repo.findTask(created[0]), null);
  console.log(`13. cleaned up            ${created.length} proof tasks removed`);

  await odoo.close();
  await pool().end();
  console.log("\nPASS — task mirror: create, update, complete, retry, outage, no duplicates.");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
