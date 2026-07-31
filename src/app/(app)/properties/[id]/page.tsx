import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/store";
import { chequeFlag } from "@/lib/queries";
import { AED, AEDshort, cx, daysFromToday, fmtDate } from "@/lib/utils";
import { Badge, Card, CardHead, PageHead, Stat, Table, TD, TH, Tone } from "@/components/ui";
import { KV } from "@/components/form";

export const dynamic = "force-dynamic";

const UNIT_TONE: Record<string, Tone> = {
  occupied: "good",
  vacant: "warn",
  reserved: "info",
  maintenance: "neutral",
};

export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePerm("properties.view");
  const { id } = await params;

  const d = db();
  const property = d.properties.find((p) => p.id === id);
  if (!property) notFound();

  const units = d.units.filter((u) => u.propertyId === property.id).sort((a, b) => a.unitNo.localeCompare(b.unitNo));
  const unitIds = new Set(units.map((u) => u.id));
  const contracts = d.contracts.filter((c) => unitIds.has(c.unitId));
  const live = contracts.filter((c) => c.status === "active" || c.status === "expiring");
  const contractIds = new Set(live.map((c) => c.id));
  const cheques = d.cheques.filter((c) => contractIds.has(c.contractId));
  const maint = d.maintenance.filter((m) => unitIds.has(m.unitId) && !["closed", "completed", "rejected"].includes(m.status));

  const occupied = units.filter((u) => u.status === "occupied").length;
  const rentRoll = live.reduce((s, c) => s + c.annualRent, 0);
  const collected = cheques.filter((c) => c.status === "cleared").reduce((s, c) => s + c.amount, 0);
  const atRisk = cheques.filter((c) => chequeFlag(c) === "overdue" || c.status === "bounced");

  const tenantOf = (unitId: string) => {
    const c = live.find((x) => x.unitId === unitId);
    return c ? d.tenants.find((t) => t.id === c.tenantId) : undefined;
  };
  const contractOf = (unitId: string) => live.find((x) => x.unitId === unitId);

  return (
    <div>
      <Link href="/properties" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-ink-900">
        <ArrowLeft size={14} /> All properties
      </Link>

      <PageHead
        title={property.name}
        sub={`${property.area}, ${property.city} · ${property.floors} floors · built ${property.yearBuilt}`}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Units" value={String(units.length)} sub={`${occupied} occupied`} />
        <Stat
          label="Occupancy"
          value={`${((occupied / units.length) * 100).toFixed(1)}%`}
          tone={occupied / units.length > 0.9 ? "good" : "warn"}
        />
        <Stat label="Rent roll" value={AEDshort(rentRoll)} sub="annualised" />
        <Stat label="Collected" value={AEDshort(collected)} sub="cleared cheques" tone="good" />
        <Stat
          label="At risk"
          value={String(atRisk.length)}
          sub={AED(atRisk.reduce((s, c) => s + c.amount, 0))}
          tone={atRisk.length ? "bad" : "good"}
          href="/cheques?flag=overdue"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <Card padded={false}>
          <div className="border-b border-line px-5 py-3">
            <h2 className="text-[15px] font-semibold text-ink-900">Units</h2>
          </div>
          <div className="px-5 pb-4 pt-2">
            <Table>
              <thead>
                <tr>
                  <TH>Unit</TH>
                  <TH>Type</TH>
                  <TH>Tenant</TH>
                  <TH align="right">Rent</TH>
                  <TH>Contract ends</TH>
                  <TH>Status</TH>
                </tr>
              </thead>
              <tbody>
                {units.map((u) => {
                  const t = tenantOf(u.id);
                  const c = contractOf(u.id);
                  const days = c ? daysFromToday(c.endDate) : null;
                  return (
                    <tr key={u.id}>
                      <TD>
                        <Link href={`/units/${u.id}`} className="font-medium text-ink-900 hover:text-brand-600">
                          {u.unitNo}
                        </Link>
                        <span className="block text-[11px] text-slate-400">Floor {u.floor}</span>
                      </TD>
                      <TD>
                        {u.type}
                        <span className="block text-[11px] text-slate-400">{u.sizeSqft} sqft</span>
                      </TD>
                      <TD className="max-w-[180px]">
                        {t ? (
                          <Link href={`/tenants/${t.id}`} className="block truncate hover:text-brand-600">
                            {t.name}
                          </Link>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TD>
                      <TD align="right" className="tnum">
                        {c ? AED(c.annualRent) : AED(u.marketRent) + " list"}
                      </TD>
                      <TD>
                        {c ? (
                          <span className={cx(days !== null && days <= 60 ? "font-medium text-amber-600" : "text-slate-600")}>
                            {fmtDate(c.endDate)}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TD>
                      <TD>
                        <Badge tone={UNIT_TONE[u.status]} dot>
                          {u.status[0].toUpperCase() + u.status.slice(1)}
                        </Badge>
                      </TD>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHead title="Building" icon={<MapPin size={17} />} />
            <KV label="Code" value={property.code} strong />
            <KV label="Owner" value={property.owner} />
            <KV label="Address" value={property.address} />
            <KV label="Floors" value={String(property.floors)} />
            <KV label="Year built" value={String(property.yearBuilt)} />
            <KV label="Managed by" value={d.users.find((u) => u.id === property.managerId)?.name ?? "—"} />
          </Card>

          <Card>
            <CardHead title="Unit mix" />
            <div className="space-y-2">
              {Object.entries(
                units.reduce<Record<string, number>>((acc, u) => {
                  acc[u.type] = (acc[u.type] ?? 0) + 1;
                  return acc;
                }, {})
              ).map(([type, n]) => (
                <div key={type} className="flex items-center justify-between text-[12.5px]">
                  <span className="text-slate-600">{type}</span>
                  <span className="tnum font-medium text-ink-900">{n}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHead title="Open maintenance" sub={`${maint.length} job(s)`} />
            {maint.length === 0 ? (
              <p className="text-[12.5px] text-slate-400">Nothing open on this building.</p>
            ) : (
              <ul className="space-y-2">
                {maint.slice(0, 8).map((m) => (
                  <li key={m.id}>
                    <Link href={`/maintenance/${m.id}`} className="block rounded-lg border border-line p-2.5 hover:bg-slate-50">
                      <p className="text-[12.5px] font-medium text-ink-900">
                        {m.ref} · {m.category}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {d.units.find((u) => u.id === m.unitId)?.unitNo} · due {fmtDate(m.slaDueAt)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
