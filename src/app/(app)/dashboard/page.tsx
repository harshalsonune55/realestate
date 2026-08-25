import Link from "next/link";
import {
  Bell, CalendarClock, CheckCircle2, Clock, HelpCircle, XCircle,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { ROLE_LABEL, can, showsOnDashboard } from "@/lib/rbac";
import { loadData } from "@/lib/data";
import { kpis, leasingPipeline, portfolioSplits, revenue } from "@/lib/queries";
import { cx, relative, titleCase } from "@/lib/utils";
import CountUp from "@/components/CountUp";
import RevenuePanel from "./RevenuePanel";
import PortfolioDonuts from "./PortfolioDonuts";
import PipelinePanel from "./PipelinePanel";
import SidePanel from "./SidePanel";
import AgendaPanel, { AgendaItem } from "./AgendaPanel";

export const dynamic = "force-dynamic";

/** Two-letter initials for the avatar circles. */
function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/* The office runs on Gulf wall-clock time. Both the day a viewing belongs to
   and the times printed on it are decided here, on the server, so the agenda
   never depends on where the browser thinks it is. */
const GULF_OFFSET_MS = 4 * 60 * 60_000;
const gulf = (iso: string) => new Date(new Date(iso).getTime() + GULF_OFFSET_MS);
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const hhmm = (d: Date) => d.toISOString().slice(11, 16);
const shiftKey = (key: string, days: number) => {
  const [y, m, dd] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd) + days * 86_400_000).toISOString().slice(0, 10);
};

/** Today, as the Dubai office would write it. */
function gulfToday(): string {
  return new Date(Date.now() + GULF_OFFSET_MS).toISOString().slice(0, 10);
}

/** Viewings that are off the diary entirely rather than simply in the past. */
const AGENDA_HIDDEN = new Set(["cancelled"]);

export default async function Dashboard() {
  const user = await requireUser();
  const d = await loadData();
  const k = kpis(d);
  const rev = revenue(d);
  const splits = portfolioSplits(d);

  /* What this role's dashboard carries. Permission is checked inside
     `showsOnDashboard`, so a section can never appear for somebody whose role
     would be refused the page it links to. */
  const shows = (s: Parameters<typeof showsOnDashboard>[1]) =>
    showsOnDashboard(user.role, s);
  const pipeline = leasingPipeline(d);

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  })();

  const recent = d.audit.slice(0, 3);

  const pendingApprovals = d.approvals
    .filter((a) => a.status === "pending")
    .sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1))
    .slice(0, 5);

  const userName = (id: string) => d.users.find((u) => u.id === id)?.name ?? id;

  const activeContracts = k.activeContracts;

  // "My agenda" — the whole diary, pre-bucketed by Gulf day so the panel can
  // page between weeks without another round trip.
  const unitNo = (id: string) => d.units.find((u) => u.id === id)?.unitNo;
  const agendaItems: AgendaItem[] = (d.visits ?? [])
    .filter((v) => !AGENDA_HIDDEN.has(v.status))
    .map((v) => {
      const start = gulf(v.startsAt);
      const end = new Date(start.getTime() + v.durationMins * 60_000);
      const no = unitNo(v.unitId);
      return {
        id: v.id,
        visitorName: v.visitorName,
        unitLabel: no ? `Unit ${no}` : "",
        dayKey: dayKey(start),
        startLabel: hhmm(start),
        endLabel: hhmm(end),
        status: v.status,
      };
    });

  const todayKey = gulfToday();
  const [ty, tm, td] = todayKey.split("-").map(Number);
  const weekStartKey = shiftKey(todayKey, -((new Date(Date.UTC(ty, tm - 1, td)).getUTCDay() + 6) % 7));
  const weekEndKey = shiftKey(weekStartKey, 6);

  const thisWeek = agendaItems.filter(
    (a) => a.dayKey >= weekStartKey && a.dayKey <= weekEndKey
  );
  const clientsThisWeek = thisWeek.length;
  const upcomingNames = agendaItems
    .filter((a) => a.dayKey >= todayKey && a.status !== "completed")
    .sort((a, b) => (a.dayKey + a.startLabel < b.dayKey + b.startLabel ? -1 : 1))
    .map((a) => a.visitorName);

  return (
    <div className="flex flex-col gap-6 xl:flex-row">
      {/* ============================= main column ============================= */}
      <div className="min-w-0 flex-1">
        {/* welcome header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-bold tracking-[-0.02em] text-fg">
              {greeting}, {user.name.split(" ")[0]}!
            </h1>
            <p className="mt-1 text-[14px] text-muted">
              Easily manage the portfolio and keep every process on track.
            </p>
          </div>
          <div className="flex shrink-0 gap-2.5">
            {can(user.role, "assistant.use") && (
              <Link
                href="/assistant"
                className="grid h-11 w-11 place-items-center rounded-full border border-line bg-surface text-fg transition hover:border-line-strong"
                title="Assistant"
              >
                <HelpCircle size={18} />
              </Link>
            )}
            <Link
              href="/alerts"
              className="relative grid h-11 w-11 place-items-center rounded-full border border-line bg-surface text-fg transition hover:border-line-strong"
              title="Alerts"
            >
              <Bell size={18} />
              <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-red-500 ring-2 ring-surface" />
            </Link>
          </div>
        </div>

        {/* pastel finance cards */}
        {shows("finance") && (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FinanceCard tone="amber" label="Outstanding" amount={k.outstanding} />
            <FinanceCard tone="sky" label="Collected (12 mo)" amount={k.collected} />
            <FinanceCard tone="gold" label="At risk" amount={k.atRisk} />
          </div>
        )}

        {/* revenue — windowed totals over the twelve-month series */}
        {shows("revenue") && (
          <div className="mt-6">
            <RevenuePanel windows={rev.windows} months={rev.months} />
          </div>
        )}

        {/* leasing funnel — viewings in, tenancies out */}
        {shows("pipeline") && (
          <div className="mt-6">
            <PipelinePanel
              months={pipeline.months}
              stages={pipeline.stages}
              lost={pipeline.lost}
            />
          </div>
        )}

        {/* the two part-to-whole rings */}
        {(shows("unitRing") || shows("chequeRing")) && (
          <div className="mt-6">
            <PortfolioDonuts
              units={shows("unitRing") ? splits.units : undefined}
              cheques={shows("chequeRing") ? splits.cheques : undefined}
            />
          </div>
        )}

        {/* recent activity + clients */}
        {(shows("activity") || shows("tenancies")) && (
        <div
          className={cx(
            "mt-7 grid grid-cols-1 gap-6",
            shows("activity") && shows("tenancies") && "lg:grid-cols-2"
          )}
        >
          {/* recent activity */}
          {shows("activity") && (
          <section>
            <h2 className="mb-3 text-[19px] font-bold text-fg">Recent activity</h2>
            <div className="space-y-3">
              {recent.length === 0 ? (
                <p className="text-[13px] text-muted">Nothing recorded yet.</p>
              ) : (
                recent.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-xs"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-subtle text-[12px] font-bold text-fg-soft">
                      {initials(a.actorName)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-[13.5px] font-semibold text-fg">
                          {a.actorName}
                        </p>
                        <span className="shrink-0 text-[11.5px] text-faint">
                          {relative(a.at)}
                        </span>
                      </div>
                      <p className="truncate text-[12.5px] text-muted">{a.summary}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
          )}

          {/* my clients / occupancy */}
          {shows("tenancies") && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[19px] font-bold text-fg">Active tenancies</h2>
            </div>
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
              <div className="flex items-start justify-between">
                <CountUp
                  value={activeContracts}
                  format="whole"
                  className="text-[40px] font-extrabold leading-none tracking-[-0.03em] text-fg"
                />
                <Link
                  href="/contracts"
                  className="rounded-xl border border-line px-3.5 py-2 text-[12.5px] font-semibold text-fg-soft transition hover:border-line-strong"
                >
                  View all
                </Link>
              </div>
              <div className="my-4 h-px bg-line-soft" />
              <div className="flex items-center gap-3">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-100 text-brand-700">
                  <CalendarClock size={16} />
                </span>
                <p className="text-[13.5px] text-fg-soft">
                  <CountUp value={clientsThisWeek} format="whole" className="font-bold text-fg" />{" "}
                  viewings this week
                </p>
              </div>
              <div className="mt-4 flex items-center">
                <AvatarStack names={upcomingNames} />
                <span className="ml-3 grid h-8 items-center rounded-full bg-inverse px-3 text-[12px] font-semibold text-inverse-fg">
                  <span>
                    <CountUp value={k.occupied} format="whole" /> occupied
                  </span>
                </span>
              </div>
            </div>
          </section>
          )}
        </div>
        )}

        {/* session / approval requests */}
        {shows("approvals") && (
        <section className="mt-8">
          <h2 className="mb-4 text-[19px] font-bold text-fg">Session requests</h2>
          {pendingApprovals.length === 0 ? (
            <p className="text-[13px] text-muted">No requests waiting on a decision.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr className="border-b border-line-soft text-left text-[12px] font-medium uppercase tracking-[0.06em] text-muted">
                    <th className="pb-3 font-medium">Requested by</th>
                    <th className="pb-3 font-medium">Requested</th>
                    <th className="pb-3 font-medium">Type</th>
                    <th className="pb-3 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingApprovals.map((a) => (
                    <tr key={a.id} className="border-b border-line-soft last:border-0">
                      <td className="py-3.5">
                        <div className="flex items-center gap-3">
                          <span className="grid h-9 w-9 place-items-center rounded-full bg-subtle text-[11px] font-bold text-fg-soft">
                            {initials(userName(a.requestedBy))}
                          </span>
                          <span className="text-[13.5px] font-semibold text-fg">
                            {userName(a.requestedBy)}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 text-[13px] text-fg-soft">{relative(a.requestedAt)}</td>
                      <td className="py-3.5 text-[13px] text-fg-soft">
                        {titleCase(a.type.replace(/_/g, " "))}
                      </td>
                      <td className="py-3.5 text-right">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-[12.5px] font-semibold text-amber-700">
                          <Clock size={13} /> Pending
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        )}
      </div>

      {/* ============================= right column ============================= */}
      <SidePanel>
        <div className="rounded-3xl border border-line bg-canvas p-5">
          {/* profile */}
          <div className="flex flex-col items-center text-center">
            <div className="relative">
              <span className="grid h-24 w-24 place-items-center rounded-full bg-inverse text-[26px] font-bold text-inverse-fg">
                {initials(user.name)}
              </span>
              <span className="absolute bottom-1.5 right-1.5 h-4 w-4 rounded-full bg-emerald-500 ring-4 ring-canvas" />
            </div>
            <h3 className="mt-3 text-[18px] font-bold text-fg">{user.name}</h3>
            <p className="text-[13px] text-muted">{user.title || ROLE_LABEL[user.role]}</p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-2 text-[13px] font-semibold text-fg">
              <CheckCircle2 size={15} className="text-emerald-500" /> Available
            </div>
          </div>

          <div className="my-5 h-px bg-line" />

          {/* agenda — the diary, one day at a time */}
          {shows("agenda") && (
            <AgendaPanel
              items={agendaItems}
              todayKey={todayKey}
              weekStartKey={weekStartKey}
            />
          )}

        </div>
      </SidePanel>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function FinanceCard({
  tone,
  label,
  amount,
}: {
  tone: "amber" | "sky" | "gold";
  label: string;
  /** Raw figure — the card counts up to it, so it cannot arrive pre-formatted. */
  amount: number;
}) {
  const bg = {
    amber: "bg-[#f6dd8a]",
    sky: "bg-[#c9d8ea]",
    gold: "bg-[#e0d3ea]",
  }[tone];
  return (
    <div className={cx("rounded-3xl p-5 text-[#1c1c1c]", bg)}>
      <p className="text-[13.5px] font-semibold">{label}</p>
      <div className="mt-6 flex items-end justify-between">
        <CountUp
          value={amount}
          format="aed"
          className="text-[30px] font-bold leading-none tracking-[-0.02em]"
        />
        <span className="grid h-9 w-9 place-items-center rounded-full bg-white/80 text-[#1c1c1c]">
          <XCircle size={0} className="hidden" />
          <CoinIcon />
        </span>
      </div>
    </div>
  );
}

function CoinIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <ellipse cx="12" cy="6.5" rx="7" ry="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 6.5v5c0 1.66 3.13 3 7 3s7-1.34 7-3v-5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 11.5v5c0 1.66 3.13 3 7 3s7-1.34 7-3v-5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function AvatarStack({ names }: { names: string[] }) {
  const shown = names.slice(0, 3);
  return (
    <div className="flex -space-x-2.5">
      {shown.map((n, i) => (
        <span
          key={i}
          className="grid h-9 w-9 place-items-center rounded-full bg-subtle text-[11px] font-bold text-fg-soft ring-2 ring-surface"
        >
          {initials(n)}
        </span>
      ))}
    </div>
  );
}
