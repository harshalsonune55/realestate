import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./store";
import { User } from "./types";
import { Perm, can } from "./rbac";

export const SESSION_COOKIE = "pms_session";
const SESSION_MAX_AGE = 60 * 60 * 12;

export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (!id) return null;
  return db().users.find((u) => u.id === id && u.active) ?? null;
}

/** Signs the user in. Deactivating an account revokes it on the next request. */
export async function startSession(userId: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, userId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE,
  });
}

/** Use inside protected pages — redirects to the sign-in screen when signed out. */
export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requirePerm(perm: Perm): Promise<User> {
  const u = await requireUser();
  if (!can(u.role, perm)) redirect("/no-access?perm=" + perm);
  return u;
}
