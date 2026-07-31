import Link from "next/link";
import { AlertTriangle, CalendarClock, RefreshCw } from "lucide-react";
import { requirePerm } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/store";
import { AED, cx, daysFromToday, fmtDate } from "@/lib/utils";
import { Badge, Card, CardHead, Empty, PageHead, Stat, Table, TD, TH } from "@/components/ui";

export const dynamic = "force-dynamic";

const BANDS = [
  { key: "0-30", label: "Under 30 days", min: 0, max: 30, tone: "bad" as const },
  { key: "31-60", label: "30 – 60 days", min: 31, max: 60, tone: "warn" as const },
  { key: "61-90", label: "60 – 90 days", min: 61, max: 90, tone: "info" as const },
  { key: "91-180", label: "90 – 180 days", min: 91, max: 180, tone: "neutral" as const },
];

export default async function RenewalsPage() {
  const user = await requirePerm("renewals.view");
  const d = db();

  const units = new Map(d.units.map((u) => [u.id, u]));
  const props = new Map(d.properties.map((p) => [p.id, p]));
  const tenants = new Map(d.tenants.map((t) => [t.id, t]));

  const rows = d.contracts
    .filter((c) => (c.status === "active" || c.status === "expiring") && daysFromToday(c.endDate) <= 180)
    .map((c) => {
      const unit = units.get(c.unitId);
      const cheques = d.cheques.filter((ch) => ch.contractId === c.id);
      const bounced = cheques.filter((ch) => ch.status === "bounced").length;
      const late = cheques.filter(
        (ch) => ch.depositedAt && daysFromToday(ch.dueDate) < 0 && ch.depositedAt > ch.dueDate
      ).length;
      const alreadyRenewed = d.contracts.some((x) => x.renewedFromId === c.id);
      return {
        contract: c,
        unit,
        property: unit ? props.get(unit.propertyId) : undefined,
        tenant: tenants.get(c.tenantId),
        days: daysFromToday(c.endDate),
        bounced,
        late,
        alreadyRenewed,
      };
    })
    .filter((r) => r.days >= -30)
    .sort((a, b) => a.days - b.days);

  const counts = BANDS.map((b) => ({
    ...b,
    n: rows.filter((r) => r.days >= b.min && r.days <= b.max).length,
  }));

  const inProgress = rows.filter((r) => r.alreadyRenewed).length;
  const value = rows.filter((r) => r.days <= 90).reduce((s, r) => s + r.contract.annualRent, 0);

  return (
    <div>
      <PageHead
        title="Renewals"
        sub="The system starts the renewal clock 90 days before every contract ends and assigns it to a named employee. Nothing expires quietly."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Expiring ≤30 days"
          value={String(counts[0].n)}
          sub="urgent — contact the tenant today"
          tone={counts[0].n ? "bad" : "good"}
        />
        <Stat label="Expiring ≤90 days" value={String(counts[0].n + counts[1].n + counts[2].n)} sub="in the renewal window" tone="warn" />
        <Stat label="Renewal in progress" value={String(inProgress)} sub="submitted for approval" tone="info" />
        <Stat label="Rent at stake (≤90d)" value={AED(value)} sub="annualised value up for renewal" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <Card padded={false}>
          <div className="border-b border-line px-5 py-3">
            <h2 className="text-[15px] font-semibold text-ink-900">Renewal pipeline</h2>
            <p className="mt-0.5 text-[12.5px] text-slate-500">
              Sorted by urgency. Payment history is shown so you know who to renew and on what terms.
            </p>
          </div>
          <div className="px-5 pb-4 pt-2">
            {rows.length === 0 ? (
              <Empty title="Nothing expiring in the next six months" icon={<CalendarClock size={22} />} />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <TH>Ends</TH>
                    <TH>Unit</TH>
                    <TH>Tenant</TH>
                    <TH align="right">Current rent</TH>
                    <TH>Payment record</TH>
                    <TH align="right">Action</TH>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 60).map((r) => (
                    <tr key={r.contract.id} className={cx(r.days <= 30 && "bg-red-50/40")}>
                      <TD>
                        <span
                          className={cx(
                            "font-medium",
                            r.days < 0 ? "text-red-700" : r.days <= 30 ? "text-red-600" : "text-ink-900"
                          )}
                        >
                          {fmtDate(r.contract.endDate)}
                        </span>
                        <span className="block text-[11px] text-slate-400">
                          {r.days < 0 ? `${-r.days} days ago` : `in ${r.days} days`}
                        </span>
                      </TD>
                      <TD>
                        <span className="font-medium text-ink-900">{r.unit?.unitNo}</span>
                        <span className="block text-[11px] text-slate-400">{r.property?.name}</span>
                      </TD>
                      <TD className="max-w-[170px]">
                        <span className="block truncate">{r.tenant?.name}</span>
                        <Link href={`/contracts/${r.contract.id}`} className="text-[11px] text-slate-400 hover:text-brand-600">
                          {r.contract.ref}
                        </Link>
                      </TD>
                      <TD align="right" className="tnum font-medium text-ink-900">
                        {AED(r.contract.annualRent)}
                      </TD>
                      <TD>
                        {r.bounced > 0 ? (
                          <Badge tone="bad" dot>{r.bounced} bounced</Badge>
                        ) : r.late > 0 ? (
                          <Badge tone="warn" dot>{r.late} late</Badge>
                        ) : (
                          <Badge tone="good" dot>Clean</Badge>
                        )}
                      </TD>
                      <TD align="right">
                        {r.alreadyRenewed ? (
                          <Badge tone="info">Submitted</Badge>
                        ) : can(user.role, "renewals.process") ? (
                          <Link
                            href={`/renewals/${r.contract.id}`}
                            className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1 text-[11.5px] font-medium text-white transition hover:bg-brand-700"
                          >
                            <RefreshCw size={12} /> Start
                          </Link>
                        ) : (
                          <Link href={`/contracts/${r.contract.id}`} className="text-[11.5px] text-slate-400 hover:text-brand-600">
                            View
                          </Link>
                        )}
                      </TD>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHead title="By urgency" icon={<AlertTriangle size={17} />} />
            <ul className="space-y-2">
              {counts.map((b) => (
                <li key={b.key} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                  <span className="text-[12.5px] text-slate-600">{b.label}</span>
                  <Badge tone={b.tone}>{b.n}</Badge>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHead title="The renewal rule" sub="Built into the system." />
            <ol className="space-y-2.5 text-[12px]">
              {[
                ["90 days out", "Renewal task created and assigned automatically."],
                ["Rent increase", "Anything above 5% needs a written justification and manager approval."],
                ["Not renewing", "A 90-day written notice must be confirmed before the system will accept it."],
                ["New cheques", "The renewal is not complete until the new cheques are registered."],
                ["Approval", "Every renewal goes to a manager before it becomes live."],
              ].map(([a, b], i) => (
                <li key={a} className="flex gap-2.5">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-50 text-[10px] font-semibold text-brand-700">
                    {i + 1}
                  </span>
                  <span>
                    <b className="font-medium text-ink-900">{a}</b>
                    <span className="block text-slate-500">{b}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
