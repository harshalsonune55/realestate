import Link from "next/link";
import { AlertTriangle, BellRing, ChevronRight, Info, ShieldCheck, TriangleAlert } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { alerts, REMINDER_WINDOW_DAYS } from "@/lib/queries";
import { cx } from "@/lib/utils";
import { Card, CardHead, Empty, PageHead, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

const RULES = [
  {
    title: "Cheque due in 7 days",
    detail: "A task is created for the accounts team and a reminder is sent to the tenant.",
    when: "Runs every night",
  },
  {
    title: "Cheque due date passed without a deposit",
    detail: "The cheque turns red, the task becomes overdue, and the manager sees it as money at risk.",
    when: "Runs every night",
  },
  {
    title: "Cheque deposited but not cleared after 5 days",
    detail: "Flagged so nobody assumes the money arrived when it has not.",
    when: "Runs every night",
  },
  {
    title: "Cheque returned by the bank",
    detail: "Immediate chase task plus an approval request for a replacement cheque.",
    when: "On the spot",
  },
  {
    title: "Contract 90 days from expiry",
    detail: "Renewal task assigned to the leasing executive who prepared the contract.",
    when: "Runs every night",
  },
  {
    title: "Approval waiting more than 2 days",
    detail: "Escalated on the approvals screen and on the manager's dashboard.",
    when: "Runs every night",
  },
  {
    title: "Maintenance job past its SLA",
    detail: "Escalated to the operations manager with the number of days late.",
    when: "Runs every night",
  },
];

function Section({
  title,
  items,
  tone,
}: {
  title: string;
  items: ReturnType<typeof alerts>;
  tone: "critical" | "warning" | "info";
}) {
  return items.length === 0 ? null : (
      <div>
        <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-fg">
          {tone === "critical" ? (
            <TriangleAlert size={15} className="text-red-600" />
          ) : tone === "warning" ? (
            <AlertTriangle size={15} className="text-amber-600" />
          ) : (
            <Info size={15} className="text-sky-600" />
          )}
          {title}
        </h2>
        <div className="space-y-2">
          {items.map((a) => (
            <Link
              key={a.id}
              href={a.href}
              className={cx(
                "flex items-start gap-3 rounded-xl border p-4 transition hover:shadow-md",
                tone === "critical"
                  ? "border-red-200 bg-red-50"
                  : tone === "warning"
                  ? "border-amber-200 bg-amber-50"
                  : "border-line bg-surface"
              )}
            >
              <span
                className={cx(
                  "grid h-9 w-9 shrink-0 place-items-center rounded-full text-[12px] font-bold text-white tnum",
                  tone === "critical" ? "bg-red-600" : tone === "warning" ? "bg-amber-500" : "bg-sky-600"
                )}
              >
                {a.count ?? "!"}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={cx(
                    "text-[13.5px] font-semibold",
                    tone === "critical" ? "text-red-900" : tone === "warning" ? "text-amber-900" : "text-fg"
                  )}
                >
                  {a.title}
                </p>
                <p
                  className={cx(
                    "mt-0.5 text-[12.5px]",
                    tone === "critical" ? "text-red-700" : tone === "warning" ? "text-amber-800" : "text-muted"
                  )}
                >
                  {a.detail}
                </p>
              </div>
              <ChevronRight size={16} className="mt-1 shrink-0 text-faint" />
            </Link>
          ))}
        </div>
      </div>
  );
}

export default async function AlertsPage() {
  await requireUser();
  const list = alerts();

  const critical = list.filter((a) => a.severity === "critical");
  const warning = list.filter((a) => a.severity === "warning");
  const info = list.filter((a) => a.severity === "info");

  return (
    <div>
      <PageHead
        title="Alerts"
        sub="The system watches these rules continuously. Nothing here depends on an employee noticing something."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Critical" value={String(critical.length)} sub="money at risk now" tone={critical.length ? "bad" : "good"} />
        <Stat label="Warnings" value={String(warning.length)} sub="needs attention this week" tone={warning.length ? "warn" : "good"} />
        <Stat label="Information" value={String(info.length)} sub="for awareness" tone="info" />
        <Stat label="Reminder window" value={`${REMINDER_WINDOW_DAYS} days`} sub="before every cheque due date" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {list.length === 0 ? (
            <Card>
              <Empty title="Nothing is flagged right now" sub="Every rule below is passing." icon={<BellRing size={24} />} />
            </Card>
          ) : (
            <>
              <Section title="Critical" items={critical} tone="critical" />
              <Section title="Warnings" items={warning} tone="warning" />
              <Section title="For information" items={info} tone="info" />
            </>
          )}
        </div>

        <Card>
          <CardHead
            title="Rules running in the background"
            sub="These cannot be switched off by an employee."
            icon={<ShieldCheck size={17} />}
          />
          <ul className="space-y-3">
            {RULES.map((r) => (
              <li key={r.title} className="border-b border-line-soft pb-3 last:border-0 last:pb-0">
                <p className="text-[12.5px] font-medium text-fg">{r.title}</p>
                <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{r.detail}</p>
                <p className="mt-1 inline-flex rounded-full bg-subtle px-2 py-0.5 text-[10.5px] text-muted">
                  {r.when}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
