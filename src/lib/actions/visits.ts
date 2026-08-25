"use server";

import { revalidatePath } from "next/cache";
import { requirePerm } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  createVisit,
  getVisit,
  listVisits,
  loadData,
  newVisitId,
  nextVisitRef,
  updateVisit,
  type VisitPatch,
} from "@/lib/data";
import { Visit } from "@/lib/types";
import {
  ODOO_MISSING,
  ODOO_NOT_CONFIGURED,
  OdooError,
  createCalendarEvent,
  odooConfig,
  updateCalendarEvent,
} from "@/lib/odoo";
import {
  VisitDraft,
  calendarTitle,
  draftInstant,
  formatVisitWhen,
  visitProblems,
} from "./visit-rules";

type Result = { ok: true; href: string; message?: string } | { ok: false; message: string };

/** Statuses whose schedule is history and must not be quietly rewritten. */
const CLOSED: Visit["status"][] = ["completed", "cancelled", "no_show"];

/**
 * Books a viewing and mirrors it into the Odoo calendar.
 *
 * The order is deliberate: the viewing is persisted **first**, then pushed. If
 * Odoo is slow, unreachable or misconfigured, the booking still stands and the
 * failure is reported as a warning. An agent standing in front of a customer
 * must never be told "try again" because an ERP is down.
 */
export async function createVisitAction(payload: string): Promise<Result> {
  const user = await requirePerm("visits.manage");
  const draft = JSON.parse(payload) as VisitDraft;

  const d = await loadData();
  const unit = d.units.find((u) => u.id === draft.unitId);
  if (!unit) return { ok: false, message: "Unit not found." };
  const property = d.properties.find((p) => p.id === unit.propertyId);

  // Re-validated here whatever the wizard thought: a Server Action is reachable
  // by direct POST, so the client's checks are a convenience, never the guard.
  const problems = visitProblems(draft, await listVisits());
  if (problems.length) return { ok: false, message: problems[0] };

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
    bookedBy: user.id,
    createdAt: new Date().toISOString(),
  };

  await createVisit(visit);
  const unitLabel = `${property?.name ?? "Property"} — Unit ${unit.unitNo}`;
  await logAudit(user, "visit.booked", "visit", visit.id,
    `${visit.ref} — ${unitLabel} — ${formatVisitWhen(visit.startsAt)}`);

  const sync = await syncToOdoo(visit, unitLabel, property?.name);
  revalidate(visit);
  return { ok: true, href: `/visits/${visit.id}?booked=1`, message: sync.message };
}

/**
 * Edits a viewing, and moves the calendar entry it already owns.
 *
 * Same ordering as booking, for the same reason. The rule that differs is the
 * clash check: a viewing must not be reported as conflicting with itself.
 */
export async function updateVisitAction(visitId: string, payload: string): Promise<Result> {
  const user = await requirePerm("visits.manage");
  const draft = JSON.parse(payload) as VisitDraft;

  const existing = await getVisit(visitId);
  if (!existing) return { ok: false, message: "Viewing not found." };
  if (CLOSED.includes(existing.status)) {
    return {
      ok: false,
      message: `This viewing is ${existing.status.replace("_", " ")} and can no longer be rescheduled.`,
    };
  }

  const d = await loadData();
  const unit = d.units.find((u) => u.id === draft.unitId);
  if (!unit) return { ok: false, message: "Unit not found." };
  const property = d.properties.find((p) => p.id === unit.propertyId);

  // Every other live viewing, minus this one — saving an unchanged time must
  // not trip the double-booking check against itself.
  const others = (await listVisits()).filter((v) => v.id !== visitId);
  const problems = visitProblems(draft, others);
  if (problems.length) return { ok: false, message: problems[0] };

  const instant = draftInstant(draft.date, draft.time)!;
  const patch: VisitPatch = {
    propertyId: unit.propertyId,
    unitId: unit.id,
    visitorName: draft.visitorName.trim(),
    visitorPhone: draft.visitorPhone.replace(/[\s-()]/g, ""),
    visitorEmail: draft.visitorEmail.trim() || undefined,
    startsAt: instant.toISOString(),
    durationMins: draft.durationMins,
    notes: draft.notes.trim(),
  };
  await updateVisit(visitId, patch);

  const updated = { ...existing, ...patch } as Visit;
  const unitLabel = `${property?.name ?? "Property"} — Unit ${unit.unitNo}`;
  await logAudit(user, "visit.updated", "visit", visitId,
    `${existing.ref} — ${formatVisitWhen(existing.startsAt)} → ${formatVisitWhen(updated.startsAt)}`);

  const sync = await syncToOdoo(updated, unitLabel, property?.name);
  revalidate(updated);
  return { ok: true, href: `/visits/${visitId}`, message: sync.message };
}

/**
 * Puts one viewing into the Odoo calendar — creating the event, or updating the
 * one this viewing already owns.
 *
 * Never throws. A calendar that is behind is a nuisance; a booking refused
 * because of it is a lost customer. The branch on `odooEventId` is what stops a
 * reschedule leaving a stale duplicate beside the corrected entry.
 */
async function syncToOdoo(
  visit: Visit,
  unitLabel: string,
  propertyName: string | undefined
): Promise<{ synced: boolean; message?: string }> {
  const cfg = odooConfig();
  // Optional integration — but say which of the two problems it is.
  if (!cfg) return { synced: false, message: ODOO_NOT_CONFIGURED };

  const stopIso = new Date(
    new Date(visit.startsAt).getTime() + visit.durationMins * 60_000
  ).toISOString();
  const event = {
    name: calendarTitle(unitLabel, visit.visitorName),
    startIso: visit.startsAt,
    stopIso,
    location: propertyName,
    description:
      `Viewing ${visit.ref}<br/>` +
      `Visitor: ${visit.visitorName} — ${visit.visitorPhone}<br/>` +
      (visit.visitorEmail ? `Email: ${visit.visitorEmail}<br/>` : "") +
      (visit.notes ? `Notes: ${visit.notes}` : ""),
  };

  try {
    if (visit.odooEventId) {
      await updateCalendarEvent(cfg, visit.odooEventId, event);
      await updateVisit(visit.id, {
        odooSyncedAt: new Date().toISOString(),
        odooError: null as unknown as undefined,
      });
    } else {
      const eventId = await createCalendarEvent(cfg, event);
      await updateVisit(visit.id, {
        odooEventId: eventId,
        odooSyncedAt: new Date().toISOString(),
        odooError: null as unknown as undefined,
      });
    }
    return { synced: true };
  } catch (err) {
    const odooErr = err instanceof OdooError ? err : null;

    // The event we were told to update is gone from Odoo. Recreating it here
    // would be a guess — somebody may have deleted it deliberately — so the id
    // is kept, the reason recorded, and a human decides via Retry.
    const vanished = odooErr?.odooException === ODOO_MISSING;
    const reason = vanished
      ? "The linked Odoo calendar entry no longer exists. Use Retry sync to recreate it."
      : (odooErr?.message ?? String(err));

    await updateVisit(visit.id, { odooError: reason });
    return {
      synced: false,
      message: vanished
        ? "Saved. The Odoo entry was deleted at the Odoo end — retry to recreate it."
        : "Saved. It has not reached the Odoo calendar yet — it can be retried.",
    };
  }
}

/**
 * Retries the calendar push for one viewing.
 *
 * Chooses create or update from whether an event id is already held, so a retry
 * can never leave two entries for one viewing. The one case that creates a
 * fresh event is a viewing whose event was deleted inside Odoo — and that
 * happens only here, on an explicit human action, never automatically.
 */
export async function retryVisitSyncAction(visitId: string): Promise<Result> {
  const user = await requirePerm("visits.manage");
  const visit = await getVisit(visitId);
  if (!visit) return { ok: false, message: "Viewing not found." };

  // "Unreachable" is for an Odoo that is configured but down. When no Odoo is
  // configured at all there is nothing to reach, and saying otherwise sends
  // someone hunting a network fault that does not exist.
  if (!odooConfig())
    return { ok: false, message: "Odoo is not set up on this server, so there is no calendar to sync to." };

  const d = await loadData();
  const unit = d.units.find((u) => u.id === visit.unitId);
  const property = d.properties.find((p) => p.id === visit.propertyId);
  const unitLabel = `${property?.name ?? "Property"} — Unit ${unit?.unitNo ?? "?"}`;

  let target = visit;
  if (visit.odooEventId && visit.odooError?.includes("no longer exists")) {
    // Deliberate: drop the dead id so this retry creates a replacement.
    await updateVisit(visitId, { odooEventId: null as unknown as undefined });
    target = { ...visit, odooEventId: undefined };
  }

  const sync = await syncToOdoo(target, unitLabel, property?.name);
  await logAudit(user, "visit.sync_retried", "visit", visitId,
    `${visit.ref} — ${sync.synced ? "synced" : "failed"}`);
  revalidate(visit);

  return sync.synced
    ? { ok: true, href: `/visits/${visitId}`, message: "Calendar updated." }
    : { ok: false, message: sync.message ?? "Odoo is still unreachable." };
}

/** Cancels a viewing, and marks the calendar entry rather than deleting it. */
export async function cancelVisitAction(visitId: string, reason: string): Promise<Result> {
  const user = await requirePerm("visits.manage");
  const visit = await getVisit(visitId);
  if (!visit) return { ok: false, message: "Viewing not found." };
  if (visit.status === "cancelled") return { ok: true, href: `/visits/${visitId}` };

  const note = reason.trim() || "No reason given";
  await updateVisit(visitId, {
    status: "cancelled",
    notes: visit.notes ? `${visit.notes}\n\nCancelled: ${note}` : `Cancelled: ${note}`,
  });

  const cfg = odooConfig();
  if (cfg && visit.odooEventId) {
    try {
      // Renamed, not deleted: the slot stays visible so nobody rebooks over a
      // cancellation the customer may still turn up for, and the history is
      // kept. The same event id stays linked.
      await updateCalendarEvent(cfg, visit.odooEventId, {
        name: `CANCELLED — ${calendarTitle("", visit.visitorName).replace("Viewing —  — ", "")}`,
      });
      await updateVisit(visitId, { odooSyncedAt: new Date().toISOString() });
    } catch (err) {
      await updateVisit(visitId, {
        odooError: err instanceof OdooError ? err.message : String(err),
      });
    }
  }

  await logAudit(user, "visit.cancelled", "visit", visitId, `${visit.ref} — ${note}`);
  revalidate(visit);
  return { ok: true, href: `/visits/${visitId}`, message: "Viewing cancelled." };
}

function revalidate(visit: Visit): void {
  revalidatePath("/visits");
  revalidatePath(`/visits/${visit.id}`);
  revalidatePath(`/units/${visit.unitId}`);
}
