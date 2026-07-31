import Link from "next/link";
import { FilePlus2, FileSignature, Search } from "lucide-react";
import { requirePerm } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/store";
import { AED, cx, daysFromToday, fmtDate } from "@/lib/utils";
import { Card, ContractStatusBadge, Empty, LinkButton, PageHead, Table, TD, TH } from "@/components/ui";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

const TABS = [
  { key: "all", label: "All" },
  { key: "pending_approval", label: "Awaiting approval" },
  { key: "active", label: "Active" },
  { key: "expiring", label: "Expiring" },
  { key: "renewed", label: "Renewed" },
  { key: "terminated", label: "Ended" },
  { key: "rejected", label: "Rejected" },
];

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const user = await requirePerm("contracts.view");
  const sp = await searchParams;
  const status = sp.status ?? "all";
  const q = (sp.q ?? "").trim().toLowerCase();
  const page = Math.max(1, Number(sp.page ?? 1));

  const d = db();
  const units = new Map(d.units.map((u) => [u.id, u]));
  const props = new Map(d.properties.map((p) => [p.id, p]));
  const tenants = new Map(d.tenants.map((t) => [t.id, t]));

  let rows = d.contracts.map((c) => {
    const unit = units.get(c.unitId);
    return {
      contract: c,
      unit,
      property: unit ? props.get(unit.propertyId) : undefined,
      tenant: tenants.get(c.tenantId),
      cheques: d.cheques.filter((ch) => ch.contractId === c.id),
    };
  });

  if (status !== "all") rows = rows.filter((r) => r.contract.status === status);
  if (q)
    rows = rows.filter(
      (r) =>
        r.contract.ref.toLowerCase().includes(q) ||
        (r.tenant?.name ?? "").toLowerCase().includes(q) ||
        (r.unit?.unitNo ?? "").toLowerCase().includes(q) ||
        r.contract.ejariNo.includes(q)
    );

  rows.sort((a, b) => (a.contract.startDate < b.contract.startDate ? 1 : -1));

  const counts: Record<string, number> = { all: d.contracts.length };
  TABS.slice(1).forEach((t) => {
    counts[t.key] = d.contracts.filter((c) => c.status === t.key).length;
  });

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const link = (params: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    Object.entries({ status, q: sp.q, ...params }).forEach(([k, v]) => {
      if (v && v !== "all") u.set(k, v);
    });
    const s = u.toString();
    return "/contracts" + (s ? "?" + s : "");
  };

  return (
    <div>
      <PageHead
        title="Contracts"
        sub="Every tenancy in the portfolio. A contract only becomes active after a manager approves it."
        action={
          can(user.role, "contracts.create") && (
            <LinkButton href="/contracts/new" size="lg">
              <FilePlus2 size={16} /> New tenancy
            </LinkButton>
          )
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={link({ status: t.key, page: undefined })}
            className={cx(
              "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition",
              status === t.key
                ? "border-ink-900 bg-ink-900 text-white"
                : "border-line bg-white text-slate-600 hover:border-slate-300"
            )}
          >
            {t.label}
            <span
              className={cx(
                "tnum rounded px-1.5 py-0.5 text-[10.5px]",
                status === t.key ? "bg-white/15" : "bg-slate-100 text-slate-500"
              )}
            >
              {counts[t.key] ?? 0}
            </span>
          </Link>
        ))}
      </div>

      <Card padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <form action="/contracts" className="relative">
            <input type="hidden" name="status" value={status} />
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Contract ref, tenant, unit or Ejari…"
              className="h-9 w-72 rounded-lg border border-line bg-white pl-9 pr-3 text-[13px] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </form>
          <p className="tnum text-[12.5px] text-slate-500">{rows.length.toLocaleString("en-US")} contracts</p>
        </div>

        <div className="px-5 pb-4 pt-2">
          {pageRows.length === 0 ? (
            <Empty title="No contracts match this filter" icon={<FileSignature size={22} />} />
          ) : (
            <Table>
              <thead>
                <tr>
                  <TH>Reference</TH>
                  <TH>Unit</TH>
                  <TH>Tenant</TH>
                  <TH>Term</TH>
                  <TH align="right">Annual rent</TH>
                  <TH align="center">Cheques</TH>
                  <TH>Status</TH>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const cleared = r.cheques.filter((c) => c.status === "cleared").length;
                  const days = daysFromToday(r.contract.endDate);
                  return (
                    <tr key={r.contract.id}>
                      <TD>
                        <Link
                          href={`/contracts/${r.contract.id}`}
                          className="font-medium text-ink-900 hover:text-brand-600"
                        >
                          {r.contract.ref}
                        </Link>
                        <span className="block text-[11px] text-slate-400">
                          Ejari {r.contract.ejariNo}
                        </span>
                      </TD>
                      <TD>
                        <span className="font-medium text-ink-900">{r.unit?.unitNo}</span>
                        <span className="block text-[11px] text-slate-400">{r.property?.name}</span>
                      </TD>
                      <TD className="max-w-[190px]">
                        <span className="block truncate">{r.tenant?.name}</span>
                      </TD>
                      <TD>
                        <span>{fmtDate(r.contract.startDate)}</span>
                        <span
                          className={cx(
                            "block text-[11px]",
                            days >= 0 && days <= 60 ? "font-medium text-amber-600" : "text-slate-400"
                          )}
                        >
                          to {fmtDate(r.contract.endDate)}
                        </span>
                      </TD>
                      <TD align="right" className="tnum font-medium text-ink-900">
                        {AED(r.contract.annualRent)}
                      </TD>
                      <TD align="center">
                        <span className="tnum text-[12px] text-slate-600">
                          {cleared}/{r.cheques.length}
                        </span>
                      </TD>
                      <TD>
                        <ContractStatusBadge status={r.contract.status} />
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
