import Link from "next/link";
import {
  AlertTriangle, ArrowUpRight, Building2, CalendarClock, CheckCircle2, ChevronRight,
  FilePlus2, Landmark, RefreshCw, ShieldAlert, TriangleAlert, Wrench, Info,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/store";
import { alerts, collectionForecast, enrichCheques, kpis } from "@/lib/queries";
import { AED, AEDshort, cx, daysFromToday, fmtDate, relative } from "@/lib/utils";
import { Badge, Bar, Card, CardHead, Empty, LinkButton, Stat, Table, TD, TH } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await requireUser();
  const d = db();
  const k = kpis();
  const alertList = alerts();
  const forecast = collectionForecast();

  const myTasks = d.tasks
    .filter((t) => t.assignedTo === user.id && t.status !== "done")
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));

  const upcoming = enrichCheques(
    d.cheques.filter((c) => c.status === "pending" && daysFromToday(c.dueDate) <= 14)
  )
    .filter((e) => e.contract.status === "active" || e.contract.status === "expiring")
    .sort((a, b) => (a.cheque.dueDate < b.cheque.dueDate ? -1 : 1));

  const recent = d.audit.slice(0, 8);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const maxDue = Math.max(...forecast.map((f) => f.due), 1);

  const actions = [
    can(user.role, "contracts.create") && {
      href: "/contracts/new",
      icon: FilePlus2,
      title: "New tenancy",
      sub: "8-step guided contract",
    },
    can(user.role, "cheques.deposit") && {
      href: "/cheques?flag=due_soon",
      icon: Landmark,
      title: "Deposit cheques",
      sub: `${upcoming.length} due in 14 days`,
    },
    can(user.role, "renewals.process") && {
      href: "/renewals",
      icon: RefreshCw,
      title: "Start a renewal",
      sub: `${k.expiring90} expiring`,
    },
    can(user.role, "maintenance.manage") && {
      href: "/maintenance/new",
      icon: Wrench,
      title: "Log a work order",
      sub: "Guided intake form",
    },
    can(user.role, "approvals.decide") && {
      href: "/approvals",
      icon: ShieldAlert,
      title: "Review approvals",
      sub: `${k.pendingApprovals} waiting on you`,
    },
  ].filter(Boolean) as { href: string; icon: typeof FilePlus2; title: string; sub: string }[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">
            {greeting}, {user.name.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {new Date().toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            {" · "}
            {myTasks.length === 0
              ? "You have no open tasks."
              : `You have ${myTasks.length} open task${myTasks.length > 1 ? "s" : ""}${
                  myTasks.filter((t) => t.status === "overdue").length
                    ? `, ${myTasks.filter((t) => t.status === "overdue").length} overdue`
                    : ""
                }.`}
          </p>
        </div>
        {actions.length > 0 && (
          <LinkButton href={actions[0].href} size="lg">
            <FilePlus2 size={16} />
            {actions[0].title}
          </LinkButton>
        )}
      </div>

      {/* ------------------------------------------------ critical alert band */}
      {alertList.filter((a) => a.severity === "critical").length > 0 && (
        <div className="overflow-hidden rounded-xl border border-red-200 bg-red-50">
          <div className="flex items-center gap-2 border-b border-red-200 bg-red-100/60 px-4 py-2.5">
            <TriangleAlert size={15} className="text-red-600" />
            <p className="text-[13px] font-semibold text-red-800">
              Requires attention — money is at risk
            </p>
            <Link
              href="/alerts"
              className="ml-auto text-[12px] font-medium text-red-700 hover:underline"
            >
              All alerts
            </Link>
          </div>
          <div className="divide-y divide-red-100">
            {alertList
              .filter((a) => a.severity === "critical")
              .map((a) => (
                <Link
                  key={a.id}
                  href={a.href}
                  className="flex items-center gap-3 px-4 py-3 transition hover:bg-red-100/40"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-red-600 text-[11px] font-bold text-white tnum">
                    {a.count}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-red-900">{a.title}</p>
                    <p className="truncate text-[12px] text-red-700/80">{a.detail}</p>
                  </div>
                  <ChevronRight size={15} className="shrink-0 text-red-400" />
                </Link>
              ))}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------- KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat
          label="Occupancy"
          value={`${(k.occupancy * 100).toFixed(1)}%`}
          sub={`${k.occupied} of ${k.totalUnits} units`}
          tone="good"
          href="/units"
        />
        <Stat
          label="Annual rent roll"
          value={AEDshort(k.annualised)}
          sub={`${k.activeContracts} live contracts`}
          href="/contracts"
        />
        <Stat
          label="Collected (12m)"
          value={AEDshort(k.collected)}
          sub={`${k.chequesCleared} cheques cleared`}
          tone="good"
          href="/payments"
        />
        <Stat
          label="Outstanding"
          value={AEDshort(k.outstanding)}
          sub="Cheques not yet cleared"
          href="/cheques"
        />
        <Stat
          label="At risk"
          value={AEDshort(k.atRisk)}
          sub="Overdue + bounced"
          tone="bad"
          href="/cheques?flag=overdue"
        />
        <Stat
          label="Expiring ≤90d"
          value={String(k.expiring90)}
          sub={`${k.pendingApprovals} approvals pending`}
          tone="warn"
          href="/renewals"
        />
      </div>

      {/* ------------------------------------------------------- quick launch */}
      {actions.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {actions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="group flex items-center gap-3 rounded-xl border border-line bg-surface p-3.5 transition hover:border-brand-400 hover:shadow-md"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600 transition group-hover:bg-brand-solid group-hover:text-white">
                <a.icon size={17} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-fg">{a.title}</p>
                <p className="truncate text-[12px] text-muted">{a.sub}</p>
              </div>
              <ArrowUpRight
                size={14}
                className="ml-auto shrink-0 text-faint group-hover:text-brand-600"
              />
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ------------------------------------------------------- left column */}
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHead
              title="Cheques to bank — overdue and due within 14 days"
              sub="Each one already has a task and a reminder attached to a named employee."
              icon={<CalendarClock size={17} />}
              action={
                <Link href="/cheques" className="text-[12px] font-medium text-brand-600 hover:underline">
                  View all
                </Link>
              }
            />
            {upcoming.length === 0 ? (
              <Empty title="Nothing due in the next two weeks" icon={<CheckCircle2 size={22} />} />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <TH>Due</TH>
                    <TH>Unit</TH>
                    <TH>Tenant</TH>
                    <TH>Cheque</TH>
                    <TH align="right">Amount</TH>
                    <TH>Status</TH>
                  </tr>
                </thead>
                <tbody>
                  {upcoming.slice(0, 8).map((e) => {
                    const late = daysFromToday(e.cheque.dueDate) < 0;
                    return (
                      <tr key={e.cheque.id} className="group">
                        <TD>
                          <div className="flex items-center gap-2">
                            <span
                              className={cx(
                                "h-1.5 w-1.5 shrink-0 rounded-full",
                                late ? "bg-red-500" : "bg-amber-400"
                              )}
                            />
                            <span className={cx("font-medium", late ? "text-red-600" : "text-fg")}>
                              {fmtDate(e.cheque.dueDate)}
                            </span>
                          </div>
                          <span className="ml-3.5 text-[11px] text-faint">
                            {relative(e.cheque.dueDate)}
                          </span>
                        </TD>
                        <TD>
                          <span className="font-medium text-fg">{e.unit.unitNo}</span>
                          <span className="block text-[11px] text-faint">{e.property}</span>
                        </TD>
                        <TD className="max-w-[180px] truncate">{e.tenant.name}</TD>
                        <TD>
                          <span className="tnum">{e.cheque.chequeNo}</span>
                          <span className="block text-[11px] text-faint">{e.cheque.bank}</span>
                        </TD>
                        <TD align="right" className="tnum font-medium text-fg">
                          {AED(e.cheque.amount)}
                        </TD>
                        <TD>
                          {can(user.role, "cheques.deposit") ? (
                            <Link
                              href={`/cheques/${e.cheque.id}/deposit`}
                              className="inline-flex items-center gap-1 rounded-md bg-brand-solid px-2 py-1 text-[11px] font-medium text-white transition hover:bg-brand-solid-hover"
                            >
                              Deposit
                              <ChevronRight size={12} />
                            </Link>
                          ) : (
                            <Badge tone={late ? "bad" : "warn"}>{late ? "Overdue" : "Due soon"}</Badge>
                          )}
                        </TD>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>

          <Card>
            <CardHead
              title="Expected collections — next 12 months"
              sub="Based on post-dated cheques already held in the safe."
              icon={<Landmark size={17} />}
            />
            <div className="flex h-44 items-end gap-2">
              {forecast.map((f) => (
                <div key={f.month} className="group flex flex-1 flex-col items-center gap-1.5">
                  <span className="text-[10px] font-medium text-faint opacity-0 transition group-hover:opacity-100">
                    {AEDshort(f.due)}
                  </span>
                  <div className="relative flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t bg-brand-500/85 transition group-hover:bg-brand-solid"
                      style={{ height: `${Math.max(3, (f.due / maxDue) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted">{f.label}</span>
                  <span className="tnum text-[10px] text-faint">{f.count}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 border-t border-line pt-3 text-[11px] text-faint">
              Bottom row shows the number of cheques falling due that month.
            </p>
          </Card>
        </div>

        {/* ------------------------------------------------------ right column */}
        <div className="space-y-5">
          <Card>
            <CardHead
              title="My tasks"
              sub="Assigned to you by the system."
              icon={<CheckCircle2 size={17} />}
              action={
                <Link href="/tasks" className="text-[12px] font-medium text-brand-600 hover:underline">
                  All
                </Link>
              }
            />
            {myTasks.length === 0 ? (
              <Empty title="Nothing assigned to you" sub="New work appears here automatically." />
            ) : (
              <ul className="space-y-2">
                {myTasks.slice(0, 6).map((t) => (
                  <li key={t.id}>
                    <Link
                      href="/tasks"
                      className="flex gap-3 rounded-lg border border-line p-3 transition hover:border-brand-300 hover:bg-brand-50/40"
                    >
                      <span
                        className={cx(
                          "mt-1 h-2 w-2 shrink-0 rounded-full",
                          t.status === "overdue"
                            ? "bg-red-500"
                            : t.priority === "high"
                            ? "bg-amber-400"
                            : "bg-line-strong"
                        )}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-fg">{t.title}</p>
                        <p className="truncate text-[11.5px] text-muted">{t.detail}</p>
                        <p
                          className={cx(
                            "mt-1 text-[11px]",
                            t.status === "overdue" ? "font-medium text-red-600" : "text-faint"
                          )}
                        >
                          Due {fmtDate(t.dueDate)} · {relative(t.dueDate)}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHead title="System watchlist" sub="Rules running continuously." icon={<AlertTriangle size={17} />} />
            <ul className="space-y-2">
              {alertList.map((a) => (
                <li key={a.id}>
                  <Link
                    href={a.href}
                    className={cx(
                      "flex items-start gap-2.5 rounded-lg border p-2.5 transition hover:shadow-sm",
                      a.severity === "critical"
                        ? "border-red-200 bg-red-50/60"
                        : a.severity === "warning"
                        ? "border-amber-200 bg-amber-50/50"
                        : "border-line bg-surface"
                    )}
                  >
                    {a.severity === "critical" ? (
                      <TriangleAlert size={14} className="mt-0.5 shrink-0 text-red-600" />
                    ) : a.severity === "warning" ? (
                      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
                    ) : (
                      <Info size={14} className="mt-0.5 shrink-0 text-sky-600" />
                    )}
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-medium leading-snug text-fg">{a.title}</p>
                      <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{a.detail}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHead title="Portfolio" icon={<Building2 size={17} />} />
            <div className="space-y-3">
              {d.properties.map((p) => {
                const us = d.units.filter((u) => u.propertyId === p.id);
                const occ = us.filter((u) => u.status === "occupied").length;
                return (
                  <Link key={p.id} href={`/properties/${p.id}`} className="block group">
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="truncate text-[12.5px] font-medium text-fg group-hover:text-brand-600">
                        {p.name}
                      </span>
                      <span className="tnum shrink-0 text-[11.5px] text-muted">
                        {occ}/{us.length}
                      </span>
                    </div>
                    <Bar
                      value={occ / us.length}
                      tone={occ / us.length > 0.9 ? "good" : occ / us.length > 0.75 ? "warn" : "bad"}
                    />
                  </Link>
                );
              })}
            </div>
          </Card>

          <Card>
            <CardHead
              title="Recent activity"
              sub="Every action, permanently recorded."
              icon={<ShieldAlert size={17} />}
              action={
                can(user.role, "audit.view") ? (
                  <Link href="/audit" className="text-[12px] font-medium text-brand-600 hover:underline">
                    Audit log
                  </Link>
                ) : undefined
              }
            />
            <ul className="space-y-2.5">
              {recent.map((a) => (
                <li key={a.id} className="flex gap-2.5 text-[12px]">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-line-strong" />
                  <div className="min-w-0">
                    <p className="truncate text-fg">
                      <b className="font-medium">{a.actorName.split(" ")[0]}</b> {a.summary.toLowerCase()}
                    </p>
                    <p className="text-[11px] text-faint">
                      {new Date(a.at).toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      · {a.entityId}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
