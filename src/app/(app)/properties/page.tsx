import Link from "next/link";
import { Building2, MapPin } from "lucide-react";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/store";
import { AEDshort, daysFromToday } from "@/lib/utils";
import { Badge, Bar, Card, PageHead, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PropertiesPage() {
  await requirePerm("properties.view");
  const d = db();

  const rows = d.properties.map((p) => {
    const units = d.units.filter((u) => u.propertyId === p.id);
    const occupied = units.filter((u) => u.status === "occupied").length;
    const contracts = d.contracts.filter(
      (c) => units.some((u) => u.id === c.unitId) && (c.status === "active" || c.status === "expiring")
    );
    const rent = contracts.reduce((s, c) => s + c.annualRent, 0);
    const contractIds = new Set(contracts.map((c) => c.id));
    const cheques = d.cheques.filter((c) => contractIds.has(c.contractId));
    const atRisk = cheques.filter(
      (c) => c.status === "bounced" || (c.status === "pending" && daysFromToday(c.dueDate) < 0)
    );
    const maint = d.maintenance.filter(
      (m) => units.some((u) => u.id === m.unitId) && !["closed", "completed", "rejected"].includes(m.status)
    );
    return { p, units, occupied, rent, atRisk, maint, manager: d.users.find((u) => u.id === p.managerId) };
  });

  const totalUnits = d.units.length;
  const totalOccupied = d.units.filter((u) => u.status === "occupied").length;
  const totalRent = rows.reduce((s, r) => s + r.rent, 0);

  return (
    <div>
      <PageHead
        title="Properties"
        sub={`${d.properties.length} buildings, ${totalUnits} units under management.`}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Buildings" value={String(d.properties.length)} sub="under management" />
        <Stat label="Units" value={String(totalUnits)} sub={`${totalOccupied} occupied`} />
        <Stat
          label="Occupancy"
          value={`${((totalOccupied / totalUnits) * 100).toFixed(1)}%`}
          sub="portfolio average"
          tone="good"
        />
        <Stat label="Annual rent roll" value={AEDshort(totalRent)} sub="from live contracts" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map((r) => {
          const occ = r.units.length ? r.occupied / r.units.length : 0;
          return (
            <Link key={r.p.id} href={`/properties/${r.p.id}`}>
              <Card className="h-full transition hover:border-brand-300 hover:shadow-md">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-ink-900 text-[13px] font-bold text-white">
                    {r.p.code}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[15px] font-semibold text-ink-900">{r.p.name}</h3>
                    <p className="mt-0.5 flex items-center gap-1 text-[12px] text-slate-500">
                      <MapPin size={12} /> {r.p.area}, {r.p.city}
                    </p>
                  </div>
                  {r.atRisk.length > 0 && <Badge tone="bad" dot>{r.atRisk.length} at risk</Badge>}
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">Units</p>
                    <p className="tnum mt-0.5 text-[16px] font-semibold text-ink-900">{r.units.length}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">Occupancy</p>
                    <p className="tnum mt-0.5 text-[16px] font-semibold text-ink-900">
                      {(occ * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">Rent roll</p>
                    <p className="tnum mt-0.5 text-[16px] font-semibold text-ink-900">{AEDshort(r.rent)}</p>
                  </div>
                </div>

                <div className="mt-3">
                  <Bar value={occ} tone={occ > 0.9 ? "good" : occ > 0.75 ? "warn" : "bad"} />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-[11.5px] text-slate-500">
                  <span>
                    <Building2 size={11} className="mr-1 inline" />
                    {r.p.floors} floors · built {r.p.yearBuilt}
                  </span>
                  <span>{r.maint.length} open jobs</span>
                  <span className="ml-auto">Managed by {r.manager?.name.split(" ")[0]}</span>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
