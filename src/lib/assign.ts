import type { Role } from "./types";

/**
 * Who should get the next task.
 *
 * The rule this replaces was `ORDER BY created_at LIMIT 1` — the *oldest
 * account* holding the role, every single time. One person therefore collected
 * every follow-up the system ever raised for their role while their colleagues
 * sat idle, which is how one leasing agent ended up holding fifty-three open
 * tasks and another the same, with the rest of the team on none.
 *
 * The replacement is deliberately boring and explainable: give the work to
 * whoever is carrying the least right now. A manager asked "why did Priya get
 * this?" can be answered with a number rather than a shrug.
 */

/** One candidate and their current load. */
export interface Candidate {
  id: string;
  role: Role;
  /** Tasks not yet done. */
  open: number;
  /** Of those, ones already past their due date. */
  overdue: number;
  /** Epoch ms of their most recent assignment, for tie-breaking. */
  lastAssignedAt?: number;
}

/**
 * An overdue task counts treble.
 *
 * Someone with three overdue items is in more trouble than someone with three
 * that are merely open, and piling more onto them is how a person stops
 * recovering. Weighting overdue heavily routes work *away* from whoever is
 * already behind, which is the whole point of balancing.
 */
const OVERDUE_WEIGHT = 3;

export function loadOf(c: Candidate): number {
  return c.open + c.overdue * (OVERDUE_WEIGHT - 1);
}

/**
 * Picks the best-placed candidate, or null when there is nobody to pick.
 *
 * `roles` is a preference order, not a filter: a task that would ideally sit
 * with a manager but may fall to an admin passes `["manager", "admin"]`, and
 * every manager is considered before any admin. That keeps escalation
 * predictable — the fallback role is only reached when the preferred one is
 * genuinely unstaffed, never because an admin happened to be idle.
 */
export function pickAssignee(
  candidates: Candidate[],
  roles: Role[],
  /** When set and still a candidate, this person keeps the work. */
  preferred?: string | null
): string | null {
  if (preferred && candidates.some((c) => c.id === preferred)) return preferred;
  if (candidates.length === 0) return null;

  for (const role of roles) {
    const tier = candidates.filter((c) => c.role === role);
    if (tier.length === 0) continue;

    // Sorted rather than reduced so every tie-break is visible in one place.
    tier.sort(
      (a, b) =>
        loadOf(a) - loadOf(b) ||
        // Equally loaded: the one who has been waiting longest for work goes
        // first, so a quiet team still rotates instead of always picking the
        // same id.
        (a.lastAssignedAt ?? 0) - (b.lastAssignedAt ?? 0) ||
        // Last resort, purely so the choice is deterministic and a test can
        // assert it.
        a.id.localeCompare(b.id)
    );
    return tier[0].id;
  }

  return null;
}
