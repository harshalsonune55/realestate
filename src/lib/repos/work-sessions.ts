import "server-only";
import { q, q1 } from "../db";
import { backend } from "../data";
import { db as jsonDb, nextId as nextJsonId, write as jsonWrite } from "../store";
import type { WorkSession } from "../types";

/**
 * Time employees spend with the app open.
 *
 * The hard part is not recording sign-in, it is knowing when somebody left.
 * Almost nobody signs out: they close the tab, shut the laptop, or the machine
 * sleeps. Measuring to sign-out would count those spans until the cookie
 * expired twelve hours later, which would put people "in the app" all night.
 *
 * So the browser refreshes `lastSeenAt` while the app is open and visible, and
 * a span whose heartbeat stopped more than IDLE_MS ago is read as having ended
 * at that last heartbeat. Nothing has to run on a schedule to close spans —
 * the truncation happens when the figures are read, so a crashed server or a
 * missed cron cannot silently inflate anybody's hours.
 */

/** No heartbeat for this long and the person is treated as gone. */
export const IDLE_MS = 5 * 60_000;

/** A heartbeat closer together than this is ignored, to spare the database. */
export const HEARTBEAT_MS = 60_000;

/** Where a still-open span is considered to have ended, for counting. */
export function effectiveEnd(s: WorkSession, now = Date.now()): number {
  if (s.endedAt) return Date.parse(s.endedAt);
  const seen = Date.parse(s.lastSeenAt);
  // Still beating: the span runs to now. Gone quiet: it ended when it went
  // quiet, not when we noticed.
  return now - seen > IDLE_MS ? seen : now;
}

/** Milliseconds of a span that fall inside [from, to). */
export function overlapMs(s: WorkSession, from: number, to: number, now = Date.now()): number {
  const start = Math.max(Date.parse(s.startedAt), from);
  const end = Math.min(effectiveEnd(s, now), to);
  return Math.max(0, end - start);
}

function rowToSession(r: Record<string, unknown>): WorkSession {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    startedAt: new Date(r.started_at as string).toISOString(),
    lastSeenAt: new Date(r.last_seen_at as string).toISOString(),
    endedAt: r.ended_at ? new Date(r.ended_at as string).toISOString() : undefined,
    endedReason: (r.ended_reason as WorkSession["endedReason"]) ?? undefined,
    userAgent: (r.user_agent as string) ?? undefined,
  };
}

/* ------------------------------------------------------------------- write */

/**
 * Opens a span at sign-in.
 *
 * Any span still open for this person is closed first. Signing in on a second
 * device, or signing in again after closing the tab, would otherwise leave two
 * overlapping spans and double-count the same wall-clock hour.
 */
export async function startWorkSession(
  userId: string,
  at: string,
  userAgent?: string
): Promise<void> {
  if (backend() === "json") {
    jsonWrite((d) => {
      d.workSessions ??= [];
      for (const s of d.workSessions) {
        if (s.userId === userId && !s.endedAt) {
          s.endedAt = s.lastSeenAt;
          s.endedReason = "idle";
        }
      }
      d.workSessions.push({
        id: nextJsonId("workSession", "WS"),
        userId,
        startedAt: at,
        lastSeenAt: at,
        userAgent,
      });
    });
    return;
  }

  await q(
    `UPDATE work_sessions
        SET ended_at = last_seen_at, ended_reason = 'idle'
      WHERE user_id = $1 AND ended_at IS NULL`,
    [userId]
  );
  await q(
    `INSERT INTO work_sessions (user_id, started_at, last_seen_at, user_agent)
     VALUES ($1, $2, $2, $3)`,
    [userId, at, userAgent ?? null]
  );
}

/**
 * The heartbeat.
 *
 * Returns false when there was no open span to touch — the caller reopens one
 * rather than dropping the time, which is what happens when somebody comes
 * back after lunch to a tab that idled out.
 */
export async function touchWorkSession(userId: string, at: string): Promise<boolean> {
  if (backend() === "json") {
    return jsonWrite((d) => {
      const open = (d.workSessions ??= []).find((s) => s.userId === userId && !s.endedAt);
      if (!open) return false;
      // A span that has already gone quiet past the idle window is finished;
      // extending it now would retroactively count the silence as work.
      if (Date.parse(at) - Date.parse(open.lastSeenAt) > IDLE_MS) {
        open.endedAt = open.lastSeenAt;
        open.endedReason = "idle";
        return false;
      }
      open.lastSeenAt = at;
      return true;
    });
  }

  const row = await q1(
    `UPDATE work_sessions
        SET last_seen_at = $2
      WHERE user_id = $1
        AND ended_at IS NULL
        AND $2::timestamptz - last_seen_at <= make_interval(secs => $3)
      RETURNING id`,
    [userId, at, IDLE_MS / 1000]
  );
  if (row) return true;

  // Nothing updated: either there is no open span, or the open one is stale.
  await q(
    `UPDATE work_sessions
        SET ended_at = last_seen_at, ended_reason = 'idle'
      WHERE user_id = $1 AND ended_at IS NULL`,
    [userId]
  );
  return false;
}

/** Closes the open span deliberately — the only end time we actually know. */
export async function endWorkSession(userId: string, at: string): Promise<void> {
  if (backend() === "json") {
    jsonWrite((d) => {
      for (const s of (d.workSessions ??= [])) {
        if (s.userId === userId && !s.endedAt) {
          // Never bill silence: if the heartbeat stopped long before the sign
          // out, the span ended when the heartbeat did.
          const quiet = Date.parse(at) - Date.parse(s.lastSeenAt) > IDLE_MS;
          s.endedAt = quiet ? s.lastSeenAt : at;
          s.endedReason = quiet ? "idle" : "signed_out";
        }
      }
    });
    return;
  }

  await q(
    `UPDATE work_sessions
        SET ended_at = CASE
              WHEN $2::timestamptz - last_seen_at > make_interval(secs => $3)
              THEN last_seen_at ELSE $2::timestamptz END,
            ended_reason = CASE
              WHEN $2::timestamptz - last_seen_at > make_interval(secs => $3)
              THEN 'idle' ELSE 'signed_out' END
      WHERE user_id = $1 AND ended_at IS NULL`,
    [userId, at, IDLE_MS / 1000]
  );
}

/* -------------------------------------------------------------------- read */

/** Spans that touch [from, to), newest first. */
export async function listWorkSessions(from: string, to: string): Promise<WorkSession[]> {
  if (backend() === "json") {
    return (jsonDb().workSessions ?? [])
      .filter((s) => s.startedAt < to && (s.endedAt ?? s.lastSeenAt) >= from)
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  }

  const rows = await q(
    `SELECT * FROM work_sessions
      WHERE started_at < $2 AND COALESCE(ended_at, last_seen_at) >= $1
      ORDER BY started_at DESC`,
    [from, to]
  );
  return rows.map(rowToSession);
}
