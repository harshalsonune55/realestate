import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight, Landmark, Search } from "lucide-react";
import { requirePerm } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/store";
import { ChequeFlag, chequeFlag, enrichCheques } from "@/lib/queries";
import { AED, cx, daysFromToday, fmtDate, relative } from "@/lib/utils";
import { Badge, Card, ChequeStatusBadge, Empty, PageHead, Table, TD, TH } from "@/components/ui";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

const TABS: { key: string; label: string; hint: string }[] = [
  { key: "all", label: "All", hint: "Every cheque on file" },
  { key: "overdue", label: "Overdue", hint: "Past due date, still not deposited" },
  { key: "bounced", label: "Bounced", hint: "Returned by the bank" },
  { key: "due_soon", label: "Due soon", hint: "Falling due within 7 days" },
  { key: "deposited", label: "Awaiting clearance", hint: "Banked, not yet cleared" },
  { key: "cleared", label: "Cleared", hint: "Money received" },
  { key: "pending", label: "Upcoming", hint: "Held in the safe" },
];

export default async function ChequesPage({
  searchParams,
}: {
  searchParams: Promise<{ flag?: string; q?: string; page?: string }>;
}) {
  const user = await requirePerm("cheques.view");
  const sp = await searchParams;
  const flag = sp.flag ?? "all";
  const q = (sp.q ?? "").trim().toLowerCase();
  const page = Math.max(1, Number(sp.page ?? 1));

  const d = db();
  const liveContractIds = new Set(
    d.contracts.filter((c) => c.status !== "rejected" && c.status !== "draft").map((c) => c.id)
  );

  let rows = enrichCheques(d.cheques.filter((c) => liveContractIds.has(c.contractId)));

  rows = rows.filter((r) => {
    switch (flag) {
      case "overdue":
        return r.flag === "overdue";
      case "due_soon":
        return r.flag === "due_soon";
      case "stuck":
        return r.flag === "stuck";
      case "bounced":
        return r.cheque.status === "bounced";
      case "deposited":
        return r.cheque.status === "deposited";
      case "cleared":
        return r.cheque.status === "cleared";
      case "pending":
        return r.cheque.status === "pending";
      default:
        return true;
    }
  });

  if (q) {
    rows = rows.filter(
      (r) =>
        r.cheque.chequeNo.includes(q) ||
        r.tenant.name.toLowerCase().includes(q) ||
        r.unit.unitNo.toLowerCase().includes(q) ||
        r.cheque.bank.toLowerCase().includes(q)
    );
  }

  rows.sort((a, b) => {
    const rank = (f: ChequeFlag) => ({ overdue: 0, bounced: 1, due_soon: 2, stuck: 3, ok: 4 }[f]);
    if (rank(a.flag) !== rank(b.flag)) return rank(a.flag) - rank(b.flag);
    return a.cheque.dueDate < b.cheque.dueDate ? -1 : 1;
  });

  const total = rows.length;
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const counts = {
    all: enrichCheques(d.cheques.filter((c) => liveContractIds.has(c.contractId))).length,
    overdue: d.cheques.filter((c) => liveContractIds.has(c.contractId) && chequeFlag(c) === "overdue").length,
    bounced: d.cheques.filter((c) => liveContractIds.has(c.contractId) && c.status === "bounced").length,
    due_soon: d.cheques.filter((c) => liveContractIds.has(c.contractId) && chequeFlag(c) === "due_soon").length,
    deposited: d.cheques.filter((c) => liveContractIds.has(c.contractId) && c.status === "deposited").length,
    cleared: d.cheques.filter((c) => liveContractIds.has(c.contractId) && c.status === "cleared").length,
    pending: d.cheques.filter((c) => liveContractIds.has(c.contractId) && c.status === "pending").length,
  } as Record<string, number>;

  const value = rows.reduce((s, r) => s + r.cheque.amount, 0);
  const link = (params: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    const merged = { flag, q: sp.q, ...params };
    Object.entries(merged).forEach(([k, v]) => {
      if (v && v !== "all") u.set(k, v);
    });
    const s = u.toString();
    return "/cheques" + (s ? "?" + s : "");
  };

  return (
    <div>
      <PageHead
        title="Cheques"
        sub="Every cheque held by the company, with its own reminder, task and audit trail. Nothing here can be edited by hand — status only moves through the guided procedures."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={link({ flag: t.key, page: undefined })}
            title={t.hint}
            className={cx(
              "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition",
              flag === t.key
                ? "border-ink-900 bg-ink-900 text-white"
                : t.key === "overdue" && counts.overdue > 0
                ? "border-red-200 bg-red-50 text-red-700 hover:border-red-300"
                : t.key === "bounced" && counts.bounced > 0
                ? "border-red-200 bg-red-50 text-red-700 hover:border-red-300"
                : "border-line bg-white text-slate-600 hover:border-slate-300"
            )}
          >
            {t.label}
            <span
              className={cx(
                "tnum rounded px-1.5 py-0.5 text-[10.5px]",
                flag === t.key ? "bg-white/15" : "bg-slate-100 text-slate-500"
              )}
            >
              {counts[t.key] ?? 0}
            </span>
          </Link>
        ))}
      </div>

      <Card padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <form action="/cheques" className="relative">
            <input type="hidden" name="flag" value={flag} />
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Cheque number, tenant, unit or bank…"
              className="h-9 w-72 rounded-lg border border-line bg-white pl-9 pr-3 text-[13px] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </form>
          <p className="text-[12.5px] text-slate-500">
            <b className="tnum text-ink-900">{total.toLocaleString("en-US")}</b> cheques ·{" "}
            <b className="tnum text-ink-900">{AED(value)}</b>
          </p>
        </div>

        <div className="px-5 pb-4 pt-2">
          {pageRows.length === 0 ? (
            <Empty title="No cheques match this filter" icon={<Landmark size={22} />} />
          ) : (
            <Table>
              <thead>
                <tr>
                  <TH>Due date</TH>
                  <TH>Cheque</TH>
                  <TH>Unit</TH>
                  <TH>Tenant</TH>
                  <TH align="right">Amount</TH>
                  <TH>Status</TH>
                  <TH align="right">Action</TH>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const late = r.flag === "overdue";
                  return (
                    <tr key={r.cheque.id} className={cx(late && "bg-red-50/40")}>
                      <TD>
                        <div className="flex items-center gap-2">
                          {late && <AlertTriangle size={13} className="shrink-0 text-red-500" />}
                          <span className={cx("font-medium", late ? "text-red-700" : "text-ink-900")}>
                            {fmtDate(r.cheque.dueDate)}
                          </span>
                        </div>
                        <span
                          className={cx(
                            "block text-[11px]",
                            late ? "font-medium text-red-600" : "text-slate-400"
                          )}
                        >
                          {late
                            ? `${-daysFromToday(r.cheque.dueDate)} days overdue`
                            : relative(r.cheque.dueDate)}
                        </span>
                      </TD>
                      <TD>
                        <Link href={`/cheques/${r.cheque.id}`} className="tnum font-medium text-ink-900 hover:text-brand-600">
                          {r.cheque.chequeNo}
                        </Link>
                        <span className="block text-[11px] text-slate-400">
                          {r.cheque.bank} · {r.cheque.seq}/{r.cheque.ofTotal}
                        </span>
                      </TD>
                      <TD>
                        <span className="font-medium text-ink-900">{r.unit.unitNo}</span>
                        <span className="block text-[11px] text-slate-400">{r.property}</span>
                      </TD>
                      <TD className="max-w-[190px]">
                        <Link href={`/tenants/${r.tenant.id}`} className="block truncate hover:text-brand-600">
                          {r.tenant.name}
                        </Link>
                      </TD>
                      <TD align="right" className="tnum font-medium text-ink-900">
                        {AED(r.cheque.amount)}
                      </TD>
                      <TD>
                        {r.flag === "overdue" ? (
                          <Badge tone="bad" dot>Overdue</Badge>
                        ) : r.flag === "due_soon" ? (
                          <Badge tone="warn" dot>Due soon</Badge>
                        ) : r.flag === "stuck" ? (
                          <Badge tone="warn" dot>Not cleared</Badge>
                        ) : (
                          <ChequeStatusBadge status={r.cheque.status} />
                        )}
                      </TD>
                      <TD align="right">
                        {r.cheque.status === "pending" && can(user.role, "cheques.deposit") ? (
                          <Link
                            href={`/cheques/${r.cheque.id}/deposit`}
                            className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1 text-[11.5px] font-medium text-white transition hover:bg-brand-700"
                          >
                            Deposit
                          </Link>
                        ) : r.cheque.status === "deposited" && can(user.role, "cheques.bounce") ? (
                          <Link
                            href={`/cheques/${r.cheque.id}`}
                            className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1 text-[11.5px] font-medium text-slate-600 transition hover:text-ink-900"
                          >
                            Update
                          </Link>
                        ) : (
                          <Link href={`/cheques/${r.cheque.id}`} className="text-[11.5px] text-slate-400 hover:text-brand-600">
                            View
                          </Link>
                        )}
                      </TD>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-line px-5 py-3">
            <p className="text-[12px] text-slate-500">
              Page {page} of {pages}
            </p>
            <div className="flex gap-2">
              <Link
                href={link({ page: String(Math.max(1, page - 1)) })}
                className={cx(
                  "inline-flex h-8 items-center gap-1 rounded-lg border border-line px-3 text-[12.5px]",
                  page === 1 ? "pointer-events-none opacity-40" : "hover:bg-slate-50"
                )}
              >
                <ChevronLeft size={14} /> Previous
              </Link>
              <Link
                href={link({ page: String(Math.min(pages, page + 1)) })}
                className={cx(
                  "inline-flex h-8 items-center gap-1 rounded-lg border border-line px-3 text-[12.5px]",
                  page === pages ? "pointer-events-none opacity-40" : "hover:bg-slate-50"
                )}
              >
                Next <ChevronRight size={14} />
              </Link>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
