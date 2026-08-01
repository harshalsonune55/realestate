import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Landmark, Receipt, User, Wrench } from "lucide-react";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/store";
import { chequeFlag } from "@/lib/queries";
import { AED, fmtDate, titleCase } from "@/lib/utils";
import {
  Badge, Card, CardHead, ChequeStatusBadge, ContractStatusBadge, Empty, PageHead, Stat,
} from "@/components/ui";
import { KV } from "@/components/form";

export const dynamic = "force-dynamic";

export default async function TenantPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePerm("tenants.view");
  const { id } = await params;

  const d = db();
  const tenant = d.tenants.find((t) => t.id === id);
  if (!tenant) notFound();

  const contracts = d.contracts
    .filter((c) => c.tenantId === tenant.id)
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  const contractIds = new Set(contracts.map((c) => c.id));
  const cheques = d.cheques
    .filter((c) => contractIds.has(c.contractId))
    .sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1));
  const payments = d.payments.filter((p) => contractIds.has(p.contractId));
  const maint = d.maintenance.filter((m) => m.tenantId === tenant.id);

  const paid = cheques.filter((c) => c.status === "cleared").reduce((s, c) => s + c.amount, 0);
  const bounced = cheques.filter((c) => c.status === "bounced");
  const overdue = cheques.filter((c) => chequeFlag(c) === "overdue");
  const arrears = [...bounced, ...overdue].reduce((s, c) => s + c.amount, 0);

  const unitOf = (unitId: string) => {
    const u = d.units.find((x) => x.id === unitId);
    const p = u ? d.properties.find((x) => x.id === u.propertyId) : undefined;
    return u ? `${u.unitNo}, ${p?.name ?? ""}` : "—";
  };

  return (
    <div>
      <Link href="/tenants" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-fg">
        <ArrowLeft size={14} /> All tenants
      </Link>

      <PageHead
        title={tenant.name}
        sub={`${tenant.kind === "company" ? "Company" : tenant.nationality} · tenant since ${fmtDate(
          contracts[contracts.length - 1]?.startDate
        )}`}
        action={
          arrears > 0 ? (
            <Badge tone="bad" dot>Arrears {AED(arrears)}</Badge>
          ) : (
            <Badge tone="good" dot>Payments in good order</Badge>
          )
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total paid" value={AED(paid)} sub={`${cheques.filter((c) => c.status === "cleared").length} cheques cleared`} tone="good" />
        <Stat label="Bounced" value={String(bounced.length)} sub="cheques returned" tone={bounced.length ? "bad" : "good"} />
        <Stat label="Overdue" value={String(overdue.length)} sub="not deposited on time" tone={overdue.length ? "bad" : "good"} />
        <Stat label="Contracts" value={String(contracts.length)} sub={`${contracts.filter((c) => c.status === "active" || c.status === "expiring").length} live`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHead title="Contracts" />
            {contracts.length === 0 ? (
              <Empty title="No contracts on record" />
            ) : (
              <div className="space-y-1.5">
                {contracts.map((c) => (
                  <Link
                    key={c.id}
                    href={`/contracts/${c.id}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line px-3 py-2.5 text-[12.5px] hover:bg-subtle"
                  >
                    <span className="font-medium text-fg">{c.ref}</span>
                    <span className="min-w-0 flex-1 truncate text-fg-soft">{unitOf(c.unitId)}</span>
                    <span className="text-muted">
                      {fmtDate(c.startDate)} – {fmtDate(c.endDate)}
                    </span>
                    <span className="tnum font-medium text-fg">{AED(c.annualRent)}</span>
                    <ContractStatusBadge status={c.status} />
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHead title="Payment history" sub="Every cheque, in order." icon={<Landmark size={17} />} />
            <div className="max-h-[420px] space-y-1.5 overflow-y-auto scroll-thin pr-1">
              {cheques.map((c) => (
                <Link
                  key={c.id}
                  href={`/cheques/${c.id}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line px-3 py-2 text-[12.5px] hover:bg-subtle"
                >
                  <span className="tnum w-16 font-medium text-fg">{c.chequeNo}</span>
                  <span className="w-28 truncate text-muted">{c.bank}</span>
                  <span className="w-24 text-fg-soft">{fmtDate(c.dueDate)}</span>
                  <span className="tnum ml-auto w-24 text-right font-medium text-fg">{AED(c.amount)}</span>
                  <ChequeStatusBadge status={c.status} />
                </Link>
              ))}
            </div>
          </Card>

          {maint.length > 0 && (
            <Card>
              <CardHead title="Maintenance requests" icon={<Wrench size={17} />} />
              <div className="space-y-1.5">
                {maint.map((m) => (
                  <Link
                    key={m.id}
                    href={`/maintenance/${m.id}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line px-3 py-2 text-[12.5px] hover:bg-subtle"
                  >
                    <span className="font-medium text-fg">{m.ref}</span>
                    <span className="min-w-0 flex-1 truncate text-fg-soft">{m.category}</span>
                    <span className="text-muted">{fmtDate(m.reportedAt.slice(0, 10))}</span>
                    <Badge tone={["closed", "completed"].includes(m.status) ? "good" : "neutral"}>
                      {titleCase(m.status)}
                    </Badge>
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHead title="Identity" icon={<User size={17} />} />
            <KV label="Name" value={tenant.name} strong />
            <KV label="Type" value={tenant.kind === "company" ? "Company" : "Individual"} />
            <KV label="Emirates ID" value={<span className="tnum text-[11.5px]">{tenant.emiratesId}</span>} />
            <KV label="Passport" value={tenant.passportNo} />
            <KV label="Nationality" value={tenant.nationality} />
            <KV label="Mobile" value={tenant.phone} />
            <KV label="Email" value={<span className="text-[11.5px]">{tenant.email}</span>} />
            {tenant.tradeLicense && <KV label="Trade licence" value={tenant.tradeLicense} />}
          </Card>

          <Card>
            <CardHead title="Receipts" icon={<Receipt size={17} />} />
            {payments.length === 0 ? (
              <p className="text-[12.5px] text-faint">No receipts yet.</p>
            ) : (
              <ul className="max-h-72 space-y-2 overflow-y-auto scroll-thin">
                {payments.slice(0, 20).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-[12px]">
                    <div className="min-w-0">
                      <p className="tnum font-medium text-fg">{p.receiptNo}</p>
                      <p className="truncate text-[11px] text-muted">
                        {fmtDate(p.receivedAt)} · {p.category}
                      </p>
                    </div>
                    <span className="tnum shrink-0 font-medium text-fg">{AED(p.amount)}</span>
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
