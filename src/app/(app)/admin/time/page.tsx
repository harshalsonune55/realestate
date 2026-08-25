import { Clock, Info } from "lucide-react";
import { requirePerm } from "@/lib/auth";
import { loadData } from "@/lib/data";
import { ROLE_LABEL } from "@/lib/rbac";
import {
  IDLE_MS, effectiveEnd, listWorkSessions, overlapMs,
} from "@/lib/repos/work-sessions";
import { Card, CardHead, Empty, PageHead, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

/** The office runs on Gulf wall-clock time, as the rest of the app does. */
const GULF_OFFSET_MS = 4 * 60 * 60_000;

/**
 * One reading of the clock for the whole page.
 *
 * Taken once and threaded through, so every figure below is measured against
 * the same instant — two calls a few milliseconds apart would let a span's
 * "today" total and its "this week" total disagree at a boundary.
 */
const readClock = () => Date.now();

/** Midnight in Gulf time, `daysAgo` days back, as a UTC epoch. */
function gulfMidnight(daysAgo: number): number {
  const now = new Date(Date.now() + GULF_OFFSET_MS);
  const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return day - daysAgo * 86_400_000 - GULF_OFFSET_MS;
}

function hm(ms: number): string {
  if (ms <= 0) return "—";
  const mins = Math.round(ms / 60_000);
  const h = Math.floor(mins / 60);
  return h === 0 ? `${mins}m` : `${h}h ${String(mins % 60).padStart(2, "0")}m`;
}

const clock = (iso: string) =>
  new Date(Date.parse(iso) + GULF_OFFSET_MS).toISOString().slice(11, 16);

export default async function TimePage() {
  // Per-person hours are management information, gated the same way the rest
  // of the staff view is.
  await requirePerm("admin.users");
  const d = await loadData();

  const now = readClock();
  const todayStart = gulfMidnight(0);
  const weekStart = gulfMidnight(6);

  const sessions = await listWorkSessions(
    new Date(weekStart).toISOString(),
    new Date(now).toISOString()
  );

  const rows = d.users
    .filter((u) => u.active)
    .map((u) => {
      const mine = sessions.filter((s) => s.userId === u.id);
      const today = mine.reduce((t, s) => t + overlapMs(s, todayStart, now, now), 0);
      const week = mine.reduce((t, s) => t + overlapMs(s, weekStart, now, now), 0);
      const live = mine.find((s) => !s.endedAt && now - Date.parse(s.lastSeenAt) <= IDLE_MS);
      const first = mine
        .filter((s) => effectiveEnd(s, now) >= todayStart && Date.parse(s.startedAt) < now)
        .map((s) => s.startedAt)
        .sort()[0];
      const last = mine
        .filter((s) => effectiveEnd(s, now) >= todayStart)
        .map((s) => effectiveEnd(s, now))
        .sort((a, b) => b - a)[0];

      // Output, beside the hours. Time in the app says how long somebody was
      // present; only these say what came of it.
      const tasks = d.tasks.filter((t) => t.assignedTo === u.id);
      return {
        user: u,
        today,
        week,
        live: Boolean(live),
        firstSeen: first,
        lastSeen: last,
        sessions: mine.length,
        done: tasks.filter((t) => t.status === "done").length,
        open: tasks.filter((t) => t.status !== "done").length,
        overdue: tasks.filter((t) => t.status === "overdue").length,
        actions: d.audit.filter((a) => a.actorId === u.id).length,
      };
    })
    .sort((a, b) => b.week - a.week);

  const onNow = rows.filter((r) => r.live).length;
  const totalToday = rows.reduce((t, r) => t + r.today, 0);

  return (
    <div>
      <PageHead
        title="Time in the app"
        sub="When people signed in, when they were last active, and how long the app was open in front of them."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Signed in now" value={String(onNow)} sub="active in the last 5 minutes" tone={onNow ? "good" : "neutral"} />
        <Stat label="Time today" value={hm(totalToday)} sub="across everyone" />
        <Stat label="People today" value={String(rows.filter((r) => r.today > 0).length)} sub="opened the app" />
        <Stat label="Spans this week" value={String(sessions.length)} sub="sign-in to sign-out" />
      </div>

      {/* What the number is, said plainly and next to the number itself. */}
      <div className="mb-6 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
        <Info size={16} className="mt-0.5 shrink-0 text-amber-700" />
        <p className="text-[12.5px] leading-relaxed text-amber-900">
          <b className="font-semibold">This measures time with the app open and in front of
          someone</b> — the browser reports in once a minute while the tab is visible, and a
          span ends five minutes after that stops. It is not a measure of effort or output,
          and it does not see work done in Odoo, on the phone, or at a viewing. The task and
          action counts on the right are what the time actually produced; read the two together.
        </p>
      </div>

      <Card>
        <CardHead title="By person" sub="This week, longest first." icon={<Clock size={17} />} />
        {rows.length === 0 ? (
          <Empty title="No sessions recorded yet" sub="Time is recorded from the next sign-in." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.06em] text-muted">
                  <th scope="col" className="pb-2 font-medium">Employee</th>
                  <th scope="col" className="pb-2 font-medium">First in</th>
                  <th scope="col" className="pb-2 font-medium">Last seen</th>
                  <th scope="col" className="pb-2 text-right font-medium">Today</th>
                  <th scope="col" className="pb-2 text-right font-medium">This week</th>
                  <th scope="col" className="pb-2 text-right font-medium">Done</th>
                  <th scope="col" className="pb-2 text-right font-medium">Open</th>
                  <th scope="col" className="pb-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.user.id} className="border-b border-line-soft last:border-0">
                    <th scope="row" className="py-2.5 text-left font-medium">
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className={
                            "h-2 w-2 shrink-0 rounded-full " +
                            (r.live ? "bg-emerald-500" : "bg-line-strong")
                          }
                        />
                        <span className="text-fg">{r.user.name}</span>
                        <span className="text-[11.5px] font-normal text-muted">
                          {ROLE_LABEL[r.user.role]}
                        </span>
                      </span>
                    </th>
                    <td className="tnum py-2.5 text-fg-soft">
                      {r.firstSeen ? clock(r.firstSeen) : "—"}
                    </td>
                    <td className="tnum py-2.5 text-fg-soft">
                      {r.lastSeen ? clock(new Date(r.lastSeen).toISOString()) : "—"}
                    </td>
                    <td className="tnum py-2.5 text-right font-semibold text-fg">{hm(r.today)}</td>
                    <td className="tnum py-2.5 text-right text-fg-soft">{hm(r.week)}</td>
                    <td className="tnum py-2.5 text-right text-fg-soft">{r.done}</td>
                    <td className="tnum py-2.5 text-right text-fg-soft">
                      {r.open}
                      {r.overdue > 0 && (
                        <span className="ml-1 text-[11px] font-semibold text-red-600">
                          {r.overdue} late
                        </span>
                      )}
                    </td>
                    <td className="tnum py-2.5 text-right text-fg-soft">{r.actions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-5">
        <Card>
          <CardHead title="Recent spans" sub="Newest first, this week." />
          {sessions.length === 0 ? (
            <p className="text-[12.5px] text-faint">Nothing recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {sessions.slice(0, 25).map((s) => {
                const who = d.users.find((u) => u.id === s.userId);
                const ended = effectiveEnd(s, now);
                const open = !s.endedAt && now - Date.parse(s.lastSeenAt) <= IDLE_MS;
                return (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line-soft pb-2 text-[12.5px] last:border-0"
                  >
                    <span className="font-medium text-fg">{who?.name ?? s.userId}</span>
                    <span className="tnum text-fg-soft">
                      {clock(s.startedAt)} → {open ? "now" : clock(new Date(ended).toISOString())}
                    </span>
                    <span className="tnum font-semibold text-fg">
                      {hm(ended - Date.parse(s.startedAt))}
                    </span>
                    <span className="ml-auto text-[11px] text-muted">
                      {open
                        ? "still open"
                        : s.endedReason === "signed_out"
                        ? "signed out"
                        : "went idle"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
