/**
 * End-to-end round trip: PMS → PostgreSQL → Odoo, for a viewing and a
 * follow-up task, plus a restart in the middle.
 *
 * Needs DATABASE_URL. Odoo is the stand-in from tests/fake-odoo.ts, driven
 * through the same client functions the server actions use, so the sequencing
 * and the id handling under test are the real ones. The live-model binding is
 * the one link this cannot cover — tests/odoo-live.ts does that.
 */
import assert from "node:assert";
import { pool } from "@/lib/db";
import { startFakeOdoo } from "./fake-odoo";

async function reconnect() {
  await pool().end();
  (globalThis as Record<string, unknown>).__pmsPool = undefined;
}

async function main() {
  const odoo = await startFakeOdoo();
  process.env.ODOO_URL = odoo.url;
  process.env.ODOO_DB = "almanara_test";
  process.env.ODOO_USERNAME = "integration@test.local";
  process.env.ODOO_API_KEY = "fake-key-not-a-secret";

  const { backend, createVisit, getVisit, newVisitId, nextVisitRef, updateVisit } =
    await import("@/lib/data");
  const { createCalendarEvent, updateCalendarEvent, readActivity } = await import("@/lib/odoo");
  const { calendarTitle, formatVisitWhen, draftInstant } = await import("@/lib/actions/visit-rules");
  const sync = await import("@/lib/actions/task-sync");
  const tasks = await import("@/lib/repos/tasks");

  assert.strictEqual(backend(), "postgres", "DATABASE_URL must be set");
  const stamp = Date.now();

  /* 1 ------------------------------------------------- test customer in PG */
  const unit = (
    await pool().query(
      "SELECT u.id, u.unit_no, p.id AS pid, p.name FROM units u JOIN properties p ON p.id=u.property_id LIMIT 1"
    )
  ).rows[0];
  const agent = (await pool().query("SELECT id FROM users WHERE role='leasing' LIMIT 1")).rows[0].id;

  const tenant = (
    await pool().query(
      `INSERT INTO tenants (name, kind, phone, email, nationality, created_at)
       VALUES ($1,'individual','+971500000777',$2,'United Arab Emirates', now()) RETURNING id, name`,
      [`E2E Visitor ${stamp}`, `e2e.${stamp}@example.ae`]
    )
  ).rows[0];
  console.log(`1.  customer created      ${tenant.name}`);

  /* 2 ------------------------------------------------ book viewing → Postgres */
  // 10:00 Gulf, the case the timezone rules are written around.
  const instant = draftInstant("2026-09-20", "10:00")!;
  const visitId = newVisitId();
  await createVisit({
    id: visitId,
    ref: await nextVisitRef(),
    propertyId: unit.pid,
    unitId: unit.id,
    tenantId: tenant.id,
    visitorName: tenant.name,
    visitorPhone: "+971500000777",
    visitorEmail: `e2e.${stamp}@example.ae`,
    startsAt: instant.toISOString(),
    durationMins: 30,
    status: "scheduled",
    outcome: "",
    notes: "end-to-end proof",
    bookedBy: agent,
    createdAt: new Date().toISOString(),
  });
  await reconnect();

  /* 3 ------------------------------------------------------ verify in Postgres */
  const stored = await getVisit(visitId);
  assert.ok(stored, "viewing missing from Postgres");
  assert.strictEqual(stored!.startsAt, "2026-09-20T06:00:00.000Z", "10:00 Gulf did not store as 06:00 UTC");
  console.log(`2.  viewing in Postgres   ${stored!.ref}  10:00 Gulf → ${stored!.startsAt}`);
  console.log(`3.  renders back as       ${formatVisitWhen(stored!.startsAt)}`);

  /* 4 ------------------------------------------------------- mirror to Odoo */
  const unitLabel = `${unit.name} — Unit ${unit.unit_no}`;
  const stopIso = new Date(instant.getTime() + 30 * 60_000).toISOString();
  const eventId = await createCalendarEvent(
    { url: odoo.url, db: "almanara_test", username: "integration@test.local", apiKey: "fake-key-not-a-secret" },
    { name: calendarTitle(unitLabel, stored!.visitorName), startIso: stored!.startsAt, stopIso, location: unit.name }
  );
  await updateVisit(visitId, { odooEventId: eventId, odooSyncedAt: new Date().toISOString() });
  await reconnect();

  const event = odoo.store.get("calendar.event")!.get(eventId)!;
  // Odoo takes naive UTC, never an offset string.
  assert.strictEqual(event.start, "2026-09-20 06:00:00", "Odoo did not receive naive UTC");
  assert.strictEqual(event.stop, "2026-09-20 06:30:00");
  console.log(`4.  Odoo calendar.event   id=${eventId}  start="${event.start}" (naive UTC)`);

  /* 5 -------------------------------------------- reschedule → SAME event id */
  const moved = draftInstant("2026-09-20", "15:30")!;
  await updateVisit(visitId, { startsAt: moved.toISOString() });
  await updateCalendarEvent(
    { url: odoo.url, db: "almanara_test", username: "integration@test.local", apiKey: "fake-key-not-a-secret" },
    eventId,
    { startIso: moved.toISOString(), stopIso: new Date(moved.getTime() + 30 * 60_000).toISOString() }
  );
  await reconnect();

  const after = await getVisit(visitId);
  assert.strictEqual(after!.odooEventId, eventId, "reschedule changed the Odoo event id");
  assert.strictEqual(odoo.countOf("calendar.event"), 1, "reschedule left a duplicate calendar entry");
  assert.strictEqual(odoo.store.get("calendar.event")!.get(eventId)!.start, "2026-09-20 11:30:00");
  assert.strictEqual(after!.startsAt, "2026-09-20T11:30:00.000Z");
  console.log(`5.  rescheduled 15:30     same event id=${after!.odooEventId}, 1 event total, start="2026-09-20 11:30:00"`);

  /* 6 ------------------------------------------------- cancel → same event id */
  await updateVisit(visitId, { status: "cancelled" });
  await updateCalendarEvent(
    { url: odoo.url, db: "almanara_test", username: "integration@test.local", apiKey: "fake-key-not-a-secret" },
    eventId,
    { name: `CANCELLED — ${stored!.visitorName}` }
  );
  await reconnect();
  const cancelled = await getVisit(visitId);
  assert.strictEqual(cancelled!.status, "cancelled");
  assert.strictEqual(cancelled!.odooEventId, eventId, "cancellation dropped the event link");
  assert.strictEqual(odoo.countOf("calendar.event"), 1);
  assert.match(String(odoo.store.get("calendar.event")!.get(eventId)!.name), /^CANCELLED/);
  console.log(`6.  cancelled             same event id=${eventId} renamed, not deleted`);

  /* 7 -------------------------------------------- follow-up task → Postgres */
  const taskId = (
    await pool().query(
      `INSERT INTO tasks (title, detail, assigned_to, due_date, status, priority, entity_type, entity_id, source, created_at)
       VALUES ($1,'Call the visitor back about the viewing.',$2, DATE '2026-09-22','open','high','visit',$3,'system', now())
       RETURNING id`,
      [`E2E follow-up ${stamp}`, agent, visitId]
    )
  ).rows[0].id;
  await reconnect();
  const task = await tasks.findTask(taskId);
  assert.ok(task, "follow-up task missing from Postgres");
  assert.strictEqual(task!.entityId, visitId, "task is not linked to the viewing");
  console.log(`7.  follow-up in Postgres ${task!.title}  → linked to ${stored!.ref}`);

  /* 8 -------------------------------------------------- mirror task to Odoo */
  const pushed = await sync.syncTaskById(taskId);
  assert.ok(pushed.synced && pushed.odooTaskId, "task did not reach Odoo");
  await reconnect();
  const linked = await tasks.findTask(taskId);
  assert.strictEqual(linked!.odooTaskId, pushed.odooTaskId, "Odoo task id did not persist");
  const odooTask = await readActivity(
    { url: odoo.url, db: "almanara_test", username: "integration@test.local", apiKey: "fake-key-not-a-secret" },
    pushed.odooTaskId!
  );
  assert.ok(odooTask, "activity not readable back from Odoo");
  assert.strictEqual(odooTask!.date_deadline, "2026-09-22");
  console.log(`8.  Odoo mail.activity    id=${pushed.odooTaskId} deadline=${odooTask!.date_deadline}`);

  /* 9 -------------------------------------------- update task → same Odoo id */
  await pool().query("UPDATE tasks SET due_date = DATE '2026-09-25' WHERE id=$1", [taskId]);
  await reconnect();
  const rescheduledTask = await sync.syncTaskById(taskId);
  assert.strictEqual(rescheduledTask.odooTaskId, pushed.odooTaskId, "task update created a second Odoo record");
  assert.strictEqual(odoo.countOf("mail.activity"), 1, "duplicate mail.activity appeared");
  console.log(`9.  task rescheduled      same Odoo id=${rescheduledTask.odooTaskId}, 1 record total`);

  /* 10 ------------------------------------------------------ complete task */
  await pool().query("UPDATE tasks SET status='done', completed_at=now() WHERE id=$1", [taskId]);
  await reconnect();
  const completed = await sync.completeTaskInOdoo(taskId);
  assert.strictEqual(completed.odooTaskId, pushed.odooTaskId, "completion moved to another Odoo record");
  const finalOdoo = await readActivity(
    { url: odoo.url, db: "almanara_test", username: "integration@test.local", apiKey: "fake-key-not-a-secret" },
    pushed.odooTaskId!
  );
  assert.match(String(finalOdoo!.summary), /^✓ Completed — /, "Odoo activity was not marked done");
  console.log(`10. completed both ends   PMS=done  Odoo summary="${finalOdoo!.summary}"  id=${completed.odooTaskId}`);

  /* 11 ---------------------------------------- restart, everything survives */
  await reconnect();
  const finalVisit = await getVisit(visitId);
  const finalTask = await tasks.findTask(taskId);
  assert.strictEqual(finalVisit!.status, "cancelled");
  assert.strictEqual(finalVisit!.odooEventId, eventId);
  assert.strictEqual(finalTask!.status, "done");
  assert.strictEqual(finalTask!.odooTaskId, pushed.odooTaskId);
  console.log(`11. survived restart      visit=${finalVisit!.status}/event ${finalVisit!.odooEventId}, task=${finalTask!.status}/odoo ${finalTask!.odooTaskId}`);

  /* ---------------------------------------------------------------- cleanup */
  await pool().query("DELETE FROM tasks WHERE id=$1", [taskId]);
  await pool().query("DELETE FROM visits WHERE id=$1", [visitId]);
  await pool().query("DELETE FROM tenants WHERE id=$1", [tenant.id]);
  await reconnect();
  assert.strictEqual(await getVisit(visitId), null);
  assert.strictEqual(await tasks.findTask(taskId), null);
  console.log(`12. cleaned up            visitor, viewing and follow-up removed`);

  await odoo.close();
  await pool().end();
  console.log("\nPASS — full round trip: customer → viewing → Odoo calendar → follow-up → Odoo task → restart.");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
