import Link from "next/link";
import { AlertTriangle, Plus, Wrench } from "lucide-react";
import { requirePerm } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/store";
import { AED, cx, daysFromToday, fmtDate, titleCase } from "@/lib/utils";
import { Badge, Card, Empty, LinkButton, PageHead, Stat, Table, TD, TH, Tone } from "@/components/ui";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "open", label: "Open" },
  { key: "breach", label: "SLA breached" },
  { key: "awaiting_approval", label: "Awaiting approval" },
  { key: "in_progress", label: "In progress" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

const STATUS_TONE: Record<string, Tone> = {
  new: "neutral",
  assigned: "info",
  in_progress: "info",
  awaiting_approval: "warn",
  completed: "good",
  closed: "good",
  rejected: "bad",
};

const PRIORITY_TONE: Record<string, Tone> = {
  emergency: "bad",
  high: "warn",
  medium: "info",
  low: "neutral",
};

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ flag?: string }>;
}) {
  const user = await requirePerm("maintenance.view");
  const sp = await searchParams;
  const flag = sp.flag ?? "open";

  const d = db();
  const units = new Map(d.units.map((u) => [u.id, u]));
  const props = new Map(d.properties.map((p) => [p.id, p]));
  const tenants = new Map(d.tenants.map((t) => [t.id, t]));

  const all = d.maintenance.map((m) => {
    const unit = units.get(m.unitId);
    return {
      m,
      unit,
      property: unit ? props.get(unit.propertyId) : undefined,
      tenant: m.tenantId ? tenants.get(m.tenantId) : undefined,
      breach: !["completed", "closed", "rejected"].includes(m.status) && daysFromToday(m.slaDueAt) < 0,
    };
  });

  const openOnes = all.filter((r) => !["closed", "completed", "rejected"].includes(r.m.status));
  let rows = all;
  if (flag === "open") rows = openOnes;
  else if (flag === "breach") rows = all.filter((r) => r.breach);
  else if (flag === "closed") rows = all.filter((r) => ["closed", "completed"].includes(r.m.status));
  else if (flag !== "all") rows = all.filter((r) => r.m.status === flag);

  rows = [...rows].sort((a, b) => {
    if (a.breach !== b.breach) return a.breach ? -1 : 1;
    const rank = (p: string) => ({ emergency: 0, high: 1, medium: 2, low: 3 }[p] ?? 4);
    if (rank(a.m.priority) !== rank(b.m.priority)) return rank(a.m.priority) - rank(b.m.priority);
    return a.m.slaDueAt < b.m.slaDueAt ? -1 : 1;
  });

  const counts: Record<string, number> = {
    open: openOnes.length,
    breach: all.filter((r) => r.breach).length,
    awaiting_approval: all.filter((r) => r.m.status === "awaiting_approval").length,
    in_progress: all.filter((r) => r.m.status === "in_progress").length,
    closed: all.filter((r) => ["closed", "completed"].includes(r.m.status)).length,
    all: all.length,
  };

  const spend = all
    .filter((r) => ["completed", "closed"].includes(r.m.status))
    .reduce((s, r) => s + (r.m.quoteAmount ?? 0), 0);

  return (
    <div>
      <PageHead
        title="Maintenance"
        sub="Every work order carries a service level. If it is not done in time the system escalates it — nobody has to notice."
        action={
          can(user.role, "maintenance.manage") && (
            <LinkButton href="/maintenance/new" size="lg">
              <Plus size={16} /> Raise work order
            </LinkButton>
          )
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open jobs" value={String(counts.open)} sub="not yet completed" />
        <Stat
          label="SLA breached"
          value={String(counts.breach)}
          sub="past their promised date"
          tone={counts.breach ? "bad" : "good"}
        />
        <Stat label="Awaiting approval" value={String(counts.awaiting_approval)} sub="spend over AED 1,000" tone="warn" />
        <Stat label="Spend (completed)" value={AED(spend)} sub="across all work orders" />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/maintenance?flag=${t.key}`}
            className={cx(
              "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition",
              flag === t.key
                ? "border-ink-900 bg-ink-900 text-white"
                : t.key === "breach" && counts.breach > 0
                ? "border-red-200 bg-red-50 text-red-700"
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
        <div className="px-5 pb-4 pt-3">
          {rows.length === 0 ? (
            <Empty title="No work orders in this view" icon={<Wrench size={22} />} />
          ) : (
            <Table>
              <thead>
                <tr>
                  <TH>Ref</TH>
                  <TH>Unit</TH>
                  <TH>Category</TH>
                  <TH>Priority</TH>
                  <TH>SLA</TH>
                  <TH align="right">Cost</TH>
                  <TH>Status</TH>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 80).map((r) => (
                  <tr key={r.m.id} className={cx(r.breach && "bg-red-50/40")}>
                    <TD>
                      <Link href={`/maintenance/${r.m.id}`} className="font-medium text-ink-900 hover:text-brand-600">
                        {r.m.ref}
                      </Link>
                      <span className="block text-[11px] text-slate-400">{fmtDate(r.m.reportedAt.slice(0, 10))}</span>
                    </TD>
                    <TD>
                      <span className="font-medium text-ink-900">{r.unit?.unitNo}</span>
                      <span className="block text-[11px] text-slate-400">{r.property?.name}</span>
                    </TD>
                    <TD className="max-w-[200px]">
                      <span className="block">{r.m.category}</span>
                      <span className="block truncate text-[11px] text-slate-400">
                        {r.m.description.split("\n")[0]}
                      </span>
                    </TD>
                    <TD>
                      <Badge tone={PRIORITY_TONE[r.m.priority]} dot>
                        {titleCase(r.m.priority)}
                      </Badge>
                    </TD>
                    <TD>
                      <span className={cx("text-[12px]", r.breach ? "font-medium text-red-600" : "text-slate-600")}>
                        {fmtDate(r.m.slaDueAt)}
                      </span>
                      {r.breach && (
                        <span className="flex items-center gap-1 text-[11px] font-medium text-red-600">
                          <AlertTriangle size={11} /> {-daysFromToday(r.m.slaDueAt)}d late
                        </span>
                      )}
                    </TD>
                    <TD align="right" className="tnum">
                      {r.m.quoteAmount ? AED(r.m.quoteAmount) : "—"}
                    </TD>
                    <TD>
                      <Badge tone={STATUS_TONE[r.m.status] ?? "neutral"} dot>
                        {titleCase(r.m.status)}
                      </Badge>
                    </TD>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </Card>
    </div>
  );
}
