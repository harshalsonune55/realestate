"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePerm, startSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/password";
import { SIGNUP_ROLES } from "@/lib/rbac";
import { db, nextId, write } from "@/lib/store";
import { addDays, today } from "@/lib/utils";
import type { Role, User } from "@/lib/types";
import { userStatus } from "@/lib/types";
import { highestUserNumber, signUpProblems, type SignUpErrors } from "./account-rules";

/* ------------------------------------------------------------------ shapes */

export type SignUpValues = {
  name: string;
  email: string;
  phone: string;
  title: string;
  role: string;
};

export type SignUpState = {
  errors?: SignUpErrors;
  values?: SignUpValues;
};

export type SignInState = { error?: string; email?: string };

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

/* -------------------------------------------------------------- rate limit */

/**
 * Failed sign-ins per email address, kept in memory. A restart clears it, which
 * is acceptable for a single-instance deployment: the point is to make online
 * password guessing slow, not to survive a redeploy.
 */
const g = globalThis as unknown as { __pmsAttempts?: Map<string, { n: number; until: number }> };
g.__pmsAttempts ??= new Map();

const MAX_ATTEMPTS = 8;
const LOCKOUT_MS = 10 * 60 * 1000;

function lockedFor(email: string): number {
  const rec = g.__pmsAttempts!.get(email);
  if (!rec || rec.n < MAX_ATTEMPTS) return 0;
  const left = rec.until - Date.now();
  if (left <= 0) {
    g.__pmsAttempts!.delete(email);
    return 0;
  }
  return Math.ceil(left / 60000);
}

function noteFailure(email: string) {
  const rec = g.__pmsAttempts!.get(email) ?? { n: 0, until: 0 };
  rec.n += 1;
  rec.until = Date.now() + LOCKOUT_MS;
  g.__pmsAttempts!.set(email, rec);
}

/* ----------------------------------------------------------------- sign up */

export async function signUpAction(
  _prev: SignUpState,
  formData: FormData
): Promise<SignUpState> {
  const values: SignUpValues = {
    name: str(formData, "name"),
    email: str(formData, "email").toLowerCase(),
    phone: str(formData, "phone"),
    title: str(formData, "title"),
    role: str(formData, "role"),
  };
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const errors = signUpProblems(
    { ...values, password, confirm, terms: formData.get("terms") === "on" },
    db().users.map((u) => u.email)
  );

  if (Object.keys(errors).length) return { errors, values };

  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();

  const admin =
    db().users.find((u) => u.role === "admin" && u.active) ??
    db().users.find((u) => u.role === "manager" && u.active);

  const user = write((d) => {
    d.counters.user ??= highestUserNumber(d.users.map((u) => u.id));

    const created: User = {
      id: nextId("user", "U"),
      name: values.name,
      email: values.email,
      role: "viewer", // effective role stays the lowest until an admin decides
      requestedRole: values.role as Role,
      title: values.title,
      phone: values.phone || undefined,
      active: false,
      status: "pending",
      passwordHash,
      createdAt: now,
    };
    d.users.push(created);

    if (admin) {
      d.tasks.unshift({
        id: nextId("task", "T"),
        title: `Review access request — ${created.name}`,
        detail: `${created.name} (${created.title}) requested ${values.role} access. Approve or decline in Users & roles.`,
        assignedTo: admin.id,
        dueDate: addDays(today(), 1),
        status: "open",
        priority: "high",
        entityType: "user",
        entityId: created.id,
        createdAt: now,
        source: "system",
      });
    }

    return created;
  });

  logAudit(
    user,
    "user.signup_requested",
    "user",
    user.id,
    `Requested ${values.role} access as ${user.title}`
  );

  revalidatePath("/", "layout");
  redirect(`/signup/submitted?email=${encodeURIComponent(user.email)}`);
}

/* ----------------------------------------------------------------- sign in */

export async function signInAction(
  _prev: SignInState,
  formData: FormData
): Promise<SignInState> {
  const email = str(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Enter your email address and password.", email };

  const mins = lockedFor(email);
  if (mins)
    return {
      error: `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`,
      email,
    };

  const user = db().users.find((u) => u.email.toLowerCase() === email);

  // Verifying against a throwaway hash when the account does not exist keeps the
  // response time the same either way, so the form cannot be used to discover
  // which addresses are registered.
  const stored = user?.passwordHash ?? "scrypt$00$00";
  const ok = await verifyPassword(password, stored);

  if (!user || !user.passwordHash || !ok) {
    noteFailure(email);
    if (user && !user.passwordHash)
      return {
        error: "This is a demo account — pick it from the list below instead.",
        email,
      };
    return { error: "Email or password is not correct.", email };
  }

  const status = userStatus(user);
  if (status === "pending")
    return {
      error: "Your account is still waiting for administrator approval.",
      email,
    };
  if (status === "suspended" || !user.active)
    return { error: "This account has been disabled. Contact your administrator.", email };

  g.__pmsAttempts!.delete(email);
  write((d) => {
    const u = d.users.find((x) => x.id === user.id)!;
    u.lastLoginAt = new Date().toISOString();
  });

  await startSession(user.id);
  redirect("/");
}

/* ---------------------------------------------------------------- approval */

export async function approveSignupAction(formData: FormData) {
  const actor = await requirePerm("admin.users");
  const id = str(formData, "userId");
  const role = str(formData, "role") as Role;

  const target = db().users.find((u) => u.id === id);
  if (!target || userStatus(target) !== "pending") return;
  if (!SIGNUP_ROLES.includes(role)) return;

  write((d) => {
    const u = d.users.find((x) => x.id === id)!;
    u.role = role;
    u.active = true;
    u.status = "active";
    u.approvedBy = actor.id;
    u.approvedAt = new Date().toISOString();
    const t = d.tasks.find((x) => x.entityType === "user" && x.entityId === id && x.status !== "done");
    if (t) {
      t.status = "done";
      t.completedAt = new Date().toISOString();
    }
  });

  logAudit(actor, "user.approved", "user", id, `Approved ${target.name} as ${role}`, [
    { field: "status", from: "pending", to: "active" },
    { field: "role", from: target.requestedRole ?? "—", to: role },
  ]);

  revalidatePath("/", "layout");
}

export async function declineSignupAction(formData: FormData) {
  const actor = await requirePerm("admin.users");
  const id = str(formData, "userId");
  const reason = str(formData, "reason");

  const target = db().users.find((u) => u.id === id);
  if (!target || userStatus(target) !== "pending") return;

  write((d) => {
    const u = d.users.find((x) => x.id === id)!;
    u.status = "suspended";
    u.active = false;
    u.declinedBy = actor.id;
    u.declinedAt = new Date().toISOString();
    u.declineReason = reason || undefined;
    const t = d.tasks.find((x) => x.entityType === "user" && x.entityId === id && x.status !== "done");
    if (t) {
      t.status = "done";
      t.completedAt = new Date().toISOString();
    }
  });

  logAudit(
    actor,
    "user.declined",
    "user",
    id,
    `Declined access for ${target.name}${reason ? ` — ${reason}` : ""}`
  );

  revalidatePath("/", "layout");
}
