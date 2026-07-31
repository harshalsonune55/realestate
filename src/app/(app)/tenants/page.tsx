import Link from "next/link";
import { Search, Users } from "lucide-react";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/store";
import { chequeFlag } from "@/lib/queries";
import { AED, cx } from "@/lib/utils";
import { Badge, Card, Empty, PageHead, Stat, Table, TD, TH } from "@/components/ui";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;

export default async function TenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; flag?: string }>;
}) {
  await requirePerm("tenants.view");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const flag = sp.flag ?? "all";
  const page = Math.max(1, Number(sp.page ?? 1));

  const d = db();
  const units = new Map(d.units.map((u) => [u.id, u]));
  const props = new Map(d.properties.map((p) => [p.id, p]));

  let rows = d.tenants.map((t) => {
    const contracts = d.contracts.filter((c) => c.tenantId === t.id);
    const live = contracts.find((c) => c.status === "active" || c.status === "expiring");
    const unit = live ? units.get(live.unitId) : undefined;
    const contractIds = new Set(contracts.map((c) => c.id));
    const cheques = d.cheques.filter((c) => contractIds.has(c.contractId));
    const bounced = cheques.filter((c) => c.status === "bounced").length;
    const overdue = cheques.filter((c) => chequeFlag(c) === "overdue").length;
    return {
      tenant: t,
      live,
      unit,
      property: unit ? props.get(unit.propertyId) : undefined,
      contracts: contracts.length,
      bounced,
      overdue,
      arrears: cheques
        .filter((c) => c.status === "bounced" || chequeFlag(c) === "overdue")
        .reduce((s, c) => s + c.amount, 0),
    };
  });

  const problemCount = rows.filter((r) => r.bounced > 0 || r.overdue > 0).length;

  if (flag === "problem") rows = rows.filter((r) => r.bounced > 0 || r.overdue > 0);
  else if (flag === "active") rows = rows.filter((r) => r.live);
  if (q)
    rows = rows.filter(
      (r) =>
        r.tenant.name.toLowerCase().includes(q) ||
        r.tenant.emiratesId.includes(q) ||
        r.tenant.phone.includes(q) ||
        (r.unit?.unitNo ?? "").toLowerCase().includes(q)
    );

  rows.sort((a, b) => b.arrears - a.arrears || a.tenant.name.localeCompare(b.tenant.name));

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const link = (params: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    Object.entries({ q: sp.q, flag, ...params }).forEach(([k, v]) => {
      if (v && v !== "all") u.set(k, v);
    });
    const s = u.toString();
    return "/tenants" + (s ? "?" + s : "");
  };

  return (
    <div>
      <PageHead title="Tenants" sub="One record per tenant, reused across every contract and renewal." />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Tenants on file" value={String(d.tenants.length)} />
        <Stat label="With a live tenancy" value={String(d.tenants.filter((t) => d.contracts.some((c) => c.tenantId === t.id && (c.status === "active" || c.status === "expiring"))).length)} tone="good" href={link({ flag: "active" })} />
        <Stat label="With payment problems" value={String(problemCount)} sub="bounced or overdue cheques" tone={problemCount ? "bad" : "good"} href={link({ flag: "problem" })} />
        <Stat label="Companies" value={String(d.tenants.filter((t) => t.kind === "company").length)} />
      </div>

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
          <form action="/tenants" className="relative">
            <input type="hidden" name="flag" value={flag} />
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Name, Emirates ID, phone or unit…"
              className="h-9 w-72 rounded-lg border border-line bg-white pl-9 pr-3 text-[13px] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </form>
          <div className="flex gap-1.5">
            {[
              { k: "all", l: "All" },
              { k: "active", l: "Live tenancy" },
              { k: "problem", l: "Payment problems" },
            ].map((t) => (
              <Link
                key={t.k}
                href={link({ flag: t.k, page: undefined })}
                className={cx(
                  "rounded-lg border px-2.5 py-1.5 text-[12px]",
                  flag === t.k ? "border-ink-900 bg-ink-900 text-white" : "border-line bg-white text-slate-600"
                )}
              >
                {t.l}
              </Link>
            ))}
          </div>
          <p className="tnum ml-auto text-[12.5px] text-slate-500">{rows.length} tenants</p>
        </div>

        <div className="px-5 pb-4 pt-2">
          {pageRows.length === 0 ? (
            <Empty title="No tenants match" icon={<Users size={22} />} />
          ) : (
            <Table>
              <thead>
                <tr>
                  <TH>Tenant</TH>
                  <TH>Emirates ID</TH>
                  <TH>Unit</TH>
                  <TH>Mobile</TH>
                  <TH align="center">Contracts</TH>
                  <TH>Standing</TH>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.tenant.id} className={cx(r.arrears > 0 && "bg-red-50/30")}>
                    <TD className="max-w-[220px]">
                      <Link href={`/tenants/${r.tenant.id}`} className="block truncate font-medium text-ink-900 hover:text-brand-600">
                        {r.tenant.name}
                      </Link>
                      <span className="block text-[11px] text-slate-400">
                        {r.tenant.kind === "company" ? "Company" : r.tenant.nationality}
                      </span>
                    </TD>
                    <TD className="tnum text-[11.5px]">{r.tenant.emiratesId}</TD>
                    <TD>
                      {r.unit ? (
                        <>
                          <span className="font-medium text-ink-900">{r.unit.unitNo}</span>
                          <span className="block text-[11px] text-slate-400">{r.property?.name}</span>
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </TD>
                    <TD className="tnum text-[12px]">{r.tenant.phone}</TD>
                    <TD align="center" className="tnum">{r.contracts}</TD>
                    <TD>
                      {r.bounced > 0 ? (
                        <Badge tone="bad" dot>{r.bounced} bounced · {AED(r.arrears)}</Badge>
                      ) : r.overdue > 0 ? (
                        <Badge tone="warn" dot>{r.overdue} overdue</Badge>
                      ) : (
                        <Badge tone="good" dot>Good</Badge>
                      )}
                    </TD>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[12.5px]">
            <span className="text-slate-500">Page {page} of {pages}</span>
            <div className="flex gap-2">
              <Link href={link({ page: String(Math.max(1, page - 1)) })} className={cx("rounded-lg border border-line px-3 py-1.5", page === 1 && "pointer-events-none opacity-40")}>
                Previous
              </Link>
              <Link href={link({ page: String(Math.min(pages, page + 1)) })} className={cx("rounded-lg border border-line px-3 py-1.5", page === pages && "pointer-events-none opacity-40")}>
                Next
              </Link>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
