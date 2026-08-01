import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle, ArrowLeft, Building2, CalendarClock, CheckCircle2, CircleDollarSign,
  Landmark, ShieldCheck, User,
} from "lucide-react";
import { requirePerm } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/store";
import { chequeFlag } from "@/lib/queries";
import { AED, cx, daysFromToday, fmtDate, fmtDateTime, relative, titleCase } from "@/lib/utils";
import { Badge, Card, CardHead, ChequeStatusBadge, LinkButton, PageHead } from "@/components/ui";
import { KV } from "@/components/form";
import ClearButton from "./ClearButton";

export const dynamic = "force-dynamic";

export default async function ChequePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const user = await requirePerm("cheques.view");
  const { id } = await params;
  const sp = await searchParams;

  const d = db();
  const cheque = d.cheques.find((c) => c.id === id);
  if (!cheque) notFound();

  const contract = d.contracts.find((c) => c.id === cheque.contractId)!;
  const tenant = d.tenants.find((t) => t.id === contract.tenantId)!;
  const unit = d.units.find((u) => u.id === contract.unitId)!;
  const property = d.properties.find((p) => p.id === unit.propertyId)!;
  const flag = chequeFlag(cheque);
  const siblings = d.cheques.filter((c) => c.contractId === cheque.contractId).sort((a, b) => a.seq - b.seq);
  const trail = d.audit.filter((a) => a.entityType === "cheque" && a.entityId === cheque.id).slice(0, 12);
  const tasks = d.tasks.filter((t) => t.entityType === "cheque" && t.entityId === cheque.id);

  const timeline = [
    { label: "Cheque registered", at: contract.createdAt, done: true, detail: `Recorded with contract ${contract.ref}` },
    {
      label: "Reminder issued",
      at: cheque.dueDate,
      done: daysFromToday(cheque.dueDate) <= 7,
      detail: "7 days before the due date, task assigned to accounts",
    },
    {
      label: "Deposited at bank",
      at: cheque.depositedAt,
      done: !!cheque.depositedAt,
      detail: cheque.depositSlipNo ? `Slip ${cheque.depositSlipNo}` : "Not yet deposited",
    },
    {
      label: cheque.status === "bounced" ? "Returned by bank" : "Cleared",
      at: cheque.status === "bounced" ? cheque.bouncedAt : cheque.clearedAt,
      done: !!cheque.clearedAt || !!cheque.bouncedAt,
      detail: cheque.status === "bounced" ? cheque.bounceReason ?? "" : "Funds received",
      bad: cheque.status === "bounced",
    },
  ];

  return (
    <div>
      <Link
        href="/cheques"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-fg"
      >
        <ArrowLeft size={14} /> All cheques
      </Link>

      {sp.deposited && (
        <div className="mb-5 flex items-center gap-2.5 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-[13px] text-brand-800">
          <CheckCircle2 size={16} />
          Cheque recorded as deposited. A follow-up task to confirm clearance has been added to your
          list for {fmtDate(cheque.depositedAt ? cheque.depositedAt : undefined)}.
        </div>
      )}
      {sp.cleared && (
        <div className="mb-5 flex items-center gap-2.5 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-[13px] text-brand-800">
          <CheckCircle2 size={16} /> Clearance recorded and a receipt has been generated.
        </div>
      )}
      {sp.bounced && (
        <div className="mb-5 flex items-center gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">
          <AlertTriangle size={16} /> Return recorded. A replacement task and an approval request
          have been raised.
        </div>
      )}

      <PageHead
        title={`Cheque ${cheque.chequeNo}`}
        sub={`${cheque.bank} · cheque ${cheque.seq} of ${cheque.ofTotal} on contract ${contract.ref}`}
        action={
          <div className="flex flex-wrap gap-2">
            {cheque.status === "pending" && can(user.role, "cheques.deposit") && (
              <LinkButton href={`/cheques/${cheque.id}/deposit`}>
                <Landmark size={15} /> Start deposit procedure
              </LinkButton>
            )}
            {cheque.status === "deposited" && can(user.role, "cheques.deposit") && (
              <ClearButton chequeId={cheque.id} />
            )}
            {cheque.status === "deposited" && can(user.role, "cheques.bounce") && (
              <LinkButton href={`/cheques/${cheque.id}/bounce`} variant="outline">
                <AlertTriangle size={15} /> Record bank return
              </LinkButton>
            )}
          </div>
        }
      />

      {flag === "overdue" && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="flex items-center gap-2 text-[13.5px] font-semibold text-red-800">
            <AlertTriangle size={16} /> This cheque is {-daysFromToday(cheque.dueDate)} days past its
            due date and has not been deposited
          </p>
          <p className="mt-1 text-[12.5px] text-red-700">
            It appears on the manager&apos;s dashboard as money at risk until it is deposited or a
            hold is approved. Deposit it now, or record the bank return if it was already presented.
          </p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHead title="Cheque details" icon={<CircleDollarSign size={17} />} />
            <div className="grid gap-x-8 sm:grid-cols-2">
              <div>
                <KV label="Cheque number" value={<span className="tnum">{cheque.chequeNo}</span>} strong />
                <KV label="Drawee bank" value={cheque.bank} />
                <KV label="Amount" value={<span className="tnum">{AED(cheque.amount)}</span>} strong />
                <KV label="Due date" value={`${fmtDate(cheque.dueDate)} (${relative(cheque.dueDate)})`} />
                <KV label="Position" value={`${cheque.seq} of ${cheque.ofTotal}`} />
              </div>
              <div>
                <KV label="Status" value={<ChequeStatusBadge status={cheque.status} />} />
                <KV label="Deposited on" value={fmtDate(cheque.depositedAt)} />
                <KV
                  label="Deposited by"
                  value={cheque.depositedBy ? d.users.find((u) => u.id === cheque.depositedBy)?.name ?? "—" : "—"}
                />
                <KV label="Deposit slip" value={cheque.depositSlipNo ?? "—"} />
                <KV label="Cleared on" value={fmtDate(cheque.clearedAt)} />
              </div>
            </div>
            {cheque.bounceReason && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-[12.5px] text-red-800">
                <b>Returned {fmtDate(cheque.bouncedAt)}:</b> {cheque.bounceReason}
              </div>
            )}
          </Card>

          <Card>
            <CardHead
              title="Lifecycle"
              sub="Each stage is stamped with a date and a named employee."
              icon={<CalendarClock size={17} />}
            />
            <ol className="relative ml-2 border-l border-line pl-6">
              {timeline.map((t, i) => (
                <li key={i} className="relative pb-5 last:pb-0">
                  <span
                    className={cx(
                      "absolute -left-[31px] grid h-5 w-5 place-items-center rounded-full ring-4 ring-white",
                      t.bad ? "bg-red-500" : t.done ? "bg-brand-solid" : "bg-subtle-hover"
                    )}
                  >
                    {t.done && <CheckCircle2 size={12} className="text-white" />}
                  </span>
                  <p className={cx("text-[13px] font-medium", t.done ? "text-fg" : "text-faint")}>
                    {t.label}
                  </p>
                  <p className="text-[11.5px] text-muted">
                    {t.at ? fmtDate(t.at.slice(0, 10)) : "Pending"} · {t.detail}
                  </p>
                </li>
              ))}
            </ol>
          </Card>

          <Card>
            <CardHead title="All cheques on this contract" icon={<Landmark size={17} />} />
            <div className="space-y-1.5">
              {siblings.map((c) => (
                <Link
                  key={c.id}
                  href={`/cheques/${c.id}`}
                  className={cx(
                    "flex items-center gap-3 rounded-lg border px-3 py-2 text-[12.5px] transition",
                    c.id === cheque.id ? "border-brand-400 bg-brand-50/60" : "border-line hover:bg-subtle"
                  )}
                >
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-subtle text-[11px] font-semibold text-fg-soft">
                    {c.seq}
                  </span>
                  <span className="tnum w-16 font-medium text-fg">{c.chequeNo}</span>
                  <span className="w-28 truncate text-muted">{c.bank}</span>
                  <span className="w-24 text-muted">{fmtDate(c.dueDate)}</span>
                  <span className="tnum ml-auto font-medium text-fg">{AED(c.amount)}</span>
                  <ChequeStatusBadge status={c.status} />
                </Link>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHead title="Tenant & unit" icon={<User size={17} />} />
            <KV label="Tenant" value={<Link href={`/tenants/${tenant.id}`} className="hover:text-brand-600">{tenant.name}</Link>} strong />
            <KV label="Mobile" value={tenant.phone} />
            <KV label="Emirates ID" value={<span className="tnum text-[11.5px]">{tenant.emiratesId}</span>} />
            <KV
              label="Unit"
              value={
                <Link href={`/units/${unit.id}`} className="hover:text-brand-600">
                  {unit.unitNo} · {unit.type}
                </Link>
              }
            />
            <KV label="Building" value={<span className="inline-flex items-center gap-1"><Building2 size={12} />{property.name}</span>} />
            <KV
              label="Contract"
              value={<Link href={`/contracts/${contract.id}`} className="hover:text-brand-600">{contract.ref}</Link>}
            />
          </Card>

          {tasks.length > 0 && (
            <Card>
              <CardHead title="Linked tasks" icon={<ShieldCheck size={17} />} />
              <ul className="space-y-2">
                {tasks.map((t) => (
                  <li key={t.id} className="rounded-lg border border-line p-2.5">
                    <p className="text-[12.5px] font-medium text-fg">{t.title}</p>
                    <p className="mt-0.5 text-[11.5px] text-muted">
                      {d.users.find((u) => u.id === t.assignedTo)?.name} · due {fmtDate(t.dueDate)}
                    </p>
                    <div className="mt-1.5">
                      <Badge tone={t.status === "done" ? "good" : t.status === "overdue" ? "bad" : "neutral"}>
                        {titleCase(t.status)}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <CardHead title="Audit trail" sub="Who touched this cheque." icon={<ShieldCheck size={17} />} />
            {trail.length === 0 ? (
              <p className="text-[12.5px] text-faint">No changes recorded yet.</p>
            ) : (
              <ul className="space-y-3">
                {trail.map((a) => (
                  <li key={a.id} className="text-[12px]">
                    <p className="font-medium text-fg">{a.summary}</p>
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
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
