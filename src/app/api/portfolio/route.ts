import { NextResponse } from "next/server";
import { loadData } from "@/lib/data";

export const dynamic = "force-dynamic";

/**
 * The whole working set, for the phone.
 *
 * The app used to generate its own portfolio on the device, which is why its
 * figures never matched the website's: they were not the same data at all,
 * only the same generator run with the same seed until either side changed.
 * This endpoint makes the server the single source, so a cheque cleared on the
 * web shows as cleared on the phone.
 *
 * Deliberately the raw working set rather than a per-screen shape: the app
 * already knows how to derive its own totals, and giving it the records means
 * a new screen does not need a new endpoint.
 */
function authorised(req: Request): boolean {
  const token = process.env.PMS_API_TOKEN;
  if (!token) return false;
  return (req.headers.get("authorization") ?? "") === `Bearer ${token}`;
}

export async function GET(req: Request) {
  if (!authorised(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const d = await loadData();

  // Password hashes never leave the server. The app needs names and roles to
  // render a roster; it has no use for the credential itself.
  const users = d.users.map((u) => ({ ...u, passwordHash: undefined }));

  return NextResponse.json({
    ok: true,
    // Stamped so the app can tell a fresh payload from a cached one.
    at: new Date().toISOString(),
    users,
    properties: d.properties,
    units: d.units,
    tenants: d.tenants,
    contracts: d.contracts,
    cheques: d.cheques,
    payments: d.payments,
    maintenance: d.maintenance,
    approvals: d.approvals,
    tasks: d.tasks,
    audit: d.audit.slice(0, 200),
    visits: d.visits ?? [],
  });
}
