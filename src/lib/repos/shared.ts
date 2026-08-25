import "server-only";
import type { PoolClient } from "pg";
import type { Role } from "../types";
import { pickAssignee } from "../assign";

/**
 * Helpers shared by the per-module repositories.
 *
 * Each repository exposes one function per business operation rather than a
 * generic `write()`. The reason is that a single user action — recording a
 * bounced cheque, say — touches four tables, and in Postgres those writes have
 * to land inside one transaction or not at all. A generic mutate-the-world
 * helper cannot give that guarantee; a named operation can.
 */

/**
 * Two people acted on the same record and this one lost the race.
 *
 * A distinct type because the guarded UPDATEs below cannot tell the caller
 * "already decided" any other way, and the caller must be able to tell that
 * apart from the database being unreachable. Catching every error and calling
 * it a conflict would report a failed save as somebody else's edit — the user
 * would retry, see the same message, and never learn their work was not saved.
 * Only this type is caught; everything else propagates and surfaces as a 500.
 */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/**
 * Picks the account a system-generated task should be assigned to.
 *
 * The JSON store hardcoded ids — "U2" for the general manager, "U8" for the
 * maintenance supervisor — because the demo portfolio always ships the same
 * nine people. Postgres issues UUIDs, so those literals match nobody: the task
 * would be inserted with a dangling assignee, or rejected by the foreign key.
 * Resolving by role is what the hardcoded ids were standing in for anyway.
 *
 * Returns null when nobody holds the role, which leaves the task unassigned
 * rather than failing the action — an unassigned task is visible and can be
 * picked up; a refused cheque bounce cannot.
 */
export async function assigneeFor(
  c: PoolClient,
  roles: Role[],
  /** Preferred holder, used when the actor themselves should own the follow-up. */
  preferred?: string | null
): Promise<string | null> {
  if (preferred) return preferred;

  /* Every active holder of the wanted roles, with the load they are already
     carrying. The counts come from the same transaction as the insert that
     follows, so two tasks raised together cannot both be handed to the person
     who merely looked idle a moment ago. */
  const { rows } = await c.query(
    `SELECT u.id,
            u.role::text                                          AS role,
            COUNT(t.id) FILTER (WHERE t.status <> 'done')         AS open,
            COUNT(t.id) FILTER (WHERE t.status = 'overdue')       AS overdue,
            MAX(t.created_at)                                     AS last_assigned
       FROM users u
       LEFT JOIN tasks t ON t.assigned_to = u.id
      WHERE u.status = 'active' AND u.role = ANY($1::user_role[])
      GROUP BY u.id, u.role`,
    [roles]
  );

  return pickAssignee(
    rows.map((r) => ({
      id: String(r.id),
      role: r.role as Role,
      open: Number(r.open),
      overdue: Number(r.overdue),
      lastAssignedAt: r.last_assigned ? Date.parse(String(r.last_assigned)) : 0,
    })),
    roles
  );
}

/** Closes every open task pointing at one entity. Returns the rows it closed. */
export async function closeTasksFor(
  c: PoolClient,
  entityType: string,
  entityId: string,
  at: string
): Promise<void> {
  await c.query(
    `UPDATE tasks SET status = 'done', completed_at = $3
      WHERE entity_type = $1 AND entity_id = $2 AND status <> 'done'`,
    [entityType, entityId, at]
  );
}

/** Inserts one task. `assignedTo` may be null — see {@link assigneeFor}. */
export async function insertTask(
  c: PoolClient,
  t: {
    title: string;
    detail: string;
    assignedTo: string | null;
    dueDate: string;
    status: string;
    priority: string;
    entityType: string | null;
    entityId: string | null;
    createdAt: string;
  }
): Promise<string> {
  const { rows } = await c.query(
    `INSERT INTO tasks
       (title, detail, assigned_to, due_date, status, priority,
        entity_type, entity_id, source, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'system',$9)
     RETURNING id`,
    [
      t.title, t.detail, t.assignedTo, t.dueDate, t.status, t.priority,
      t.entityType, t.entityId, t.createdAt,
    ]
  );
  return String(rows[0].id);
}

/** Inserts one approval and returns its id and reference. */
export async function insertApproval(
  c: PoolClient,
  a: {
    ref: string;
    type: string;
    title: string;
    summary: string;
    entityType: string | null;
    entityId: string | null;
    /** Fils, already converted. */
    amount: number | null;
    requestedBy: string;
    requestedAt: string;
  }
): Promise<string> {
  const { rows } = await c.query(
    `INSERT INTO approvals
       (ref, type, title, summary, entity_type, entity_id, amount,
        requested_by, requested_at, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending')
     RETURNING id`,
    [
      a.ref, a.type, a.title, a.summary, a.entityType, a.entityId,
      a.amount, a.requestedBy, a.requestedAt,
    ]
  );
  return String(rows[0].id);
}

/**
 * Next human-facing reference, allocated atomically inside the caller's
 * transaction so a rollback gives the number back.
 */
export async function nextRefIn(
  c: PoolClient,
  counter: string,
  format: (n: number) => string
): Promise<string> {
  const { rows } = await c.query("SELECT next_counter($1) AS n", [counter]);
  return format(Number(rows[0].n));
}
