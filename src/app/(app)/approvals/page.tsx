import { CheckCircle2, ShieldCheck } from "lucide-react";
import { requirePerm } from "@/lib/auth";
import { can, REQUIRES_APPROVAL } from "@/lib/rbac";
import { db } from "@/lib/store";
import { daysFromToday, fmtDateTime, titleCase } from "@/lib/utils";
import { Badge, Card, CardHead, Empty, PageHead, Stat } from "@/components/ui";
import ApprovalCard, { ApprovalView } from "./ApprovalCard";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const user = await requirePerm("approvals.view");
  const d = db();
  const decide = can(user.role, "approvals.decide");

  const name = (id: string) => d.users.find((u) => u.id === id)?.name ?? id;

  const pending: ApprovalView[] = d.approvals
    .filter((a) => a.status === "pending")
    .sort((a, b) => (a.requestedAt < b.requestedAt ? -1 : 1))
    .map((a) => ({
      id: a.id,
      ref: a.ref,
      type: a.type,
      title: a.title,
      summary: a.summary,
      amount: a.amount,
      requestedByName: name(a.requestedBy),
      requestedAt: a.requestedAt,
      entityType: a.entityType,
      entityId: a.entityId,
      rule: REQUIRES_APPROVAL[a.type] ?? "Company policy requires a second pair of eyes.",
      ownRequest: a.requestedBy === user.id,
      waitingDays: Math.max(0, -daysFromToday(a.requestedAt.slice(0, 10))),
    }));

  const decided = d.approvals
    .filter((a) => a.status !== "pending")
    .sort((a, b) => ((a.decidedAt ?? "") < (b.decidedAt ?? "") ? 1 : -1))
    .slice(0, 12);

  const overdue = pending.filter((a) => a.waitingDays > 2).length;
  const value = pending.reduce((s, a) => s + (a.amount ?? 0), 0);

  return (
    <div>
      <PageHead
        title="Approvals"
        sub="Anything that changes money, a contract or a tenant's standing stops here first. Employees prepare the work; a manager releases it."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Waiting" value={String(pending.length)} sub="items in the queue" tone={pending.length ? "warn" : "good"} />
        <Stat label="Past 2-day SLA" value={String(overdue)} sub="need a decision today" tone={overdue ? "bad" : "good"} />
        <Stat label="Value held" value={`AED ${Math.round(value).toLocaleString("en-US")}`} sub="across pending items" />
        <Stat
          label="Decided (last 12)"
          value={String(decided.filter((a) => a.status === "approved").length) + " approved"}
          sub={`${decided.filter((a) => a.status === "rejected").length} rejected`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          {pending.length === 0 ? (
            <Card>
              <Empty
                title="Nothing is waiting for approval"
                sub="Requests appear here the moment an employee submits one."
                icon={<CheckCircle2 size={24} />}
              />
            </Card>
          ) : (
            pending.map((a) => <ApprovalCard key={a.id} approval={a} canDecide={decide} />)
          )}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHead
              title="What always needs approval"
              sub="These rules are built in — they cannot be bypassed."
              icon={<ShieldCheck size={17} />}
            />
            <ul className="space-y-2.5">
              {Object.entries(REQUIRES_APPROVAL).map(([k, v]) => (
                <li key={k} className="text-[12px]">
                  <p className="font-medium text-ink-900">{titleCase(k)}</p>
                  <p className="text-slate-500">{v}</p>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHead title="Recent decisions" />
            {decided.length === 0 ? (
              <p className="text-[12.5px] text-slate-400">No decisions recorded yet.</p>
            ) : (
              <ul className="space-y-3">
                {decided.map((a) => (
                  <li key={a.id} className="text-[12px]">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 truncate font-medium text-ink-900">{a.title}</p>
                      <Badge tone={a.status === "approved" ? "good" : "bad"}>
                        {a.status === "approved" ? "Approved" : "Rejected"}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {a.decidedBy ? name(a.decidedBy) : "—"} · {fmtDateTime(a.decidedAt)}
                    </p>
                    {a.decisionNote && (
                      <p className="mt-1 rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
                        “{a.decisionNote}”
                      </p>
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
