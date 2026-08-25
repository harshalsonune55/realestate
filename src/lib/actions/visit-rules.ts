/**
 * Viewing-booking rules. Pure functions, no I/O — the same shape as
 * `maintenance-rules.ts`, so `tests/rules.test.ts` can exercise them without a
 * database or a server.
 */

export interface VisitDraft {
  propertyId: string;
  unitId: string;
  visitorName: string;
  visitorPhone: string;
  visitorEmail: string;
  /** Local calendar date, `YYYY-MM-DD`, as the date input produces it. */
  date: string;
  /** Local wall-clock time, `HH:MM`. */
  time: string;
  durationMins: number;
  notes: string;
}

export const DURATIONS = [15, 30, 45, 60, 90] as const;

/** The window viewings may be booked in. Outside it nobody is at the office. */
export const EARLIEST_HOUR = 8;
export const LATEST_HOUR = 21;

/** How far ahead a viewing may be booked. Beyond this it is a reminder, not a booking. */
export const MAX_DAYS_AHEAD = 120;

export interface ExistingVisit {
  id: string;
  unitId: string;
  startsAt: string;
  durationMins: number;
  status: string;
}

/**
 * The instant a draft refers to, as a real UTC timestamp.
 *
 * The form collects wall-clock time in the Gulf. `new Date("2026-08-20T10:00")`
 * would parse it in the *server's* zone, which on a UK-hosted box is an hour
 * out and in the US is four hours out — the viewing would land in Odoo at the
 * wrong time and nobody would notice until a customer was kept waiting. The
 * offset is applied explicitly instead.
 */
export const GULF_OFFSET_MINUTES = 4 * 60;

export function draftInstant(date: string, time: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m || !t) return null;

  const utcMs = Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(t[1]),
    Number(t[2])
  );
  const instant = new Date(utcMs - GULF_OFFSET_MINUTES * 60_000);
  return Number.isNaN(instant.getTime()) ? null : instant;
}

/** The wall-clock hour a draft is booked at, independent of server timezone. */
export function draftHour(time: string): number {
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  return t ? Number(t[1]) : -1;
}

function overlaps(
  startA: number,
  minsA: number,
  startB: number,
  minsB: number
): boolean {
  return startA < startB + minsB * 60_000 && startB < startA + minsA * 60_000;
}

/**
 * What is wrong with the *slot*: which unit, which moment, how long.
 *
 * Split from the visitor checks so each wizard step validates only what it
 * asked for — a missing phone number should not block the step that chose the
 * time.
 */
export function slotProblems(
  draft: VisitDraft,
  existing: ExistingVisit[] = [],
  now: Date = new Date()
): string[] {
  const problems: string[] = [];

  if (!draft.unitId) problems.push("Choose the unit being viewed.");

  const instant = draftInstant(draft.date, draft.time);
  if (!instant) {
    problems.push("Pick a date and a time.");
    return problems;
  }

  if (instant.getTime() <= now.getTime()) {
    problems.push("That time has already passed.");
  }

  const daysAhead = (instant.getTime() - now.getTime()) / 86_400_000;
  if (daysAhead > MAX_DAYS_AHEAD) {
    problems.push(`Viewings can only be booked ${MAX_DAYS_AHEAD} days ahead.`);
  }

  const hour = draftHour(draft.time);
  if (hour < EARLIEST_HOUR || hour >= LATEST_HOUR) {
    problems.push(`Pick a time between ${EARLIEST_HOUR}:00 and ${LATEST_HOUR}:00.`);
  }

  if (!DURATIONS.includes(draft.durationMins as (typeof DURATIONS)[number])) {
    problems.push("Choose how long the viewing will take.");
  }

  // Double-booking one unit is the mistake this form exists to prevent: two
  // agents, two customers, one front door.
  const clash = existing.find(
    (v) =>
      v.unitId === draft.unitId &&
      v.status !== "cancelled" &&
      overlaps(
        instant.getTime(),
        draft.durationMins,
        new Date(v.startsAt).getTime(),
        v.durationMins
      )
  );
  if (clash) {
    problems.push("This unit already has a viewing booked at that time.");
  }

  return problems;
}

/** What is wrong with the *visitor*: who is coming and how to reach them. */
export function visitorProblems(draft: VisitDraft): string[] {
  const problems: string[] = [];

  if (!draft.visitorName.trim()) problems.push("Enter the visitor's name.");

  const phone = draft.visitorPhone.replace(/[\s-()]/g, "");
  if (!phone) {
    problems.push("Enter a contact number — viewings get rearranged.");
  } else if (!/^\+?\d{7,15}$/.test(phone)) {
    problems.push("That contact number does not look right.");
  }

  if (draft.visitorEmail.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.visitorEmail.trim())) {
    problems.push("That email address does not look right.");
  }

  return problems;
}

/**
 * Everything wrong with a draft. The server re-runs this whichever step the
 * client thought it had passed — a Server Action is reachable by direct POST,
 * so the wizard's own validation is a convenience, never the guard.
 */
export function visitProblems(
  draft: VisitDraft,
  existing: ExistingVisit[] = [],
  now: Date = new Date()
): string[] {
  return [...slotProblems(draft, existing, now), ...visitorProblems(draft)];
}

/** `2026-08-20T06:00:00.000Z` → "Thu 20 Aug 2026, 10:00" in Gulf time. */
export function formatVisitWhen(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + GULF_OFFSET_MINUTES * 60_000);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
  return (
    `${days[shifted.getUTCDay()]} ${shifted.getUTCDate()} ` +
    `${months[shifted.getUTCMonth()]} ${shifted.getUTCFullYear()}, ${hh}:${mm}`
  );
}

/** The title the Odoo calendar entry carries. */
export function calendarTitle(unitLabel: string, visitorName: string): string {
  return `Viewing — ${unitLabel} — ${visitorName}`;
}

/**
 * Formats an instant the way Odoo stores it: naive UTC, `YYYY-MM-DD HH:MM:SS`.
 *
 * Odoo keeps every datetime in UTC with no offset and renders it in the viewing
 * user's own timezone. Sending Gulf wall-clock time unconverted would put a
 * 10:00 viewing in the calendar at 14:00.
 *
 * Lives here rather than beside the RPC client because it is pure — keeping it
 * behind that module's `server-only` import made it untestable.
 */
export function toOdooDatetime(iso: string): string {
  return new Date(iso).toISOString().slice(0, 19).replace("T", " ");
}
