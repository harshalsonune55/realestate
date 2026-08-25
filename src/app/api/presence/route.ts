import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { startWorkSession, touchWorkSession } from "@/lib/repos/work-sessions";

export const dynamic = "force-dynamic";

/**
 * The heartbeat behind the time figures.
 *
 * The browser calls this while the app is open and visible. It exists because
 * closing a tab tells the server nothing: without it a span would have to be
 * measured to sign-out, and almost nobody signs out.
 *
 * There is nothing in the request body worth trusting — the user comes from the
 * session cookie and the time from this server's clock — so a client cannot
 * inflate its own hours by lying about either.
 */
export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const at = new Date().toISOString();
  const touched = await touchWorkSession(user.id, at);
  // Coming back to a tab that idled out opens a fresh span rather than
  // stitching the silence in between onto the old one.
  if (!touched) await startWorkSession(user.id, at);

  return NextResponse.json({ ok: true });
}
