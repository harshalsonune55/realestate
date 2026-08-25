/**
 * Live round trip for the cheque/payment mirror. Needs ODOO_* + DATABASE_URL.
 * Creates one clearly-marked DRAFT account.payment and deletes it at the end.
 * Proves a real Odoo 18 accepts these account.payment field names.
 */
import assert from "node:assert";
import { pool } from "@/lib/db";
import { backend } from "@/lib/data";
import { createPayment, odooConfig, paymentExists, readPayment, updatePayment } from "@/lib/odoo";

const cfg = odooConfig();

async function main() {
  assert.strictEqual(backend(), "postgres", "DATABASE_URL must be set");
  assert.ok(cfg, "ODOO_* must all be set");
  const stamp = Date.now();

  const id = await createPayment(cfg!, {
    amount: 13200, date: "2026-09-01",
    memo: `PMS CONNECTIVITY TEST ${stamp} cheque · safe to delete`,
    partnerName: `PMS Test Tenant ${stamp}`,
  });
  console.log(`1. created draft       account.payment id=${id}`);

  const rec = await readPayment(cfg!, id);
  assert.ok(rec, "not readable back");
  assert.strictEqual(rec!.state, "draft", "payment must be a DRAFT, never auto-posted");
  assert.strictEqual(Number(rec!.amount), 13200);
  assert.ok(rec!.partner_id, "not attributed to a partner");
  console.log(`2. read back           amount=${rec!.amount} state=${rec!.state} partner set`);

  await updatePayment(cfg!, id, { memo: `PMS CONNECTIVITY TEST ${stamp} cheque · status cleared` });
  const moved = await readPayment(cfg!, id);
  assert.match(String(moved!.memo), /status cleared/, "update did not land");
  console.log(`3. updated same id     ${id} memo now "…status cleared"`);

  // cleanup: delete the draft payment and the test partner
  const { updatePayment: _u } = await import("@/lib/odoo"); void _u;
  await deletePayment(id);
  assert.ok(!(await paymentExists(cfg!, id)), "draft payment was not removed");
  await deleteTestPartner(`PMS Test Tenant ${stamp}`);
  console.log(`4. cleaned up          payment ${id} and test partner deleted`);

  await pool().end();
  console.log("\nPASS — live cheque/payment mirror: draft create, update, same id, cleaned up.");
}

async function rpc(model: string, method: string, args: unknown[]): Promise<unknown> {
  const res = await fetch(`${cfg!.url}/jsonrpc`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service: "object", method: "execute_kw",
      args: [cfg!.db, await liveUid(), cfg!.apiKey, model, method, ...args] }, id: 1 }),
  });
  return (await res.json()).result;
}
async function deletePayment(id: number) { await rpc("account.payment", "unlink", [[id]]); }
async function deleteTestPartner(name: string) {
  const ids = (await rpc("res.partner", "search", [[["name", "=", name]]])) as number[];
  if (ids?.length) await rpc("res.partner", "unlink", [ids]);
}
let _uid: number | null = null;
async function liveUid(): Promise<number> {
  if (_uid) return _uid;
  const res = await fetch(`${cfg!.url}/jsonrpc`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call",
      params: { service: "common", method: "authenticate", args: [cfg!.db, cfg!.username, cfg!.apiKey, {}] }, id: 1 }),
  });
  _uid = (await res.json()).result; return _uid!;
}

main().catch((e) => { console.error("FAIL", e); process.exit(1); });
