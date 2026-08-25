import Link from "next/link";
import { CheckCircle2, Columns3, ListChecks, Rows3 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { loadData } from "@/lib/data";
import { cx } from "@/lib/utils";
import { Card, CardHead, Empty, PageHead, Stat } from "@/components/ui";
import TaskRow, { TaskView } from "./TaskRow";
import TaskBoard from "./TaskBoard";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "open", label: "Open" },
  { key: "overdue", label: "Overdue" },
  { key: "done", label: "Completed" },
  { key: "all", label: "All" },
];

/** The office day. Which column a task lands in is decided in Gulf time. */
const GULF_OFFSET_MS = 4 * 60 * 60_000;

function gulfToday(): string {
  return new Date(Date.now() + GULF_OFFSET_MS).toISOString().slice(0, 10);
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; scope?: string; view?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const view = sp.view === "list" ? "list" : "board";
  const filter = sp.filter ?? "open";
  const isManager = user.role === "manager" || user.role === "admin";
  const scope = isManager ? sp.scope ?? "mine" : "mine";

  const d = await loadData();
  const name = (id: string) => d.users.find((u) => u.id === id)?.name ?? id;

  const href = (t: { entityType?: string; entityId?: string }) => {
    if (!t.entityType || !t.entityId) return null;
    switch (t.entityType) {
      case "cheque":
        return `/cheques/${t.entityId}`;
      case "contract":
        return `/contracts/${t.entityId}`;
      case "approval":
        return "/approvals";
      case "maintenance":
        return `/maintenance/${t.entityId}`;
      default:
        return null;
    }
  };

  const scoped = d.tasks.filter((t) => (scope === "mine" ? t.assignedTo === user.id : true));

  const counts = {
    open: scoped.filter((t) => t.status === "open" || t.status === "overdue").length,
    overdue: scoped.filter((t) => t.status === "overdue").length,
    done: scoped.filter((t) => t.status === "done").length,
    all: scoped.length,
  };

  // The board shows the whole scope and does its own grouping; the chips only
  // narrow the list, where there is a single column to narrow.
  let list = scoped;
  if (view === "list") {
    if (filter === "open") list = list.filter((t) => t.status === "open" || t.status === "overdue");
    else if (filter === "overdue") list = list.filter((t) => t.status === "overdue");
    else if (filter === "done") list = list.filter((t) => t.status === "done");
  }

  list = [...list].sort((a, b) => {
    const rank = (s: string) => (s === "overdue" ? 0 : s === "open" ? 1 : 3);
    if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
    return a.dueDate < b.dueDate ? -1 : 1;
  });

  const views: TaskView[] = list.slice(0, view === "board" ? 400 : 120).map((t) => ({
    id: t.id,
    title: t.title,
    detail: t.detail,
    dueDate: t.dueDate,
    status: t.status,
    priority: t.priority,
    assignedToName: name(t.assignedTo),
    entityType: t.entityType,
    entityId: t.entityId,
    mine: t.assignedTo === user.id,
    guided: t.entityType === "cheque" || t.entityType === "approval",
    href: href(t),
    odooSynced: Boolean(t.odooTaskId) && !t.odooError,
    odooError: t.odooError,
    canRetrySync: isManager,
  }));

  // Whoever can be handed work. The signed-in user is always in the list, so
  // the board's assignee picker can default to "me" and mean it.
  const people = d.users
    .filter((u) => (u.active && u.role !== "viewer") || u.id === user.id)
    .map((u) => ({ id: u.id, name: u.name }));

  const todayKey = gulfToday();

  // team workload, managers only
  const workload = d.users
    .filter((u) => u.active)
    .map((u) => ({
      user: u,
      open: d.tasks.filter((t) => t.assignedTo === u.id && t.status !== "done").length,
      overdue: d.tasks.filter((t) => t.assignedTo === u.id && t.status === "overdue").length,
    }))
    .filter((w) => w.open > 0 || w.overdue > 0)
    .sort((a, b) => b.overdue - a.overdue || b.open - a.open);

  const linkFor = (params: Record<string, string>) => {
    const u = new URLSearchParams({ filter, scope, view, ...params });
    return "/tasks?" + u.toString();
  };

  const sidebar = (
    <>
      <Card>
        <CardHead title="Where tasks come from" icon={<ListChecks size={17} />} />
        <ul className="space-y-2.5 text-[12px]">
          {[
            ["Cheque due in 7 days", "Assigned to accounts, escalates when overdue"],
            ["Cheque returned by bank", "Chase task plus a manager approval"],
            ["Contract 90 days from expiry", "Renewal task to the leasing executive"],
            ["Maintenance SLA breached", "Escalation to the supervisor"],
            ["Approval submitted", "Review task to the manager, 2-day SLA"],
            ["Approval rejected", "Rework task back to whoever raised it"],
          ].map(([a, b]) => (
            <li key={a}>
              <p className="font-medium text-fg">{a}</p>
              <p className="text-muted">{b}</p>
            </li>
          ))}
        </ul>
      </Card>

      {isManager && workload.length > 0 && (
        <Card>
          <CardHead title="Team workload" sub="Open tasks per employee." />
          <ul className="space-y-2.5">
            {workload.map((w) => (
              <li key={w.user.id} className="flex items-center gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-subtle text-[11px] font-semibold text-fg-soft">
                  {w.user.name.split(" ").slice(0, 2).map((p) => p[0]).join("")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium text-fg">{w.user.name}</p>
                  <p className="text-[11px] text-muted">{w.user.title}</p>
                </div>
                <div className="text-right">
                  <p className="tnum text-[13px] font-semibold text-fg">{w.open}</p>
                  {w.overdue > 0 && (
                    <p className="tnum text-[10.5px] font-medium text-red-600">{w.overdue} late</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );

  return (
    <div>
      <PageHead
        title={scope === "mine" ? "My tasks" : "Team tasks"}
        sub="The system creates these automatically from cheque due dates, contract expiries, maintenance SLAs and approvals. Nothing depends on someone remembering."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open" value={String(counts.open)} sub="waiting on you" />
        <Stat label="Overdue" value={String(counts.overdue)} sub="past their due date" tone={counts.overdue ? "bad" : "good"} />
        <Stat label="Completed" value={String(counts.done)} sub="closed with a note" tone="good" />
        <Stat label="Total" value={String(counts.all)} sub="all time" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {/* board / list */}
        <div className="flex overflow-hidden rounded-xl border border-line">
          {([
            { key: "board", label: "Board", icon: <Columns3 size={13} /> },
            { key: "list", label: "List", icon: <Rows3 size={13} /> },
          ] as const).map((v) => (
            <Link
              key={v.key}
              href={linkFor({ view: v.key })}
              className={cx(
                "inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium transition",
                view === v.key ? "bg-inverse text-white" : "bg-surface text-fg-soft hover:bg-subtle"
              )}
            >
              {v.icon} {v.label}
            </Link>
          ))}
        </div>

        {view === "list" &&
          FILTERS.map((f) => (
            <Link
              key={f.key}
              href={linkFor({ filter: f.key })}
              className={cx(
                "rounded-xl border px-3.5 py-1.5 text-[12.5px] font-semibold transition",
                filter === f.key
                  ? "border-inverse bg-inverse text-white"
                  : "border-line bg-surface text-fg-soft hover:border-line-strong"
              )}
            >
              {f.label}
            </Link>
          ))}

        {isManager && (
          <div className="ml-auto flex gap-2">
            <Link
              href={linkFor({ scope: "mine" })}
              className={cx(
                "rounded-xl border px-3.5 py-1.5 text-[12.5px] font-semibold transition",
                scope === "mine" ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line bg-surface text-fg-soft"
              )}
            >
              Mine
            </Link>
            <Link
              href={linkFor({ scope: "team" })}
              className={cx(
                "rounded-xl border px-3.5 py-1.5 text-[12.5px] font-semibold transition",
                scope === "team" ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line bg-surface text-fg-soft"
              )}
            >
              Whole team
            </Link>
          </div>
        )}
      </div>

      {view === "board" ? (
        <>
          <TaskBoard
            tasks={views}
            people={people}
            canReassign={isManager}
            todayKey={todayKey}
            meId={user.id}
          />
          <div className="mt-6 grid gap-5 lg:grid-cols-2">{sidebar}</div>
        </>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          <div className="space-y-2.5">
            {views.length === 0 ? (
              <Card>
                <Empty
                  title="Nothing here"
                  sub="When a cheque comes due, a contract nears expiry or a manager rejects something, a task appears here."
                  icon={<CheckCircle2 size={24} />}
                />
              </Card>
            ) : (
              views.map((t) => (
                <TaskRow key={t.id} task={t} canReassign={isManager} people={people} />
              ))
            )}
          </div>

          <div className="space-y-5">{sidebar}</div>
        </div>
      )}
    </div>
  );
}
