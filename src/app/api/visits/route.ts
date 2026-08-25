import { NextResponse } from "next/server";
import {
  createVisit, listVisits, loadData, newVisitId, nextVisitRef, updateVisit,
} from "@/lib/data";
import {
  calendarTitle, draftInstant, formatVisitWhen, visitProblems, type VisitDraft,
} from "@/lib/actions/visit-rules";
import { OdooError, createCalendarEvent, odooConfig } from "@/lib/odoo";
import { logAudit } from "@/lib/audit";
import type { User, Visit } from "@/lib/types";

/**
 * Booking API for the mobile app.
 *
 * The phone must never talk to Odoo directly, so it posts here; this route is
 * the "PMS backend" hop in mobile → backend → Postgres → Odoo. It runs the same
 * validation and the same calendar mirror the web booking uses, so a viewing
 * booked from the app lands in Postgres and in the Odoo calendar identically.
 */

/** Shared bearer token. Set PMS_API_TOKEN on the server and in the app. */
function authorised(req: Request): boolean {
  const token = process.env.PMS_API_TOKEN;
  if (!token) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${token}`;
}

interface BookBody {
  unitId: string;
  visitorName: string;
  visitorPhone: string;
  visitorEmail?: string;
  date: string; // YYYY-MM-DD (Gulf wall-clock)
  time: string; // HH:MM
  durationMins: number;
  notes?: string;
  /** Optional: the id of the signed-in mobile employee. */
  bookedBy?: string;
}

export async function POST(req: Request) {
  if (!authorised(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  let body: BookBody;
  try {
    body = (await req.json()) as BookBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed JSON." }, { status: 400 });
  }

  const d = await loadData();
  const unit = d.units.find((u) => u.id === body.unitId);
  if (!unit) return NextResponse.json({ ok: false, error: "Unit not found." }, { status: 404 });
  const property = d.properties.find((p) => p.id === unit.propertyId);

  const draft: VisitDraft = {
    propertyId: unit.propertyId,
    unitId: body.unitId,
    visitorName: body.visitorName ?? "",
    visitorPhone: body.visitorPhone ?? "",
    visitorEmail: body.visitorEmail ?? "",
    date: body.date,
    time: body.time,
    durationMins: Number(body.durationMins),
    notes: body.notes ?? "",
  };

  // Same rules the web form enforces — this is the guard, not the client.
  const problems = visitProblems(draft, await listVisits());
  if (problems.length) return NextResponse.json({ ok: false, error: problems[0] }, { status: 422 });

  const instant = draftInstant(draft.date, draft.time)!;
  const visit: Visit = {
    id: newVisitId(),
    ref: await nextVisitRef(),
    propertyId: unit.propertyId,
    unitId: unit.id,
    visitorName: draft.visitorName.trim(),
    visitorPhone: draft.visitorPhone.replace(/[\s-()]/g, ""),
    visitorEmail: draft.visitorEmail.trim() || undefined,
    startsAt: instant.toISOString(),
    durationMins: draft.durationMins,
    status: "scheduled",
    outcome: "",
    notes: draft.notes.trim(),
    bookedBy: body.bookedBy || "",
    createdAt: new Date().toISOString(),
  };

  // Postgres first — the booking stands even if Odoo is unreachable.
  await createVisit(visit);

  const actor = d.users.find((u) => u.id === body.bookedBy) ??
    ({ id: "", name: "Mobile app" } as User);
  await logAudit(actor, "visit.booked", "visit", visit.id,
    `${visit.ref} — ${property?.name ?? "Property"} Unit ${unit.unitNo} — ${formatVisitWhen(visit.startsAt)}`);

  // Mirror to the Odoo calendar, exactly as the web booking does.
  let odooEventId: number | undefined;
  let syncMessage: string | undefined;
  const cfg = odooConfig();
  if (cfg) {
    try {
      const stopIso = new Date(instant.getTime() + draft.durationMins * 60_000).toISOString();
      odooEventId = await createCalendarEvent(cfg, {
        name: calendarTitle(`${property?.name ?? "Property"} — Unit ${unit.unitNo}`, visit.visitorName),
        startIso: visit.startsAt,
        stopIso,
        location: property?.name,
        description: `Viewing ${visit.ref}<br/>Visitor: ${visit.visitorName} — ${visit.visitorPhone}`,
      });
      await updateVisit(visit.id, { odooEventId, odooSyncedAt: new Date().toISOString() });
    } catch (err) {
      syncMessage = err instanceof OdooError ? err.message : String(err);
      await updateVisit(visit.id, { odooError: syncMessage });
    }
  }

  return NextResponse.json({
    ok: true,
    visit: { id: visit.id, ref: visit.ref, startsAt: visit.startsAt },
    odooEventId: odooEventId ?? null,
    synced: Boolean(odooEventId),
    message: odooEventId ? "Booked and mirrored to the Odoo calendar." : (syncMessage ?? "Booked."),
  });
}
