import "server-only";
import { q, q1, tx } from "../db";
import { backend } from "../data";
import { toUser } from "../repo";
import { db as jsonDb, nextId as nextJsonId, write as jsonWrite } from "../store";
import { addDays, today } from "../utils";
import type { Role, User } from "../types";
import { highestUserNumber } from "../actions/account-rules";
import { assigneeFor, closeTasksFor, insertTask } from "./shared";

/**
 * Accounts and access requests.
 *
 * This is the module the rest of authentication stands on, so every operation
 * is expressed as one call that either fully happens or does not happen at all.
 * Approving a signup, for example, both grants the role and closes the review
 * task; leaving one of those half-done would show an administrator a task
 * asking them to approve an account that is already live.
 */

/* ------------------------------------------------------------------- reads */

export async function listUserEmails(): Promise<string[]> {
  if (backend() === "json") return jsonDb().users.map((u) => u.email);
  const rows = await q<{ email: string }>("SELECT email FROM users");
  return rows.map((r) => String(r.email));
}

export async function findUserById(id: string): Promise<User | null> {
  if (backend() === "json") return jsonDb().users.find((u) => u.id === id) ?? null;
  // A malformed id must read as "no such user", not as a 500. Session cookies
  // outlive schema changes, and a stale short id ("U3") is not a valid UUID.
  if (!UUID_RE.test(id)) return null;
  const row = await q1("SELECT * FROM users WHERE id = $1", [id]);
  return row ? toUser(row) : null;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  if (backend() === "json") {
    const wanted = email.toLowerCase();
    return jsonDb().users.find((u) => u.email.toLowerCase() === wanted) ?? null;
  }
  // `email` is CITEXT, so the comparison is already case-insensitive.
  const row = await q1("SELECT * FROM users WHERE email = $1", [email]);
  return row ? toUser(row) : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Accounts that sign in by one-click selection — the seeded demo staff. */
export async function listDemoUsers(): Promise<User[]> {
  if (backend() === "json") {
    return jsonDb().users.filter((u) => u.active && !u.passwordHash);
  }
  const rows = await q(
    "SELECT * FROM users WHERE status = 'active' AND password_hash IS NULL ORDER BY name"
  );
  return rows.map(toUser);
}

/** The administrator a new applicant should be told to expect a reply from. */
export async function primaryAdmin(): Promise<User | null> {
  if (backend() === "json") {
    return jsonDb().users.find((u) => u.role === "admin" && u.active) ?? null;
  }
  const row = await q1(
    "SELECT * FROM users WHERE role = 'admin' AND status = 'active' ORDER BY created_at LIMIT 1"
  );
  return row ? toUser(row) : null;
}

/* ------------------------------------------------------------------ signup */

export interface SignupInput {
  name: string;
  email: string;
  phone: string;
  title: string;
  requestedRole: Role;
  passwordHash: string;
  now: string;
}

/**
 * Records an access request and puts it on an administrator's list.
 *
 * The account is created with the *lowest* effective role regardless of what
 * was asked for; `requestedRole` is only a note for whoever reviews it. Nothing
 * about the request can grant access on its own.
 */
export async function createSignup(input: SignupInput): Promise<User> {
  if (backend() === "json") {
    const admin =
      jsonDb().users.find((u) => u.role === "admin" && u.active) ??
      jsonDb().users.find((u) => u.role === "manager" && u.active);

    return jsonWrite((d) => {
      d.counters.user ??= highestUserNumber(d.users.map((u) => u.id));
      const created: User = {
        id: nextJsonId("user", "U"),
        name: input.name,
        email: input.email,
        role: "viewer",
        requestedRole: input.requestedRole,
        title: input.title,
        phone: input.phone || undefined,
        active: false,
        status: "pending",
        passwordHash: input.passwordHash,
        createdAt: input.now,
      };
      d.users.push(created);

      if (admin) {
        d.tasks.unshift({
          id: nextJsonId("task", "T"),
          title: `Review access request — ${created.name}`,
          detail: `${created.name} (${created.title}) requested ${input.requestedRole} access. Approve or decline in Users & roles.`,
          assignedTo: admin.id,
          dueDate: addDays(today(), 1),
          status: "open",
          priority: "high",
          entityType: "user",
          entityId: created.id,
          createdAt: input.now,
          source: "system",
        });
      }
      return created;
    });
  }

  return tx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO users
         (name, email, phone, title, role, status, password_hash,
          requested_role, created_at)
       VALUES ($1,$2,$3,$4,'viewer','pending',$5,$6,$7)
       RETURNING *`,
      [
        input.name, input.email, input.phone || null, input.title,
        input.passwordHash, input.requestedRole, input.now,
      ]
    );
    const created = toUser(rows[0]);

    const reviewer = await assigneeFor(c, ["admin", "manager"]);
    if (reviewer) {
      await insertTask(c, {
        title: `Review access request — ${created.name}`,
        detail: `${created.name} (${created.title}) requested ${input.requestedRole} access. Approve or decline in Users & roles.`,
        assignedTo: reviewer,
        dueDate: addDays(today(), 1),
        status: "open",
        priority: "high",
        entityType: "user",
        entityId: created.id,
        createdAt: input.now,
      });
    }
    return created;
  });
}

/* ------------------------------------------------------------------ sign in */

export async function recordLogin(userId: string, at: string): Promise<void> {
  if (backend() === "json") {
    jsonWrite((d) => {
      const u = d.users.find((x) => x.id === userId);
      if (u) u.lastLoginAt = at;
    });
    return;
  }
  await q("UPDATE users SET last_login_at = $2 WHERE id = $1", [userId, at]);
}

/* ---------------------------------------------------------------- approval */

/** Grants the decided role, activates the account and closes the review task. */
export async function approveSignup(
  userId: string,
  role: Role,
  actorId: string,
  at: string
): Promise<void> {
  if (backend() === "json") {
    jsonWrite((d) => {
      const u = d.users.find((x) => x.id === userId);
      if (!u) return;
      u.role = role;
      u.active = true;
      u.status = "active";
      u.approvedBy = actorId;
      u.approvedAt = at;
      const t = d.tasks.find(
        (x) => x.entityType === "user" && x.entityId === userId && x.status !== "done"
      );
      if (t) {
        t.status = "done";
        t.completedAt = at;
      }
    });
    return;
  }

  await tx(async (c) => {
    await c.query(
      `UPDATE users
          SET role = $2, status = 'active', approved_by = $3, approved_at = $4,
              declined_by = NULL, declined_at = NULL, decline_reason = NULL
        WHERE id = $1`,
      [userId, role, actorId, at]
    );
    await closeTasksFor(c, "user", userId, at);
  });
}

/** Refuses the request. The row is kept so the decision stays on the record. */
export async function declineSignup(
  userId: string,
  actorId: string,
  reason: string,
  at: string
): Promise<void> {
  if (backend() === "json") {
    jsonWrite((d) => {
      const u = d.users.find((x) => x.id === userId);
      if (!u) return;
      u.status = "suspended";
      u.active = false;
      u.declinedBy = actorId;
      u.declinedAt = at;
      u.declineReason = reason || undefined;
      const t = d.tasks.find(
        (x) => x.entityType === "user" && x.entityId === userId && x.status !== "done"
      );
      if (t) {
        t.status = "done";
        t.completedAt = at;
      }
    });
    return;
  }

  await tx(async (c) => {
    await c.query(
      `UPDATE users
          SET status = 'suspended', declined_by = $2, declined_at = $3,
              decline_reason = $4
        WHERE id = $1`,
      [userId, actorId, at, reason || null]
    );
    await closeTasksFor(c, "user", userId, at);
  });
}
