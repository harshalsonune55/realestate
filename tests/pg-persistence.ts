/**
 * Proves visits survive a process restart in Postgres.
 * Needs DATABASE_URL. Not part of `npm test`.
 *
 * Each phase closes the pool before the next reads, so nothing can pass on
 * in-memory state left behind by the previous step.
 */
import assert from "node:assert";
import { pool } from "@/lib/db";
import { createVisit, getVisit, listVisits, nextVisitRef, newVisitId, updateVisit, backend } from "@/lib/data";
import type { Visit } from "@/lib/types";

async function freshSession<T>(fn: () => Promise<T>): Promise<T> {
  const out = await fn();
  await pool().end();                       // drop every connection
  (globalThis as Record<string, unknown>).__pmsPool = undefined; // forget the pool
  return out;
}

async function main() {
  assert.strictEqual(backend(), "postgres", "DATABASE_URL must be set");
  const q = pool();
  const { rows } = await q.query("SELECT p.id AS pid, u.id AS uid FROM units u JOIN properties p ON p.id=u.property_id LIMIT 1");
  const { pid, uid } = rows[0];

  const id = newVisitId();
  const visit: Visit = {
    id, ref: await nextVisitRef(), propertyId: pid, unitId: uid,
    visitorName: "Persistence Check", visitorPhone: "+971500000999",
    startsAt: "2026-08-19T06:00:00.000Z", durationMins: 30,
    status: "scheduled", outcome: "", notes: "created",
    bookedBy: "", createdAt: new Date().toISOString(),
  };

  await freshSession(async () => { await createVisit(visit); });
  console.log("1. created            " + visit.ref);

  const afterCreate = await freshSession(() => getVisit(id));
  assert.ok(afterCreate, "visit missing after restart");
  assert.strictEqual(afterCreate!.startsAt, "2026-08-19T06:00:00.000Z");
  console.log("2. survived restart   startsAt=" + afterCreate!.startsAt);

  await freshSession(() => updateVisit(id, {
    startsAt: "2026-08-19T11:30:00.000Z", notes: "rescheduled to 15:30 Gulf", odooEventId: 8,
  }));
  const afterUpdate = await freshSession(() => getVisit(id));
  assert.strictEqual(afterUpdate!.startsAt, "2026-08-19T11:30:00.000Z");
  assert.strictEqual(afterUpdate!.odooEventId, 8);
  console.log("3. update survived    startsAt=" + afterUpdate!.startsAt + "  odooEventId=" + afterUpdate!.odooEventId);

  await freshSession(() => updateVisit(id, { status: "cancelled", notes: "Cancelled: test" }));
  const afterCancel = await freshSession(() => getVisit(id));
  assert.strictEqual(afterCancel!.status, "cancelled");
  // The link must survive cancellation — that is what stops a retry duplicating.
  assert.strictEqual(afterCancel!.odooEventId, 8);
  console.log("4. cancel survived    status=" + afterCancel!.status + "  odooEventId kept=" + afterCancel!.odooEventId);

  // Asserts on this record, not on a global count — other tests share the db.
  const all = await freshSession(() => listVisits());
  assert.ok(all.some((v) => v.id === id), "listVisits did not return the record");
  console.log("5. listVisits         found it among " + all.length + " row(s)");

  // Clean up: a left-behind visit accumulates, and because refs are derived
  // from the row count, a gap between count and the highest ref would collide
  // the next booking. Removing the record keeps the two in step.
  await pool().query("DELETE FROM visits WHERE id = $1", [id]);
  (globalThis as Record<string, unknown>).__pmsPool = undefined;
  assert.strictEqual(await getVisit(id), null, "the persistence-proof visit was not removed");
  console.log("6. cleaned up         proof visit removed");

  console.log("\nPASS — create, update and cancel all survived a fresh session.");
}

main().catch((e) => { console.error("FAIL", e); process.exit(1); });
