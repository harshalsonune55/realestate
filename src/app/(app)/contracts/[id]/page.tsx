import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft, Building2, CheckCircle2, Clock, FileText, Landmark, RefreshCw,
  ShieldCheck, User, XCircle,
} from "lucide-react";
import { requirePerm } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/store";
import { chequeFlag } from "@/lib/queries";
import { AED, cx, daysFromToday, fmtDate, fmtDateTime, relative } from "@/lib/utils";
import {
  Badge, Bar, Card, CardHead, ChequeStatusBadge, ContractStatusBadge, LinkButton, PageHead,
} from "@/components/ui";
import { KV } from "@/components/form";

export const dynamic = "force-dynamic";

export default async function ContractPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const user = await requirePerm("contracts.view");
  const { id } = await params;
  const sp = await searchParams;

  const d = db();
  const contract = d.contracts.find((c) => c.id === id);
  if (!contract) notFound();

  const unit = d.units.find((u) => u.id === contract.unitId)!;
  const property = d.properties.find((p) => p.id === unit.propertyId)!;
  const tenant = d.tenants.find((t) => t.id === contract.tenantId)!;
  const cheques = d.cheques.filter((c) => c.contractId === contract.id).sort((a, b) => a.seq - b.seq);
  const approval = d.approvals.find((a) => a.entityType === "contract" && a.entityId === contract.id);
  const trail = d.audit.filter((a) => a.entityType === "contract" && a.entityId === contract.id);
  const payments = d.payments.filter((p) => p.contractId === contract.id);

  const collected = cheques.filter((c) => c.status === "cleared").reduce((s, c) => s + c.amount, 0);
  const outstanding = cheques
    .filter((c) => c.status === "pending" || c.status === "bounced")
    .reduce((s, c) => s + c.amount, 0);
  const daysLeft = daysFromToday(contract.endDate);
  const userName = (uid?: string) => (uid ? d.users.find((u) => u.id === uid)?.name ?? uid : "—");

  return (
    <div>
      <Link href="/contracts" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-fg">
        <ArrowLeft size={14} /> All contracts
      </Link>

      {sp.submitted && (
        <div className="mb-5 rounded-xl border border-brand-200 bg-brand-50 p-4">
          <p className="flex items-center gap-2 text-[13.5px] font-semibold text-brand-800">
            <CheckCircle2 size={16} /> Submitted for approval
          </p>
          <p className="mt-1 text-[12.5px] text-brand-700">
            Unit {unit.unitNo} is now reserved, all {cheques.length} cheques are registered with
            reminders, and a review task has gone to the manager. Nothing is live until they approve
            it.
          </p>
        </div>
      )}

      <PageHead
        title={contract.ref}
        sub={`${tenant.name} · ${unit.unitNo}, ${property.name}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ContractStatusBadge status={contract.status} />
            {(contract.status === "expiring" || (contract.status === "active" && daysLeft <= 120)) &&
              can(user.role, "renewals.process") && (
                <LinkButton href={`/renewals/${contract.id}`}>
                  <RefreshCw size={15} /> Start renewal
                </LinkButton>
              )}
            {contract.status === "pending_approval" && can(user.role, "approvals.decide") && (
              <LinkButton href="/approvals" variant="dark">
                <ShieldCheck size={15} /> Go to approvals
              </LinkButton>
            )}
          </div>
        }
      />

      {contract.status === "pending_approval" && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <Clock size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <p className="text-[13.5px] font-semibold text-amber-900">
              Waiting for manager approval{approval ? ` — ${approval.ref}` : ""}
            </p>
            <p className="mt-0.5 text-[12.5px] text-amber-800">
              Raised by {userName(contract.createdBy)} on {fmtDateTime(contract.createdAt)}. The unit
              is held as reserved and the tenant cannot move in until this is approved.
            </p>
          </div>
        </div>
      )}

      {contract.status === "rejected" && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <XCircle size={18} className="mt-0.5 shrink-0 text-red-600" />
          <div>
            <p className="text-[13.5px] font-semibold text-red-900">This contract was rejected</p>
            <p className="mt-0.5 text-[12.5px] text-red-800">
              {approval?.decisionNote ?? "See the audit trail for the reason."} The unit has been
              released back to vacant and all cheques cancelled.
            </p>
          </div>
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-[11.5px] uppercase tracking-wide text-muted">Annual rent</p>
          <p className="tnum mt-1.5 text-[22px] font-semibold text-fg">{AED(contract.annualRent)}</p>
          <p className="mt-0.5 text-[11.5px] text-muted">{cheques.length} cheques</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-[11.5px] uppercase tracking-wide text-muted">Collected</p>
          <p className="tnum mt-1.5 text-[22px] font-semibold text-brand-600">{AED(collected)}</p>
          <div className="mt-2">
            <Bar value={contract.annualRent ? collected / contract.annualRent : 0} />
          </div>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-[11.5px] uppercase tracking-wide text-muted">Outstanding</p>
          <p className="tnum mt-1.5 text-[22px] font-semibold text-fg">{AED(outstanding)}</p>
          <p className="mt-0.5 text-[11.5px] text-muted">
            {cheques.filter((c) => c.status === "pending").length} cheques still held
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-[11.5px] uppercase tracking-wide text-muted">Time remaining</p>
          <p
            className={cx(
              "tnum mt-1.5 text-[22px] font-semibold",
              daysLeft < 0 ? "text-faint" : daysLeft <= 60 ? "text-amber-600" : "text-fg"
            )}
          >
            {daysLeft < 0 ? "Ended" : `${daysLeft} days`}
          </p>
          <p className="mt-0.5 text-[11.5px] text-muted">Ends {fmtDate(contract.endDate)}</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHead
              title="Cheque schedule"
              sub="Each cheque carries its own reminder, task and audit trail."
              icon={<Landmark size={17} />}
            />
            <div className="space-y-1.5">
              {cheques.map((c) => {
                const flag = chequeFlag(c);
                return (
                  <Link
                    key={c.id}
                    href={`/cheques/${c.id}`}
                    className={cx(
                      "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2.5 text-[12.5px] transition hover:shadow-sm",
                      flag === "overdue"
                        ? "border-red-200 bg-red-50/60"
                        : flag === "bounced"
                        ? "border-red-200 bg-red-50/40"
                        : flag === "due_soon"
                        ? "border-amber-200 bg-amber-50/50"
                        : "border-line hover:bg-subtle"
                    )}
                  >
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface text-[11px] font-semibold text-fg-soft ring-1 ring-line">
                      {c.seq}
                    </span>
                    <span className="tnum w-16 font-medium text-fg">{c.chequeNo}</span>
                    <span className="w-28 truncate text-muted">{c.bank}</span>
                    <span className="w-28 text-fg-soft">{fmtDate(c.dueDate)}</span>
                    <span className="tnum w-24 text-right font-medium text-fg">{AED(c.amount)}</span>
                    <span className="ml-auto flex items-center gap-2">
                      {flag === "overdue" && <Badge tone="bad" dot>Overdue</Badge>}
                      {flag === "due_soon" && <Badge tone="warn" dot>Due soon</Badge>}
                      <ChequeStatusBadge status={c.status} />
                    </span>
                  </Link>
                );
              })}
            </div>
          </Card>

          <Card>
            <CardHead title="Documents on file" icon={<FileText size={17} />} />
            <div className="grid gap-2 sm:grid-cols-2">
              {contract.documents.map((doc) => (
                <div
                  key={doc.key}
                  className={cx(
                    "flex items-start gap-2.5 rounded-lg border p-2.5",
                    doc.provided ? "border-brand-200 bg-brand-50/50" : "border-red-200 bg-red-50"
                  )}
                >
                  {doc.provided ? (
                    <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-brand-600" />
                  ) : (
                    <XCircle size={15} className="mt-0.5 shrink-0 text-red-500" />
                  )}
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-medium text-fg">{doc.label}</p>
                    <p className="truncate text-[11px] text-muted">{doc.ref ?? "Not attached"}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {payments.length > 0 && (
            <Card>
              <CardHead title="Payments received" icon={<CheckCircle2 size={17} />} />
              <div className="space-y-1">
                {payments.slice(0, 12).map((p) => (
                  <div key={p.id} className="flex items-center gap-3 border-b border-line-soft py-2 text-[12.5px] last:border-0">
                    <span className="tnum w-24 text-muted">{p.receiptNo}</span>
                    <span className="w-24 text-fg-soft">{fmtDate(p.receivedAt)}</span>
                    <span className="capitalize text-fg-soft">{p.category}</span>
                    <span className="truncate text-[11.5px] text-faint">{p.reference}</span>
                    <span className="tnum ml-auto font-medium text-fg">{AED(p.amount)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <CardHead title="Audit trail" sub="Everything that has happened to this contract." icon={<ShieldCheck size={17} />} />
            {trail.length === 0 ? (
              <p className="text-[12.5px] text-faint">No changes recorded.</p>
            ) : (
              <ol className="relative ml-2 space-y-4 border-l border-line pl-6">
                {trail.map((a) => (
                  <li key={a.id} className="relative">
                    <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full bg-line-strong ring-4 ring-white" />
                    <p className="text-[12.5px] font-medium text-fg">{a.summary}</p>
                    <p className="text-[11px] text-muted">
                      {a.actorName} · {fmtDateTime(a.at)} · {a.ip}
                    </p>
                    {a.changes && (
                      <ul className="mt-1 space-y-0.5">
                        {a.changes.map((c, i) => (
                          <li key={i} className="text-[11px] text-muted">
                            {c.field}: <span className="line-through">{c.from}</span> → <b>{c.to}</b>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHead title="Tenant" icon={<User size={17} />} />
            <KV label="Name" value={<Link href={`/tenants/${tenant.id}`} className="hover:text-brand-600">{tenant.name}</Link>} strong />
            <KV label="Type" value={tenant.kind === "company" ? "Company" : "Individual"} />
            <KV label="Emirates ID" value={<span className="tnum text-[11.5px]">{tenant.emiratesId}</span>} />
            <KV label="Passport" value={tenant.passportNo} />
            <KV label="Nationality" value={tenant.nationality} />
            <KV label="Mobile" value={tenant.phone} />
            <KV label="Email" value={<span className="text-[11.5px]">{tenant.email}</span>} />
            {tenant.tradeLicense && <KV label="Trade licence" value={tenant.tradeLicense} />}
          </Card>

          <Card>
            <CardHead title="Unit" icon={<Building2 size={17} />} />
            <KV label="Unit" value={<Link href={`/units/${unit.id}`} className="hover:text-brand-600">{unit.unitNo}</Link>} strong />
            <KV label="Building" value={property.name} />
            <KV label="Area" value={property.area} />
            <KV label="Type" value={`${unit.type} · ${unit.sizeSqft} sqft`} />
            <KV label="Floor" value={String(unit.floor)} />
            <KV label="Parking" value={`${unit.parkingSlots} slot(s)`} />
          </Card>

          <Card>
            <CardHead title="Terms" />
            <KV label="Start" value={fmtDate(contract.startDate)} />
            <KV label="End" value={`${fmtDate(contract.endDate)} (${relative(contract.endDate)})`} />
            <KV label="Annual rent" value={AED(contract.annualRent)} strong />
            <KV label="Security deposit" value={AED(contract.securityDeposit)} />
            <KV label="Commission" value={AED(contract.commission)} />
            <KV label="Ejari / Tawtheeq" value={<span className="tnum">{contract.ejariNo}</span>} />
            <KV label="Prepared by" value={userName(contract.createdBy)} />
            <KV label="Approved by" value={userName(contract.approvedBy)} />
            <KV label="Approved on" value={contract.approvedAt ? fmtDateTime(contract.approvedAt) : "—"} />
            {contract.notes && (
              <div className="mt-3 rounded-lg bg-subtle p-3 text-[12px] text-fg-soft">
                <b className="text-fg">Note:</b> {contract.notes}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
