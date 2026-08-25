import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { currentUser } from "@/lib/auth";
import { endWorkSession } from "@/lib/repos/work-sessions";

export async function POST(req: Request) {
  // Closed before the cookie is cleared — afterwards there is no id to close.
  // A deliberate sign out is the only end time the system actually knows;
  // every other span has to be inferred from when the heartbeat stopped.
  const user = await currentUser();
  if (user) await endWorkSession(user.id, new Date().toISOString());

  const res = NextResponse.redirect(new URL("/login", req.url), { status: 303 });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
