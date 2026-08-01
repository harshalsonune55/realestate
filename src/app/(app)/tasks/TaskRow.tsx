"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Check, Loader2, Lock, UserPlus } from "lucide-react";
import { completeTaskAction, reassignTaskAction } from "@/lib/actions/tasks";
import { Badge } from "@/components/ui";
import { Input, Select } from "@/components/form";
import { cx, fmtDate, relative } from "@/lib/utils";

export interface TaskView {
  id: string;
  title: string;
  detail: string;
  dueDate: string;
  status: string;
  priority: string;
  assignedToName: string;
  entityType?: string;
  entityId?: string;
  mine: boolean;
  guided: boolean;
  href: string | null;
}

export default function TaskRow({
  task,
  canReassign,
  people,
}: {
  task: TaskView;
  canReassign: boolean;
  people: { id: string; name: string }[];
}) {
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const overdue = task.status === "overdue";
  const done = task.status === "done";

  return (
    <div
      className={cx(
        "rounded-xl border bg-surface p-3.5 transition",
        done ? "border-line opacity-60" : overdue ? "border-red-200 bg-red-50/40" : "border-line"
      )}
    >
      <div className="flex flex-wrap items-start gap-3">
        <span
          className={cx(
            "mt-1 h-2.5 w-2.5 shrink-0 rounded-full",
            done ? "bg-brand-500" : overdue ? "bg-red-500" : task.priority === "high" ? "bg-amber-400" : "bg-line-strong"
          )}
        />
        <div className="min-w-0 flex-1">
          <p className={cx("text-[13.5px] font-medium", done ? "text-muted line-through" : "text-fg")}>
            {task.title}
          </p>
          <p className="mt-0.5 text-[12px] text-muted">{task.detail}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge tone={done ? "good" : overdue ? "bad" : "neutral"} dot>
              {done ? "Done" : overdue ? "Overdue" : "Open"}
            </Badge>
            <span className={cx("text-[11.5px]", overdue ? "font-medium text-red-600" : "text-muted")}>
              Due {fmtDate(task.dueDate)} · {relative(task.dueDate)}
            </span>
            <span className="text-[11.5px] text-faint">· {task.assignedToName}</span>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {task.href && (
            <Link
              href={task.href}
              className="inline-flex h-8 items-center gap-1 rounded-lg bg-brand-solid px-3 text-[12px] font-medium text-white transition hover:bg-brand-solid-hover"
            >
              {task.guided ? "Open procedure" : "Open"}
              <ArrowRight size={13} />
            </Link>
          )}
          {!done && task.mine && !task.guided && (
            <button
              onClick={() => setOpen((o) => !o)}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-line px-3 text-[12px] font-medium text-fg-soft hover:text-fg"
            >
              <Check size={13} /> Close
            </button>
          )}
          {!done && task.guided && (
            <span
              title="This task closes itself when you finish the guided procedure"
              className="inline-flex h-8 items-center gap-1 rounded-lg bg-subtle px-3 text-[11.5px] text-muted"
            >
              <Lock size={12} /> Auto-closes
            </span>
          )}
          {canReassign && !done && (
            <button
              onClick={() => setReassigning((r) => !r)}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-line px-2.5 text-[12px] text-muted hover:text-fg"
            >
              <UserPlus size={13} />
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-3 space-y-2 rounded-lg bg-subtle p-3">
          <p className="text-[12px] font-medium text-fg">
            What did you do? This note is stored with your name.
          </p>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Called the tenant, replacement cheque collected on 3rd"
          />
          <div className="flex items-center gap-2">
            <button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await completeTaskAction(task.id, note);
                  setMsg(res.message);
                  if (res.ok) {
                    setOpen(false);
                    router.refresh();
                  }
                })
              }
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-solid px-3 text-[12.5px] font-medium text-white disabled:opacity-60"
            >
              {pending && <Loader2 size={13} className="animate-spin" />} Close task
            </button>
            <button onClick={() => setOpen(false)} className="text-[12.5px] text-muted">
              Cancel
            </button>
          </div>
        </div>
      )}

      {reassigning && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-subtle p-3">
          <span className="text-[12px] font-medium text-fg">Reassign to</span>
          <div className="w-56">
            <Select
              defaultValue=""
              onChange={(e) =>
                e.target.value &&
                start(async () => {
                  const res = await reassignTaskAction(task.id, e.target.value);
                  setMsg(res.message);
                  if (res.ok) {
                    setReassigning(false);
                    router.refresh();
                  }
                })
              }
            >
              <option value="">Select an employee…</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      )}

      {msg && <p className="mt-2 text-[11.5px] text-muted">{msg}</p>}
    </div>
  );
}
