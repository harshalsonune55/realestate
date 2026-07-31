import { NextRequest, NextResponse } from "next/server";
import { GATE_COOKIE, gateToken } from "@/lib/gate";

export async function middleware(req: NextRequest) {
  const secret = process.env.PMS_ACCESS_PASSWORD;
  // No password configured (local development) — the gate is off.
  if (!secret) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname === "/gate") return NextResponse.next();

  if (req.cookies.get(GATE_COOKIE)?.value === (await gateToken(secret))) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/gate";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // healthz stays outside the gate so the host's health check never sees a redirect
  matcher: ["/((?!_next/static|_next/image|favicon.ico|healthz).*)"],
};
