"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { findUserById } from "@/lib/repos/accounts";
import { ConflictError } from "@/lib/repos/shared";
import { completeTask, createTask, findTask, reassignTask, userNames } from "@/lib/repos/tasks";
import { completeTaskInOdoo, retryTaskSync, syncTaskById } from "@/lib/actions/task-sync";

type Result = { ok: true; message: string } | { ok: false; message: string };

/** Tasks that represent a guided procedure cannot simply be ticked off. */
const GUIDED_ENTITIES = new Set(["cheque", "approval"]);

/** What the board's composer sends. Everything else about a task is derived. */
export interface TaskDraft {
  title: string;
  detail: string;
  dueDate: string;
  assignedTo: string;
  priority: "low" | "medium" | "high";
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const GULF_OFFSET_MS = 4 * 60 * 60_000;

/** Today in Gulf time — the office's day, not the server's. */
function gulfToday(): string {
  return new Date(Date.now() + GULF_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Raises a task by hand from the board.
 *
 * Most tasks here are raised by a procedure — a cheque coming due, an approval
 * being submitted — and those still are. This covers the rest: the piece of
 * follow-up that has no record behind it yet but still needs to be somebody's
 * job, with a date, rather than a note on a desk.
 */
export async function createTaskAction(payload: string): Promise<Result> {
  const user = await requireUser();
  const draft = JSON.parse(payload) as TaskDraft;

  const title = (draft.title ?? "").trim();
  const detail = (draft.detail ?? "").trim();
  const dueDate = (draft.dueDate ?? "").trim();

  if (title.length < 4) return { ok: false, message: "Give the task a title — at least a few words." };
  if (!DATE_RE.test(dueDate)) return { ok: false, message: "Pick a due date." };

  // Assigning somebody else's workload is a manager's call. Anyone may give
  // themselves a task; the check is on the target, not on the button.
  const isManager = user.role === "manager" || user.role === "admin";
  const assignedTo = draft.assignedTo && draft.assignedTo !== user.id ? draft.assignedTo : user.id;
  if (assignedTo !== user.id && !isManager)
    return { ok: false, message: "Only a manager can assign work to somebody else." };

  const target = assignedTo === user.id ? user : await findUserById(assignedTo);
  if (!target) return { ok: false, message: "That employee is not on file." };

  const priority: TaskDraft["priority"] =
    draft.priority === "high" || draft.priority === "low" ? draft.priority : "medium";

  // A task dated in the past is overdue the moment it exists. Storing it as
  // "open" would hide it from the overdue count until something else swept it.
  const status = dueDate < gulfToday() ? "overdue" : "open";

  const id = await createTask({ title, detail, assignedTo, dueDate, priority, status });

  await logAudit(user, "task.created", "task", id,
    `Raised task "${title}" for ${target.name}, due ${dueDate}`);

  // Same order as everywhere else: committed and audited first, mirrored after.
  await syncTaskById(id);

  revalidatePath("/", "layout");
  return {
    ok: true,
    message: assignedTo === user.id ? "Task added." : `Task added for ${target.name}.`,
  };
}

export async function completeTaskAction(taskId: string, note: string): Promise<Result> {
  const user = await requireUser();
  const task = await findTask(taskId);
  if (!task) return { ok: false, message: "Task not found." };
  if (task.assignedTo !== user.id && user.role !== "admin" && user.role !== "manager")
    return { ok: false, message: "This task is assigned to someone else." };
  if (task.status === "done") return { ok: false, message: "Already completed." };

  if (GUIDED_ENTITIES.has(task.entityType ?? "")) {
    return {
      ok: false,
      message:
        task.entityType === "cheque"
          ? "This task closes itself once you complete the cheque procedure. Open the cheque and follow the steps."
          : "This task closes itself once the approval is decided.",
    };
  }

  if (note.trim().length < 5)
    return { ok: false, message: "Write a short note saying what you did before closing a task." };

  try {
    await completeTask(taskId, note.trim(), new Date().toISOString());
  } catch (err) {
    // Only a lost race is reported as one. A database failure propagates, so a
    // save that did not happen is never dressed up as somebody else's edit.
    if (!(err instanceof ConflictError)) throw err;
    return { ok: false, message: "Somebody else closed this task while you were writing." };
  }

  await logAudit(user, "task.completed", "task", taskId, `Completed task: ${task.title}`, [
    { field: "status", from: task.status, to: "done" },
  ]);

  // After the close is committed and audited. The task is closed whatever Odoo
  // does next; a mirror that is behind is recorded on the row and retried.
  await completeTaskInOdoo(taskId);

  revalidatePath("/", "layout");
  return { ok: true, message: "Task closed." };
}

export async function reassignTaskAction(taskId: string, userId: string): Promise<Result> {
  const user = await requireUser();
  if (user.role !== "manager" && user.role !== "admin")
    return { ok: false, message: "Only a manager can reassign work." };

  const task = await findTask(taskId);
  const target = await findUserById(userId);
  if (!task || !target) return { ok: false, message: "Task or employee not found." };

  const from = (await userNames([task.assignedTo])).get(task.assignedTo) ?? task.assignedTo;
  await reassignTask(taskId, userId);

  await logAudit(user, "task.reassigned", "task", taskId, `Reassigned "${task.title}"`, [
    { field: "assignedTo", from, to: target.name },
  ]);

  // Writes against the id this task already owns, so a reassignment moves the
  // existing Odoo record rather than raising a second one.
  await syncTaskById(taskId);

  revalidatePath("/", "layout");
  return { ok: true, message: `Reassigned to ${target.name}.` };
}

/**
 * Pushes one task to Odoo again after a failure.
 *
 * Explicit and human-initiated, exactly like the viewing equivalent: an
 * automatic retry loop against a permanently-refusing Odoo would either hammer
 * it or quietly give up, and neither is something anybody can see.
 */
export async function retryTaskSyncAction(taskId: string): Promise<Result> {
  const user = await requireUser();
  if (user.role !== "manager" && user.role !== "admin")
    return { ok: false, message: "Only a manager can retry a sync." };

  const task = await findTask(taskId);
  if (!task) return { ok: false, message: "Task not found." };

  const sync = await retryTaskSync(taskId);
  await logAudit(user, "task.sync_retried", "task", taskId,
    `${task.title} — ${sync.synced ? "synced" : "failed"}`);

  revalidatePath("/", "layout");
  return sync.synced
    ? { ok: true, message: "Odoo updated." }
    : { ok: false, message: sync.message ?? "Odoo is still unreachable." };
}
