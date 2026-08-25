import "server-only";

import {
  ACTIVITY_MARK,
  ODOO_MISSING,
  ODOO_NOT_CONFIGURED,
  OdooError,
  createActivity,
  odooConfig,
  updateActivity,
} from "@/lib/odoo";
import { findTask, unsyncedTasks, updateTaskSync } from "@/lib/repos/tasks";
import type { Task } from "@/lib/types";

/**
 * Mirrors scheduled tasks into Odoo.
 *
 * Same shape and the same ordering as the viewing mirror in `visits.ts`, for
 * the same reason: the task is already committed to Postgres before anything
 * here runs. Postgres is the source of truth. Odoo is a mirror, and a mirror
 * being behind must never cost anybody their follow-up.
 *
 * Nothing in this module throws. Every failure is written to the task's
 * `odooError` and left for an explicit retry.
 */

/** True when the environment carries enough to reach Odoo at all. */
export function odooTaskingConfigured(): boolean {
  return odooConfig() !== null;
}

/**
 * The activity payload, kept identical between create and update.
 *
 * Status lives in the summary prefix because a `mail.activity` has no state
 * field. An open task carries no prefix, so it reads naturally in Odoo's
 * activity inbox; a done or cancelled one is marked and kept, never deleted —
 * the same choice viewings make when they rename a cancelled calendar event.
 */
function taskPayload(task: Task, statusOverride?: "done" | "cancelled") {
  const detail = task.detail?.trim() ?? "";
  const status = statusOverride ?? (task.status === "done" ? "done" : "open");
  const prefix =
    status === "done" ? `${ACTIVITY_MARK.done} — ` :
    status === "cancelled" ? `${ACTIVITY_MARK.cancelled} — ` : "";

  return {
    summary: `${prefix}${task.title}`.slice(0, 500),
    // Odoo's deadline is a date, and `dueDate` is already 'YYYY-MM-DD'.
    deadline: task.dueDate,
    note:
      `<p>PMS task ${task.id}<br/>` +
      `Priority: ${task.priority}<br/>` +
      (task.entityType ? `Linked to: ${task.entityType} ${task.entityId ?? ""}<br/>` : "") +
      (detail ? detail : "") +
      `</p>`,
  };
}

export interface SyncOutcome {
  synced: boolean;
  odooTaskId?: number;
  message?: string;
}

/**
 * Pushes one task to Odoo — creating its record, or updating the one it owns.
 *
 * The branch on `odooTaskId` is the whole duplicate-prevention story: once a
 * task holds an id, every subsequent push in its life is a write against that
 * id, however many times it is retried.
 */
export async function syncTaskToOdoo(task: Task): Promise<SyncOutcome> {
  const cfg = odooConfig();
  // Optional integration — but say which of the two problems it is.
  if (!cfg) return { synced: false, message: ODOO_NOT_CONFIGURED };

  const payload = taskPayload(task);

  try {
    if (task.odooTaskId) {
      await updateActivity(cfg, task.odooTaskId, payload);
      await updateTaskSync(task.id, {
        odooSyncedAt: new Date().toISOString(),
        odooError: null,
      });
      return { synced: true, odooTaskId: task.odooTaskId };
    }

    const odooTaskId = await createActivity(cfg, payload);
    await updateTaskSync(task.id, {
      odooTaskId,
      odooSyncedAt: new Date().toISOString(),
      odooError: null,
    });
    return { synced: true, odooTaskId };
  } catch (err) {
    const odooErr = err instanceof OdooError ? err : null;

    // The record we were told to update is gone from Odoo. Recreating it here
    // would be a guess — somebody may have deleted it deliberately — so the id
    // is kept, the reason recorded, and a human decides via Retry. Identical to
    // the rule the viewing mirror follows.
    const vanished = odooErr?.odooException === ODOO_MISSING;
    const reason = vanished
      ? "The linked Odoo task no longer exists. Use Retry sync to recreate it."
      : (odooErr?.message ?? String(err));

    await updateTaskSync(task.id, { odooError: reason });
    return {
      synced: false,
      message: vanished
        ? "The Odoo task was deleted at the Odoo end — retry to recreate it."
        : "This task has not reached Odoo yet — it can be retried.",
    };
  }
}

/** Pushes one task by id, reading its current state first. */
export async function syncTaskById(taskId: string): Promise<SyncOutcome> {
  const task = await findTask(taskId);
  if (!task) return { synced: false, message: "Task not found." };
  return syncTaskToOdoo(task);
}

/**
 * Retries one task, on an explicit human action.
 *
 * The only path that will create a *replacement* record, and only for a task
 * whose Odoo record was deleted at the Odoo end. Dropping the dead id first is
 * what makes the subsequent push a create; without it the retry would write to
 * an id that is no longer there and fail again forever.
 */
export async function retryTaskSync(taskId: string): Promise<SyncOutcome> {
  const task = await findTask(taskId);
  if (!task) return { synced: false, message: "Task not found." };

  let target = task;
  if (task.odooTaskId && task.odooError?.includes("no longer exists")) {
    await updateTaskSync(taskId, { odooTaskId: null });
    target = { ...task, odooTaskId: undefined };
  } else if (!task.odooTaskId) {
    // A previous first attempt failed and left an error behind. Clear it so the
    // sweep's "never attempted" set is not permanently poisoned by one outage.
    target = { ...task, odooError: undefined };
  }

  return syncTaskToOdoo(target);
}

/**
 * Mirrors tasks raised since the last sweep.
 *
 * Called after the actions that raise tasks, once their transaction has
 * committed. Best-effort by construction: it is handed no ids and holds no
 * state, so a task missed by one sweep is simply picked up by the next.
 */
export async function syncPendingTasks(limit = 25): Promise<{ attempted: number; synced: number }> {
  if (!odooConfig()) return { attempted: 0, synced: 0 };

  const pending = await unsyncedTasks(limit);
  let synced = 0;
  for (const task of pending) {
    const out = await syncTaskToOdoo(task);
    if (out.synced) synced += 1;
  }
  return { attempted: pending.length, synced };
}

/**
 * Marks a task's Odoo record complete.
 *
 * The record is written, never deleted — the same choice the viewing mirror
 * makes on cancellation. A completed follow-up is evidence that the work was
 * done, and evidence that removes itself is not evidence.
 */
export async function completeTaskInOdoo(taskId: string): Promise<SyncOutcome> {
  const task = await findTask(taskId);
  if (!task) return { synced: false, message: "Task not found." };
  return syncTaskToOdoo({ ...task, status: "done" });
}

/**
 * Marks a task's Odoo record cancelled.
 *
 * DOCUMENTED POLICY: cancellation writes the "✗ Cancelled" marker onto the same
 * activity and keeps it — never unlinked, exactly as a cancelled viewing keeps
 * its renamed calendar event. A follow-up that was called off is part of the
 * history of the thing it was about; deleting it would erase that it was ever
 * raised.
 */
export async function cancelTaskInOdoo(taskId: string): Promise<SyncOutcome> {
  const task = await findTask(taskId);
  if (!task) return { synced: false, message: "Task not found." };

  const cfg = odooConfig();
  if (!cfg) return { synced: false, message: ODOO_NOT_CONFIGURED };
  if (!task.odooTaskId) return { synced: false, message: "This task was never mirrored." };

  try {
    await updateActivity(cfg, task.odooTaskId, taskPayload(task, "cancelled"));
    await updateTaskSync(taskId, {
      odooSyncedAt: new Date().toISOString(),
      odooError: null,
    });
    return { synced: true, odooTaskId: task.odooTaskId };
  } catch (err) {
    await updateTaskSync(taskId, {
      odooError: err instanceof OdooError ? err.message : String(err),
    });
    return { synced: false, message: "The cancellation has not reached Odoo yet." };
  }
}
