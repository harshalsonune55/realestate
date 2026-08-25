import "server-only";
import { q, q1 } from "../db";
import { backend } from "../data";
import { toTask } from "../repo";
import { db as jsonDb, nextId as nextJsonId, write as jsonWrite } from "../store";
import type { Task, TaskStatus } from "../types";
import { ConflictError } from "./shared";

/**
 * Tasks the staff close by hand.
 *
 * The tasks a *procedure* closes — a cheque clearing, a work order closing —
 * are written by the module that owns the procedure, inside its transaction.
 * Only the two operations a person performs directly on a task itself live
 * here.
 */

export async function findTask(id: string): Promise<Task | null> {
  if (backend() === "json") return jsonDb().tasks.find((t) => t.id === id) ?? null;
  const row = await q1(`SELECT *, due_date::text AS due_date FROM tasks WHERE id = $1`, [id]);
  return row ? toTask(row) : null;
}

/** Display names for a set of user ids, for audit wording. */
export async function userNames(ids: string[]): Promise<Map<string, string>> {
  const wanted = ids.filter(Boolean);
  if (wanted.length === 0) return new Map();
  if (backend() === "json") {
    return new Map(
      jsonDb()
        .users.filter((u) => wanted.includes(u.id))
        .map((u) => [u.id, u.name])
    );
  }
  const rows = await q<{ id: string; name: string }>(
    "SELECT id, name FROM users WHERE id = ANY($1::uuid[])",
    [wanted]
  );
  return new Map(rows.map((r) => [String(r.id), String(r.name)]));
}

/** The fields a person supplies when raising a task by hand. */
export interface NewTask {
  title: string;
  detail: string;
  assignedTo: string;
  /** `YYYY-MM-DD`. */
  dueDate: string;
  priority: Task["priority"];
  status: TaskStatus;
}

/**
 * Raises a task somebody typed, as opposed to one a procedure raised.
 *
 * Marked `source: 'manual'` so the two are still tellable apart afterwards:
 * "the system created this from a cheque due date" and "a supervisor added
 * this" are different claims, and the audit trail should not blur them.
 *
 * Returns the new id, which Postgres decides and the JSON store takes from the
 * same counter the seed uses.
 */
export async function createTask(input: NewTask): Promise<string> {
  const createdAt = new Date().toISOString();

  if (backend() === "json") {
    const id = nextJsonId("task", "TK");
    jsonWrite((store) => {
      store.tasks.unshift({ ...input, id, createdAt, source: "manual" });
    });
    return id;
  }

  const row = await q1<{ id: string }>(
    `INSERT INTO tasks (title, detail, assigned_to, due_date, status, priority, source)
          VALUES ($1, $2, $3, $4, $5, $6, 'manual')
       RETURNING id`,
    [input.title, input.detail, input.assignedTo, input.dueDate, input.status, input.priority]
  );
  return String(row!.id);
}

/**
 * Closes a task with the note explaining what was done.
 *
 * Guarded on the task still being open, so two people pressing Close at the
 * same moment do not both append their note to the record.
 */
export async function completeTask(id: string, note: string, at: string): Promise<void> {
  if (backend() === "json") {
    jsonWrite((store) => {
      const t = store.tasks.find((x) => x.id === id);
      if (!t || t.status === "done") return;
      t.status = "done";
      t.completedAt = at;
      t.detail = t.detail + ` — closed: ${note}`;
    });
    return;
  }

  const rows = await q(
    `UPDATE tasks
        SET status = 'done', completed_at = $2, detail = detail || ' — closed: ' || $3
      WHERE id = $1 AND status <> 'done'
      RETURNING id`,
    [id, at, note]
  );
  if (rows.length === 0) throw new ConflictError("This task was already closed.");
}

/* ------------------------------------------------------------ odoo mirror */

/**
 * Fields the Odoo mirror is allowed to write back.
 *
 * Deliberately narrow. The mirror records where a task got to in Odoo; it can
 * never change the task itself. `null` clears a value, `undefined` leaves it —
 * the same distinction visits use, and what lets a successful retry clear a
 * stale error without dropping the record id.
 */
export interface TaskSyncPatch {
  odooTaskId?: number | null;
  odooSyncedAt?: string | null;
  odooError?: string | null;
}

export async function updateTaskSync(id: string, patch: TaskSyncPatch): Promise<void> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;

  if (backend() === "json") {
    jsonWrite((store) => {
      const t = store.tasks.find((x) => x.id === id);
      if (!t) return;
      for (const [k, v] of entries) {
        if (v === null) delete (t as unknown as Record<string, unknown>)[k];
        else (t as unknown as Record<string, unknown>)[k] = v;
      }
    });
    return;
  }

  const COLUMN: Record<keyof TaskSyncPatch, string> = {
    odooTaskId: "odoo_task_id",
    odooSyncedAt: "odoo_synced_at",
    odooError: "odoo_error",
  };
  const sets = entries.map(([k], i) => `${COLUMN[k as keyof TaskSyncPatch]} = $${i + 2}`);
  await q(
    `UPDATE tasks SET ${sets.join(", ")} WHERE id = $1`,
    [id, ...entries.map(([, v]) => v)]
  );
}

/**
 * How recently a task must have been raised for the automatic sweep to take it.
 *
 * The sweep exists to mirror tasks the current request just created, and those
 * are seconds old. Without a window it would also pick up every task that
 * predates the integration — on this system that is a couple of hundred rows —
 * and the first few clicks after go-live would quietly push years of history
 * into somebody's Odoo. Backfilling history is a reasonable thing to want, but
 * it is a decision somebody makes on purpose, not a side effect of recording a
 * cheque. `unsyncedTasks(limit, Infinity)` is the deliberate version.
 */
const SWEEP_WINDOW_MINUTES = 10;

/**
 * Tasks that have never been pushed to Odoo.
 *
 * Tasks are raised inside the transaction that raises the thing they are about
 * — a bounced cheque, an approval — and an Odoo call has no business inside a
 * database transaction, holding row locks open across a network hop. So the
 * mirror runs after the commit and picks the new rows up from here.
 *
 * Rows that have already failed are excluded: a first attempt and a retry are
 * different decisions, and an automatic sweep must not keep hammering a task
 * Odoo has already refused.
 */
export async function unsyncedTasks(
  limit = 25,
  windowMinutes: number = SWEEP_WINDOW_MINUTES
): Promise<Task[]> {
  const unbounded = windowMinutes === Infinity;
  const cutoff = unbounded ? null : new Date(Date.now() - windowMinutes * 60_000).toISOString();
  // Bounded at both ends. A one-sided "created since" also matches rows dated
  // in the future, and this system has them: the demo portfolio dates tasks
  // several days ahead so the dashboard has something to show. Those are not
  // tasks this request raised, and sweeping them would mirror the demo
  // portfolio into a real Odoo. A minute of slack absorbs clock skew.
  const ceiling = unbounded ? null : new Date(Date.now() + 60_000).toISOString();

  if (backend() === "json") {
    return jsonDb()
      .tasks.filter(
        (t) =>
          t.odooTaskId == null &&
          t.odooError == null &&
          (unbounded || (t.createdAt >= cutoff! && t.createdAt <= ceiling!))
      )
      .slice(0, limit);
  }

  const rows = await q(
    `SELECT *, due_date::text AS due_date FROM tasks
      WHERE odoo_task_id IS NULL AND odoo_error IS NULL
        AND ($2::timestamptz IS NULL OR created_at >= $2)
        AND ($3::timestamptz IS NULL OR created_at <= $3)
      ORDER BY created_at DESC LIMIT $1`,
    [limit, cutoff, ceiling]
  );
  return rows.map(toTask);
}

export async function reassignTask(id: string, userId: string): Promise<void> {
  if (backend() === "json") {
    jsonWrite((store) => {
      const t = store.tasks.find((x) => x.id === id);
      if (t) t.assignedTo = userId;
    });
    return;
  }
  await q("UPDATE tasks SET assigned_to = $2 WHERE id = $1", [id, userId]);
}
