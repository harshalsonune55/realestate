import { NextRequest, NextResponse } from "next/server";
import { GATE_COOKIE, gateToken } from "@/lib/gate";
import { SESSION_COOKIE } from "@/lib/session-cookie";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  /* Somebody with a session has no use for the marketing page, so they skip
     it here rather than after the landing page has already begun streaming —
     which is what produced a flash of the loading shell on every visit.
     This is only an optimistic check on the cookie's presence, the pattern
     the Proxy docs describe: the dashboard behind it still resolves the id to
     a real, active account, so a stale or suspended session is refused there
     rather than let in by this shortcut. */
  if (pathname === "/" && req.cookies.get(SESSION_COOKIE)) {
    const to = req.nextUrl.clone();
    to.pathname = "/dashboard";
    return NextResponse.redirect(to);
  }

  const secret = process.env.PMS_ACCESS_PASSWORD;
  // No password configured (local development) — the gate is off.
  if (!secret) return NextResponse.next();

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
  // healthz stays outside the gate so the host's health check never sees a redirect.
  //
  // `.netlify` and `brand` are here because the gate has no business
  // redirecting an image request. Netlify's adapter serves next/image through
  // its own Image CDN at /.netlify/images rather than /_next/image, so the
  // exemption above misses it, and the source asset under /brand is fetched as
  // a plain file. Either one gated returns the /gate HTML where the browser
  // expects a PNG, which renders as a broken logo on this very page. Nothing
  // under public/ is secret — the marketing page serves it to anonymous
  // visitors — so exempting it costs nothing.
  matcher: ["/((?!_next/static|_next/image|\\.netlify|brand|favicon.ico|healthz).*)"],
};
