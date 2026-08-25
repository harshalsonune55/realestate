/**
 * Live round trip against a real Odoo. Needs ODOO_* + DATABASE_URL and network
 * reach. Not part of `npm test`. Creates one clearly marked test record.
 *
 * The assertion that matters: editing a viewing must UPDATE the calendar event
 * it already owns, never create a second one.
 */
import assert from "node:assert";
import { createCalendarEvent, odooConfig, updateCalendarEvent } from "@/lib/odoo";
import { createVisit, getVisit, newVisitId, nextVisitRef, updateVisit } from "@/lib/data";
import { calendarTitle, draftInstant, formatVisitWhen, toOdooDatetime } from "@/lib/actions/visit-rules";
import { pool } from "@/lib/db";
import type { Visit } from "@/lib/types";

const cfg = odooConfig();

async function readEvent(id: number) {
  const res = await fetch(`${cfg!.url}/jsonrpc`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service: "object", method: "execute_kw",
      args: [cfg!.db, await uid(), cfg!.apiKey, "calendar.event", "read", [[id]],
             { fields: ["name", "start", "stop", "location", "description"] }] }, id: 1 }),
  });
  const body = await res.json();
  if (body.error) throw new Error(JSON.stringify(body.error.data ?? body.error));
  return body.result[0];
}

let _uid: number | null = null;
async function uid(): Promise<number> {
  if (_uid) return _uid;
  const res = await fetch(`${cfg!.url}/jsonrpc`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call",
      params: { service: "common", method: "login", args: [cfg!.db, cfg!.username, cfg!.apiKey] }, id: 1 }),
  });
  _uid = (await res.json()).result;
  return _uid!;
}

/** Unique to this run, so the duplicate check and cleanup touch only our event. */
const MARKER = `ROUNDTRIP ${process.pid}-${Math.floor(process.hrtime()[1])}`;

async function unlinkEvent(id: number): Promise<void> {
  await fetch(`${cfg!.url}/jsonrpc`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service: "object", method: "execute_kw",
      args: [cfg!.db, await uid(), cfg!.apiKey, "calendar.event", "unlink", [[id]]] }, id: 1 }),
  });
}

async function main() {
  assert.ok(cfg, "Odoo is not configured");

  const { rows } = await pool().query(
    "SELECT p.id AS pid, p.name AS pname, u.id AS uid, u.unit_no FROM units u JOIN properties p ON p.id=u.property_id LIMIT 1"
  );
  const { pid, pname, uid: unitId, unit_no } = rows[0];
  const unitLabel = `${pname} — Unit ${unit_no}`;

  // ---------- 1. book, in the PMS ----------
  const start = draftInstant("2026-08-19", "10:00")!;
  const visit: Visit = {
    id: newVisitId(), ref: await nextVisitRef(), propertyId: pid, unitId,
    visitorName: `${MARKER} — delete me`, visitorPhone: "+971500000998",
    startsAt: start.toISOString(), durationMins: 30, status: "scheduled",
    outcome: "", notes: "created by tests/odoo-live.ts", bookedBy: "",
    createdAt: new Date().toISOString(),
  };
  await createVisit(visit);
  console.log("1. PMS visit          " + visit.ref + "  " + formatVisitWhen(visit.startsAt));

  // ---------- 2. push to Odoo (create) ----------
  const eventId = await createCalendarEvent(cfg!, {
    name: calendarTitle(unitLabel, visit.visitorName),
    startIso: visit.startsAt,
    stopIso: new Date(start.getTime() + 30 * 60_000).toISOString(),
    location: pname, description: "roundtrip",
  });
  await updateVisit(visit.id, { odooEventId: eventId, odooSyncedAt: new Date().toISOString() });
  console.log("2. calendar.event     id=" + eventId);

  const created = await readEvent(eventId);
  assert.strictEqual(created.start, "2026-08-19 06:00:00");
  console.log("3. read back          start=" + created.start + "  (10:00 Gulf)");

  // ---------- 4. reschedule 10:00 -> 15:30 ----------
  const moved = draftInstant("2026-08-19", "15:30")!;
  await updateVisit(visit.id, { startsAt: moved.toISOString(), notes: "rescheduled" });

  const stored = await getVisit(visit.id);
  assert.strictEqual(stored!.odooEventId, eventId, "the PMS must keep the same event id");

  // The branch under test: an existing id means WRITE, never CREATE.
  await updateCalendarEvent(cfg!, stored!.odooEventId!, {
    name: calendarTitle(unitLabel, visit.visitorName),
    startIso: moved.toISOString(),
    stopIso: new Date(moved.getTime() + 30 * 60_000).toISOString(),
    location: pname, description: "roundtrip — rescheduled",
  });
  console.log("4. rescheduled        10:00 -> 15:30 Gulf  (" + toOdooDatetime(moved.toISOString()) + " UTC)");

  const after = await readEvent(eventId);
  assert.strictEqual(after.start, "2026-08-19 11:30:00", "Odoo did not take the new time");
  assert.strictEqual(after.description.includes("rescheduled"), true);
  console.log("5. same event re-read id=" + eventId + "  start=" + after.start);

  // ---------- 6. no duplicate ----------
  const res = await fetch(`${cfg!.url}/jsonrpc`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service: "object", method: "execute_kw",
      args: [cfg!.db, await uid(), cfg!.apiKey, "calendar.event", "search_count",
             [[["name", "like", MARKER]]]] }, id: 1 }),
  });
  const count = (await res.json()).result;
  assert.strictEqual(count, 1, `expected exactly 1 calendar entry for this run, found ${count}`);
  console.log("6. duplicate check    " + count + " calendar entry for this run's viewing");

  // ---------- 7. cancel ----------
  await updateVisit(visit.id, { status: "cancelled" });
  await updateCalendarEvent(cfg!, eventId, { name: `CANCELLED — ${visit.visitorName}` });
  const cancelled = await readEvent(eventId);
  const afterCancel = await getVisit(visit.id);
  assert.ok(cancelled.name.startsWith("CANCELLED"));
  assert.strictEqual(afterCancel!.odooEventId, eventId, "cancellation must keep the same event id");
  console.log("7. cancelled          event " + eventId + " renamed, id still linked");

  // ---------- 8. clean up, so live Odoo and Postgres do not accumulate ----------
  await unlinkEvent(eventId);
  await pool().query("DELETE FROM visits WHERE id = $1", [visit.id]);
  // search_count, not read: reading a just-deleted id raises MissingError,
  // whereas a count of it is a clean 0.
  const remaining = await countById(eventId);
  assert.strictEqual(remaining, 0, "the test event was not removed from Odoo");
  console.log("8. cleaned up         event " + eventId + " deleted, PMS visit removed");

  console.log("\nPASS — one event id (" + eventId + ") throughout: create, reschedule, cancel; nothing left behind.");
  await pool().end();
}

/** How many calendar events carry this id — 0 once it is unlinked. */
async function countById(id: number): Promise<number> {
  const res = await fetch(`${cfg!.url}/jsonrpc`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service: "object", method: "execute_kw",
      args: [cfg!.db, await uid(), cfg!.apiKey, "calendar.event", "search_count", [[["id", "=", id]]]] }, id: 1 }),
  });
  return (await res.json()).result as number;
}

main().catch((e) => { console.error("FAIL", e); process.exit(1); });
