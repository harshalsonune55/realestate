"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowUpRight, Calendar, Check, CircleDashed, Loader2, Lock, Plus, UserPlus, X,
} from "lucide-react";
import {
  completeTaskAction, createTaskAction, reassignTaskAction, retryTaskSyncAction,
} from "@/lib/actions/tasks";
import RetrySyncButton from "@/components/RetrySyncButton";
import { celebrate } from "@/components/SuccessCelebration";
import { Input, Select } from "@/components/form";
import { cx, fmtDate } from "@/lib/utils";
import type { TaskView } from "./TaskRow";

/**
 * The task board.
 *
 * Columns are the four states a person actually asks about — what is late,
 * what is today, what is coming, what is finished — rather than the four values
 * the `status` column happens to hold. A task moves between them by its due
 * date passing or by being closed, so there is nothing to drag: the board
 * reflects the work, it does not define it.
 */

type Bucket = "overdue" | "today" | "upcoming" | "done";

const COLUMNS: {
  key: Bucket;
  label: string;
  mark: string;
  dot: string;
  /** Columns you can add to. Nobody deliberately raises a late task. */
  canAdd: boolean;
  /** Days from today the composer pre-fills. */
  offset: number;
  empty: string;
}[] = [
  { key: "overdue", label: "Overdue", mark: "🔴", dot: "bg-red-500", canAdd: false, offset: 0, empty: "Nothing late." },
  { key: "today", label: "Today", mark: "📌", dot: "bg-amber-400", canAdd: true, offset: 0, empty: "Nothing due today." },
  { key: "upcoming", label: "Upcoming", mark: "🗓", dot: "bg-brand-500", canAdd: true, offset: 7, empty: "Nothing scheduled yet." },
  { key: "done", label: "Completed", mark: "✓", dot: "bg-emerald-500", canAdd: false, offset: 0, empty: "Nothing closed yet." },
];

function shiftKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86_400_000).toISOString().slice(0, 10);
}

function bucketOf(t: TaskView, todayKey: string): Bucket {
  if (t.status === "done") return "done";
  if (t.status === "overdue" || t.dueDate < todayKey) return "overdue";
  if (t.dueDate === todayKey) return "today";
  return "upcoming";
}

export default function TaskBoard({
  tasks,
  people,
  canReassign,
  todayKey,
  meId,
}: {
  tasks: TaskView[];
  people: { id: string; name: string }[];
  canReassign: boolean;
  /** Today in Gulf time, decided on the server. */
  todayKey: string;
  meId: string;
}) {
  const columns = useMemo(() => {
    const by: Record<Bucket, TaskView[]> = { overdue: [], today: [], upcoming: [], done: [] };
    for (const t of tasks) by[bucketOf(t, todayKey)].push(t);
    by.overdue.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    by.today.sort((a, b) => a.title.localeCompare(b.title));
    by.upcoming.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    return by;
  }, [tasks, todayKey]);

  return (
    <div className="scroll-thin -mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
      {COLUMNS.map((col) => (
        <section key={col.key} className="flex w-[300px] shrink-0 flex-col">
          <header className="mb-2.5 flex items-center gap-2 px-1">
            <span aria-hidden className="text-[13px]">{col.mark}</span>
            <h2 className="text-[13.5px] font-semibold text-fg">{col.label}</h2>
            <span className="tnum text-[12px] text-faint">{columns[col.key].length}</span>
          </header>

          <div className="space-y-2.5">
            {columns[col.key].length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-[12px] text-faint">
                {col.empty}
              </p>
            ) : (
              columns[col.key].map((t) => (
                <BoardCard
                  key={t.id}
                  task={t}
                  people={people}
                  canReassign={canReassign}
                  todayKey={todayKey}
                />
              ))
            )}

            {col.canAdd && (
              <Composer
                defaultDate={shiftKey(todayKey, col.offset)}
                people={people}
                canAssign={canReassign}
                meId={meId}
              />
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- one card */

function BoardCard({
  task,
  people,
  canReassign,
  todayKey,
}: {
  task: TaskView;
  people: { id: string; name: string }[];
  canReassign: boolean;
  todayKey: string;
}) {
  const [closing, setClosing] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const done = task.status === "done";
  const late = !done && (task.status === "overdue" || task.dueDate < todayKey);
  const closeable = !done && task.mine && !task.guided;

  return (
    <div
      className={cx(
        "rounded-xl border bg-surface p-3 shadow-xs transition hover:shadow-sm",
        done ? "border-line opacity-70" : late ? "border-red-200" : "border-line"
      )}
    >
      <div className="flex items-start gap-2.5">
        {/* the circle: tick it to close, or learn why you cannot */}
        <button
          type="button"
          disabled={pending || done}
          title={
            done ? "Closed"
              : task.guided ? "Closes itself when the procedure finishes"
              : closeable ? "Close this task"
              : "Assigned to someone else"
          }
          onClick={() => {
            if (closeable) setClosing((c) => !c);
            else if (task.guided) setMsg("This one closes itself when you finish the procedure.");
            else setMsg("This task belongs to somebody else.");
          }}
          className={cx(
            "mt-px grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border transition",
            done
              ? "border-emerald-500 bg-emerald-500 text-white"
              : closeable
              ? "border-line-strong text-transparent hover:border-brand-solid hover:text-brand-solid"
              : "border-line-strong text-transparent"
          )}
        >
          {done ? <Check size={11} /> : task.guided ? <Lock size={9} className="text-faint" /> : <Check size={11} />}
        </button>

        <div className="min-w-0 flex-1">
          <p className={cx("text-[13px] leading-snug", done ? "text-muted line-through" : "text-fg")}>
            {task.title}
          </p>
          {task.detail && (
            <p className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-muted">{task.detail}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={cx(
                "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px]",
                late ? "bg-red-50 font-medium text-red-700" : "bg-subtle text-muted"
              )}
            >
              <Calendar size={11} /> {fmtDate(task.dueDate)}
            </span>
            {!task.mine && (
              <span className="text-[11px] text-faint">{task.assignedToName}</span>
            )}
            {!task.odooSynced && (
              <span
                title={task.odooError ?? "Not mirrored to Odoo yet"}
                className="inline-flex items-center gap-1 text-[11px] text-amber-700"
              >
                <CircleDashed size={11} /> Odoo
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          {task.href && (
            <Link
              href={task.href}
              title={task.guided ? "Open the guided procedure" : "Open"}
              className="grid h-6 w-6 place-items-center rounded-md text-muted transition hover:bg-subtle hover:text-fg"
            >
              <ArrowUpRight size={13} />
            </Link>
          )}
          {canReassign && !done && (
            <button
              type="button"
              title="Reassign"
              onClick={() => setReassigning((r) => !r)}
              className="grid h-6 w-6 place-items-center rounded-md text-muted transition hover:bg-subtle hover:text-fg"
            >
              <UserPlus size={13} />
            </button>
          )}
        </div>
      </div>

      {closing && (
        <div className="mt-2.5 space-y-2 rounded-xl bg-subtle p-2.5">
          <p className="text-[11.5px] font-medium text-fg">What did you do?</p>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Called the tenant, cheque collected"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await completeTaskAction(task.id, note);
                  setMsg(res.message);
                  if (res.ok) {
                    celebrate();
                    setClosing(false);
                    router.refresh();
                  }
                })
              }
              className="inline-flex h-7 items-center gap-1.5 rounded-xl bg-brand-solid px-2.5 text-[12px] font-medium text-white disabled:opacity-60"
            >
              {pending && <Loader2 size={12} className="animate-spin" />} Close
            </button>
            <button type="button" onClick={() => setClosing(false)} className="text-[12px] text-muted">
              Cancel
            </button>
          </div>
        </div>
      )}

      {reassigning && (
        <div className="mt-2.5 rounded-xl bg-subtle p-2.5">
          <Select
            defaultValue=""
            onChange={(e) =>
              e.target.value &&
              start(async () => {
                const res = await reassignTaskAction(task.id, e.target.value);
                setMsg(res.message);
                if (res.ok) {
                  celebrate();
                  setReassigning(false);
                  router.refresh();
                }
              })
            }
          >
            <option value="">Reassign to…</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </div>
      )}

      {!task.odooSynced && task.canRetrySync && (
        <div className="mt-2">
          <RetrySyncButton action={retryTaskSyncAction.bind(null, task.id)} label="Retry Odoo sync" />
        </div>
      )}

      {msg && <p className="mt-2 text-[11px] text-muted">{msg}</p>}
    </div>
  );
}

/* ------------------------------------------------------------- add a task */

function Composer({
  defaultDate,
  people,
  canAssign,
  meId,
}: {
  defaultDate: string;
  people: { id: string; name: string }[];
  canAssign: boolean;
  meId: string;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(defaultDate);
  const [assignedTo, setAssignedTo] = useState(meId);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const reset = () => {
    setTitle("");
    setDueDate(defaultDate);
    setAssignedTo(meId);
    setMsg(null);
  };

  const submit = () =>
    start(async () => {
      const res = await createTaskAction(
        JSON.stringify({ title, detail: "", dueDate, assignedTo, priority: "medium" })
      );
      setMsg(res.message);
      if (res.ok) {
        celebrate();
        reset();
        setOpen(false);
        router.refresh();
      }
    });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-1.5 rounded-xl px-3 py-2.5 text-[12.5px] text-muted transition hover:bg-subtle hover:text-fg"
      >
        <Plus size={14} /> Add task
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-line bg-surface p-3 shadow-xs">
      <div className="flex items-start gap-2">
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !pending) submit();
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="What needs doing?"
        />
        <button
          type="button"
          onClick={() => { setOpen(false); reset(); }}
          className="mt-1.5 shrink-0 text-muted transition hover:text-fg"
          aria-label="Cancel"
        >
          <X size={14} />
        </button>
      </div>

      <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />

      {canAssign && (
        <Select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id === meId ? `${p.name} (me)` : p.name}
            </option>
          ))}
        </Select>
      )}

      <button
        type="button"
        disabled={pending || title.trim().length < 4}
        onClick={submit}
        className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-xl bg-brand-solid text-[12.5px] font-medium text-white transition hover:bg-brand-solid-hover disabled:opacity-50"
      >
        {pending && <Loader2 size={12} className="animate-spin" />} Add task
      </button>

      {msg && <p className="text-[11px] text-muted">{msg}</p>}
    </div>
  );
}
