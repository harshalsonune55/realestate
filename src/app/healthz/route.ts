// Liveness probe for the host (Render health check).
// Deliberately touches nothing — no database, no session, no password gate — so it
// always answers 200 while the process is alive. Anything heavier here risks the
// host deciding the app is unhealthy and restarting it in a loop.

export const dynamic = "force-dynamic";

export function GET() {
  return new Response("ok", {
    status: 200,
    headers: { "content-type": "text/plain", "cache-control": "no-store" },
  });
}
