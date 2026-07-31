import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, User, Wrench } from "lucide-react";
import { requirePerm } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/store";
import { AED, cx, daysFromToday, fmtDate, fmtDateTime, titleCase } from "@/lib/utils";
import { Badge, Card, CardHead, PageHead } from "@/components/ui";
import { KV } from "@/components/form";
import AdvanceButton from "./AdvanceButton";

export const dynamic = "force-dynamic";

const FLOW = ["new", "assigned", "in_progress", "completed", "closed"];
const NEXT: Record<string, string | undefined> = {
  new: "assigned",
  assigned: "in_progress",
  in_progress: "completed",
  completed: "closed",
};

export default async function MaintenanceDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const user = await requirePerm("maintenance.view");
  const { id } = await params;
  const sp = await searchParams;

  const d = db();
  const wo = d.maintenance.find((m) => m.id === id);
  if (!wo) notFound();

  const unit = d.units.find((u) => u.id === wo.unitId)!;
  const property = d.properties.find((p) => p.id === unit.propertyId)!;
  const tenant = wo.tenantId ? d.tenants.find((t) => t.id === wo.tenantId) : undefined;
  const approval = d.approvals.find((a) => a.entityType === "maintenance" && a.entityId === wo.id);
  const trail = d.audit.filter((a) => a.entityType === "maintenance" && a.entityId === wo.id);
  const breach = !["completed", "closed", "rejected"].includes(wo.status) && daysFromToday(wo.slaDueAt) < 0;
  // "awaiting approval" sits between assigned and in progress, so show it there
  const stage = wo.status === "awaiting_approval" ? 1 : FLOW.indexOf(wo.status);

  return (
    <div>
      <Link href="/maintenance" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-ink-900">
        <ArrowLeft size={14} /> All work orders
      </Link>

      {sp.created && (
        <div className="mb-5 flex items-center gap-2.5 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-[13px] text-brand-800">
          <CheckCircle2 size={16} /> Work order raised. The maintenance supervisor has an SLA task due{" "}
          {fmtDate(wo.slaDueAt)}.
        </div>
      )}

      <PageHead
        title={`${wo.ref} — ${wo.category}`}
        sub={`${unit.unitNo}, ${property.name}${tenant ? ` · ${tenant.name}` : " · vacant unit"}`}
        action={
          <div className="flex items-center gap-2">
            <Badge tone={wo.priority === "emergency" ? "bad" : wo.priority === "high" ? "warn" : "info"} dot>
              {titleCase(wo.priority)}
            </Badge>
            <Badge tone={wo.status === "closed" || wo.status === "completed" ? "good" : "neutral"} dot>
              {titleCase(wo.status)}
            </Badge>
          </div>
        }
      />

      {breach && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-600" />
          <div>
            <p className="text-[13.5px] font-semibold text-red-900">
              SLA breached by {-daysFromToday(wo.slaDueAt)} day(s)
            </p>
            <p className="mt-0.5 text-[12.5px] text-red-800">
              Promised by {fmtDate(wo.slaDueAt)}. This is on the operations manager&apos;s escalation
              list until it is completed.
            </p>
          </div>
        </div>
      )}

      {wo.status === "awaiting_approval" && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <Clock size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <p className="text-[13.5px] font-semibold text-amber-900">
              Spend approval required{approval ? ` — ${approval.ref}` : ""}
            </p>
            <p className="mt-0.5 text-[12.5px] text-amber-800">
              The quotation of {AED(wo.quoteAmount ?? 0)} is above the AED 1,000 limit. No work may
              start until a manager approves it.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHead title="Progress" icon={<Wrench size={17} />} />
            <div className="flex items-center gap-1">
              {FLOW.map((s, i) => (
                <div key={s} className="flex flex-1 items-center gap-1">
                  <div className="flex-1">
                    <div
                      className={cx(
                        "h-1.5 rounded-full",
                        i <= stage ? "bg-brand-500" : "bg-slate-200"
                      )}
                    />
                    <p
                      className={cx(
                        "mt-1.5 text-[11px]",
                        i === stage ? "font-semibold text-ink-900" : i < stage ? "text-brand-600" : "text-slate-400"
                      )}
                    >
                      {titleCase(s)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHead title="Reported problem" />
            <p className="whitespace-pre-line text-[13px] leading-relaxed text-slate-700">
              {wo.description}
            </p>
            {wo.resolutionNotes && (
              <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50 p-3">
                <p className="text-[12px] font-semibold text-brand-800">Resolution</p>
                <p className="mt-0.5 text-[12.5px] text-brand-700">{wo.resolutionNotes}</p>
              </div>
            )}
          </Card>

          <Card>
            <CardHead title="Audit trail" />
            {trail.length === 0 ? (
              <p className="text-[12.5px] text-slate-400">No changes recorded yet.</p>
            ) : (
              <ul className="space-y-3">
                {trail.map((a) => (
                  <li key={a.id} className="text-[12px]">
                    <p className="font-medium text-ink-900">{a.summary}</p>
                    <p className="text-[11px] text-slate-500">
                      {a.actorName} · {fmtDateTime(a.at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHead title="Details" />
            <KV label="Reference" value={wo.ref} strong />
            <KV label="Category" value={wo.category} />
            <KV label="Priority" value={titleCase(wo.priority)} />
            <KV label="Reported" value={fmtDateTime(wo.reportedAt)} />
            <KV label="SLA due" value={<span className={breach ? "font-semibold text-red-600" : ""}>{fmtDate(wo.slaDueAt)}</span>} />
            <KV label="Vendor" value={wo.vendor ?? "Not assigned"} />
            <KV label="Quote" value={wo.quoteAmount ? AED(wo.quoteAmount) : "—"} />
            <KV label="Completed" value={wo.completedAt ? fmtDate(wo.completedAt) : "—"} />
          </Card>

          {can(user.role, "maintenance.manage") && NEXT[wo.status] && wo.status !== "awaiting_approval" && (
            <Card>
              <CardHead title="Next step" sub="The workflow only moves one stage at a time." />
              <AdvanceButton id={wo.id} next={NEXT[wo.status]!} />
            </Card>
          )}

          <Card>
            <CardHead title="Unit & tenant" icon={<User size={17} />} />
            <KV label="Unit" value={<Link href={`/units/${unit.id}`} className="hover:text-brand-600">{unit.unitNo}</Link>} strong />
            <KV label="Building" value={property.name} />
            <KV label="Tenant" value={tenant ? <Link href={`/tenants/${tenant.id}`} className="hover:text-brand-600">{tenant.name}</Link> : "Vacant"} />
            <KV label="Contact" value={tenant?.phone ?? "—"} />
          </Card>
        </div>
      </div>
    </div>
  );
}
