import Link from "next/link";
import { DoorOpen, Search } from "lucide-react";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/store";
import { AED, cx, daysFromToday, fmtDate } from "@/lib/utils";
import { Badge, Card, Empty, PageHead, Stat, Table, TD, TH, Tone } from "@/components/ui";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;
const TONE: Record<string, Tone> = {
  occupied: "good",
  vacant: "warn",
  reserved: "info",
  maintenance: "neutral",
};

export default async function UnitsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; property?: string; q?: string; page?: string }>;
}) {
  await requirePerm("properties.view");
  const sp = await searchParams;
  const status = sp.status ?? "all";
  const propertyId = sp.property ?? "all";
  const q = (sp.q ?? "").trim().toLowerCase();
  const page = Math.max(1, Number(sp.page ?? 1));

  const d = db();
  const props = new Map(d.properties.map((p) => [p.id, p]));

  let rows = d.units.map((u) => {
    const contract = d.contracts.find(
      (c) => c.unitId === u.id && (c.status === "active" || c.status === "expiring")
    );
    const tenant = contract ? d.tenants.find((t) => t.id === contract.tenantId) : undefined;
    return { unit: u, property: props.get(u.propertyId)!, contract, tenant };
  });

  if (status !== "all") rows = rows.filter((r) => r.unit.status === status);
  if (propertyId !== "all") rows = rows.filter((r) => r.unit.propertyId === propertyId);
  if (q)
    rows = rows.filter(
      (r) =>
        r.unit.unitNo.toLowerCase().includes(q) ||
        (r.tenant?.name ?? "").toLowerCase().includes(q) ||
        r.property.name.toLowerCase().includes(q)
    );

  rows.sort((a, b) => a.property.name.localeCompare(b.property.name) || a.unit.unitNo.localeCompare(b.unit.unitNo));

  const counts = {
    all: d.units.length,
    occupied: d.units.filter((u) => u.status === "occupied").length,
    vacant: d.units.filter((u) => u.status === "vacant").length,
    reserved: d.units.filter((u) => u.status === "reserved").length,
    maintenance: d.units.filter((u) => u.status === "maintenance").length,
  } as Record<string, number>;

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const link = (params: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    Object.entries({ status, property: propertyId, q: sp.q, ...params }).forEach(([k, v]) => {
      if (v && v !== "all") u.set(k, v);
    });
    const s = u.toString();
    return "/units" + (s ? "?" + s : "");
  };

  return (
    <div>
      <PageHead title="Units" sub={`${d.units.length} units across ${d.properties.length} buildings.`} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Occupied" value={String(counts.occupied)} tone="good" href={link({ status: "occupied" })} />
        <Stat label="Vacant" value={String(counts.vacant)} sub="available to let" tone="warn" href={link({ status: "vacant" })} />
        <Stat label="Reserved" value={String(counts.reserved)} sub="held for pending contracts" tone="info" href={link({ status: "reserved" })} />
        <Stat label="Under maintenance" value={String(counts.maintenance)} href={link({ status: "maintenance" })} />
      </div>

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
          <form action="/units" className="relative">
            <input type="hidden" name="status" value={status} />
            <input type="hidden" name="property" value={propertyId} />
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Unit, tenant or building…"
              className="h-9 w-64 rounded-lg border border-line bg-white pl-9 pr-3 text-[13px] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </form>

          <div className="flex flex-wrap gap-1.5">
            <Link
              href={link({ property: "all", page: undefined })}
              className={cx(
                "rounded-lg border px-2.5 py-1.5 text-[12px]",
                propertyId === "all" ? "border-ink-900 bg-ink-900 text-white" : "border-line bg-white text-slate-600"
              )}
            >
              All buildings
            </Link>
            {d.properties.map((p) => (
              <Link
                key={p.id}
                href={link({ property: p.id, page: undefined })}
                className={cx(
                  "rounded-lg border px-2.5 py-1.5 text-[12px]",
                  propertyId === p.id ? "border-ink-900 bg-ink-900 text-white" : "border-line bg-white text-slate-600"
                )}
              >
                {p.code}
              </Link>
            ))}
          </div>

          <p className="tnum ml-auto text-[12.5px] text-slate-500">{rows.length} units</p>
        </div>

        <div className="px-5 pb-4 pt-2">
          {pageRows.length === 0 ? (
            <Empty title="No units match this filter" icon={<DoorOpen size={22} />} />
          ) : (
            <Table>
              <thead>
                <tr>
                  <TH>Unit</TH>
                  <TH>Building</TH>
                  <TH>Type</TH>
                  <TH>Tenant</TH>
                  <TH align="right">Rent</TH>
                  <TH>Ends</TH>
                  <TH>Status</TH>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const days = r.contract ? daysFromToday(r.contract.endDate) : null;
                  return (
                    <tr key={r.unit.id}>
                      <TD>
                        <Link href={`/units/${r.unit.id}`} className="font-medium text-ink-900 hover:text-brand-600">
                          {r.unit.unitNo}
                        </Link>
                        <span className="block text-[11px] text-slate-400">Floor {r.unit.floor}</span>
                      </TD>
                      <TD className="text-slate-600">{r.property.name}</TD>
                      <TD>
                        {r.unit.type}
                        <span className="block text-[11px] text-slate-400">{r.unit.sizeSqft} sqft</span>
                      </TD>
                      <TD className="max-w-[180px]">
                        {r.tenant ? (
                          <Link href={`/tenants/${r.tenant.id}`} className="block truncate hover:text-brand-600">
                            {r.tenant.name}
                          </Link>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TD>
                      <TD align="right" className="tnum">
                        {r.contract ? AED(r.contract.annualRent) : <span className="text-slate-400">{AED(r.unit.marketRent)}</span>}
                      </TD>
                      <TD>
                        {r.contract ? (
                          <span className={cx(days !== null && days <= 60 ? "font-medium text-amber-600" : "text-slate-600")}>
                            {fmtDate(r.contract.endDate)}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TD>
                      <TD>
                        <Badge tone={TONE[r.unit.status]} dot>
                          {r.unit.status[0].toUpperCase() + r.unit.status.slice(1)}
                        </Badge>
                      </TD>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[12.5px]">
            <span className="text-slate-500">
              Page {page} of {pages}
            </span>
            <div className="flex gap-2">
              <Link
                href={link({ page: String(Math.max(1, page - 1)) })}
                className={cx("rounded-lg border border-line px-3 py-1.5", page === 1 && "pointer-events-none opacity-40")}
              >
                Previous
              </Link>
              <Link
                href={link({ page: String(Math.min(pages, page + 1)) })}
                className={cx("rounded-lg border border-line px-3 py-1.5", page === pages && "pointer-events-none opacity-40")}
              >
                Next
              </Link>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
