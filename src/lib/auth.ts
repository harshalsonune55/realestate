import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "./session-cookie";

export { SESSION_COOKIE };
import { redirect } from "next/navigation";
import { findUserById } from "./repos/accounts";
import { User } from "./types";
import { Perm, can } from "./rbac";


const SESSION_MAX_AGE = 60 * 60 * 12;

/**
 * The signed-in account, resolved against the live repository on every request.
 *
 * Reading this from the configured repository rather than the JSON file is what
 * makes suspension take effect: the cookie only carries an id, so the role and
 * the active flag come from whichever store the rest of the app is writing to.
 * Resolving them anywhere else would let a revoked account keep working.
 */
export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (!id) return null;
  const user = await findUserById(id);
  return user?.active ? user : null;
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
