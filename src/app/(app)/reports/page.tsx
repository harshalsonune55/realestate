import Link from "next/link";
import { BarChart3, Building2, Landmark, TrendingUp, Users } from "lucide-react";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/store";
import { chequeFlag, collectionForecast, kpis } from "@/lib/queries";
import { AEDshort, addDays, cx, daysFromToday } from "@/lib/utils";
import { Bar, Card, CardHead, PageHead, Stat, Table, TD, TH } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  await requirePerm("reports.view");
  const d = db();
  const k = kpis();
  const forecast = collectionForecast();
  const maxDue = Math.max(...forecast.map((f) => f.due), 1);

  /* ---------------------------------------------- collection performance -- */
  const liveContractIds = new Set(
    d.contracts.filter((c) => c.status === "active" || c.status === "expiring").map((c) => c.id)
  );
  const dueCheques = d.cheques.filter(
    (c) => liveContractIds.has(c.contractId) && daysFromToday(c.dueDate) <= 0
  );
  const onTime = dueCheques.filter(
    (c) => c.depositedAt && c.depositedAt <= addDays(c.dueDate, 2)
  ).length;
  const late = dueCheques.filter(
    (c) => c.depositedAt && c.depositedAt > addDays(c.dueDate, 2)
  ).length;
  const neverDeposited = dueCheques.filter((c) => c.status === "pending").length;
  const bouncedAll = dueCheques.filter((c) => c.status === "bounced").length;

  /* -------------------------------------------------------- per building -- */
  const byProperty = d.properties.map((p) => {
    const units = d.units.filter((u) => u.propertyId === p.id);
    const unitIds = new Set(units.map((u) => u.id));
    const contracts = d.contracts.filter(
      (c) => unitIds.has(c.unitId) && (c.status === "active" || c.status === "expiring")
    );
    const ids = new Set(contracts.map((c) => c.id));
    const cheques = d.cheques.filter((c) => ids.has(c.contractId));
    const cleared = cheques.filter((c) => c.status === "cleared").reduce((s, c) => s + c.amount, 0);
    const risk = cheques
      .filter((c) => chequeFlag(c) === "overdue" || c.status === "bounced")
      .reduce((s, c) => s + c.amount, 0);
    const occupied = units.filter((u) => u.status === "occupied").length;
    return {
      p,
      units: units.length,
      occupied,
      occupancy: units.length ? occupied / units.length : 0,
      rent: contracts.reduce((s, c) => s + c.annualRent, 0),
      cleared,
      risk,
      maintenance: d.maintenance.filter((m) => unitIds.has(m.unitId) && !["closed", "completed", "rejected"].includes(m.status)).length,
    };
  });

  /* ---------------------------------------------------- employee activity -- */
  const staff = d.users
    .filter((u) => u.active && u.role !== "viewer")
    .map((u) => ({
      u,
      created: d.contracts.filter((c) => c.createdBy === u.id).length,
      deposits: d.cheques.filter((c) => c.depositedBy === u.id).length,
      open: d.tasks.filter((t) => t.assignedTo === u.id && t.status !== "done").length,
      overdue: d.tasks.filter((t) => t.assignedTo === u.id && t.status === "overdue").length,
      done: d.tasks.filter((t) => t.assignedTo === u.id && t.status === "done").length,
    }));

  /* --------------------------------------------------------- unit mix ------ */
  const mix = Object.entries(
    d.units.reduce<Record<string, { n: number; occ: number }>>((acc, u) => {
      acc[u.type] ??= { n: 0, occ: 0 };
      acc[u.type].n += 1;
      if (u.status === "occupied") acc[u.type].occ += 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1].n - a[1].n);

  const collectionRate = dueCheques.length ? (onTime + late) / dueCheques.length : 1;

  return (
    <div>
      <PageHead
        title="Reports"
        sub="The numbers a manager needs to see leakage before it becomes a loss."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Rent roll" value={AEDshort(k.annualised)} sub="annualised" />
        <Stat label="Collected (12m)" value={AEDshort(k.collected)} tone="good" />
        <Stat label="Outstanding" value={AEDshort(k.outstanding)} sub="cheques not cleared" />
        <Stat label="At risk" value={AEDshort(k.atRisk)} sub="overdue + bounced" tone="bad" />
        <Stat
          label="Collection rate"
          value={`${(collectionRate * 100).toFixed(1)}%`}
          sub="of due cheques banked"
          tone={collectionRate > 0.97 ? "good" : "warn"}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHead
            title="Expected collections — next 12 months"
            sub="Value of post-dated cheques falling due, month by month."
            icon={<TrendingUp size={17} />}
          />
          <div className="flex h-52 items-end gap-2">
            {forecast.map((f) => (
              <div key={f.month} className="group flex flex-1 flex-col items-center gap-1.5">
                <span className="text-[10px] font-medium text-slate-500 opacity-0 transition group-hover:opacity-100">
                  {AEDshort(f.due)}
                </span>
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t bg-brand-500/85 transition group-hover:bg-brand-600"
                    style={{ height: `${Math.max(3, (f.due / maxDue) * 100)}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-500">{f.label}</span>
                <span className="tnum text-[10px] text-slate-300">{f.count}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHead
            title="Cheque discipline"
            sub="Of every cheque already past its due date."
            icon={<Landmark size={17} />}
          />
          <div className="space-y-3">
            {[
              { label: "Deposited on time", n: onTime, tone: "good" as const },
              { label: "Deposited late", n: late, tone: "warn" as const },
              { label: "Never deposited", n: neverDeposited, tone: "bad" as const },
              { label: "Returned by bank", n: bouncedAll, tone: "bad" as const },
            ].map((r) => (
              <div key={r.label}>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-[12.5px] text-slate-600">{r.label}</span>
                  <span className="tnum text-[12.5px] font-semibold text-ink-900">
                    {r.n}
                    <span className="ml-1.5 text-[11px] font-normal text-slate-400">
                      {dueCheques.length ? ((r.n / dueCheques.length) * 100).toFixed(1) : 0}%
                    </span>
                  </span>
                </div>
                <Bar value={dueCheques.length ? r.n / dueCheques.length : 0} tone={r.tone} />
              </div>
            ))}
          </div>
          <p className="mt-4 border-t border-line pt-3 text-[11.5px] text-slate-500">
            &quot;Never deposited&quot; is the leakage number. Every one of these is a cheque the
            company holds but has not banked.
          </p>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2" padded={false}>
          <div className="border-b border-line px-5 py-3">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink-900">
              <Building2 size={17} className="text-brand-600" /> Performance by building
            </h2>
          </div>
          <div className="px-5 pb-4 pt-2">
            <Table>
              <thead>
                <tr>
                  <TH>Building</TH>
                  <TH align="center">Units</TH>
                  <TH>Occupancy</TH>
                  <TH align="right">Rent roll</TH>
                  <TH align="right">Collected</TH>
                  <TH align="right">At risk</TH>
                  <TH align="center">Jobs</TH>
                </tr>
              </thead>
              <tbody>
                {byProperty.map((r) => (
                  <tr key={r.p.id}>
                    <TD>
                      <Link href={`/properties/${r.p.id}`} className="font-medium text-ink-900 hover:text-brand-600">
                        {r.p.name}
                      </Link>
                      <span className="block text-[11px] text-slate-400">{r.p.area}</span>
                    </TD>
                    <TD align="center" className="tnum">{r.units}</TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <span className="tnum w-10 text-[12px]">{(r.occupancy * 100).toFixed(0)}%</span>
                        <div className="w-16">
                          <Bar value={r.occupancy} tone={r.occupancy > 0.9 ? "good" : r.occupancy > 0.75 ? "warn" : "bad"} />
                        </div>
                      </div>
                    </TD>
                    <TD align="right" className="tnum">{AEDshort(r.rent)}</TD>
                    <TD align="right" className="tnum text-brand-600">{AEDshort(r.cleared)}</TD>
                    <TD align="right" className={cx("tnum", r.risk > 0 && "font-semibold text-red-600")}>
                      {r.risk ? AEDshort(r.risk) : "—"}
                    </TD>
                    <TD align="center" className="tnum">{r.maintenance}</TD>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>

        <Card>
          <CardHead title="Unit mix and occupancy" icon={<BarChart3 size={17} />} />
          <div className="space-y-3">
            {mix.map(([type, v]) => (
              <div key={type}>
                <div className="mb-1 flex items-baseline justify-between text-[12.5px]">
                  <span className="text-slate-600">{type}</span>
                  <span className="tnum text-slate-500">
                    {v.occ}/{v.n} let
                  </span>
                </div>
                <Bar value={v.occ / v.n} tone={v.occ / v.n > 0.9 ? "good" : "warn"} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-5" padded={false}>
        <div className="border-b border-line px-5 py-3">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink-900">
            <Users size={17} className="text-brand-600" /> Employee activity
          </h2>
          <p className="mt-0.5 text-[12.5px] text-slate-500">
            Who is doing the work, and who is falling behind.
          </p>
        </div>
        <div className="px-5 pb-4 pt-2">
          <Table>
            <thead>
              <tr>
                <TH>Employee</TH>
                <TH>Role</TH>
                <TH align="center">Contracts prepared</TH>
                <TH align="center">Cheques deposited</TH>
                <TH align="center">Tasks closed</TH>
                <TH align="center">Open</TH>
                <TH align="center">Overdue</TH>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.u.id}>
                  <TD>
                    <span className="font-medium text-ink-900">{s.u.name}</span>
                    <span className="block text-[11px] text-slate-400">{s.u.title}</span>
                  </TD>
                  <TD className="capitalize text-slate-600">{s.u.role}</TD>
                  <TD align="center" className="tnum">{s.created}</TD>
                  <TD align="center" className="tnum">{s.deposits}</TD>
                  <TD align="center" className="tnum">{s.done}</TD>
                  <TD align="center" className="tnum">{s.open}</TD>
                  <TD align="center" className={cx("tnum", s.overdue > 0 && "font-semibold text-red-600")}>
                    {s.overdue}
                  </TD>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
