/**
 * A stand-in Odoo that speaks enough JSON-RPC to exercise the real client.
 *
 * The point is to test *our* code, not Odoo's. Everything the integration
 * actually depends on — the login handshake, `execute_kw` dispatch, the fault
 * envelope, MissingError, HTTP 5xx, an unreachable host — is reproduced here so
 * the sync logic can be driven through every branch on a machine with no Odoo
 * and no credentials.
 *
 * What it deliberately does NOT prove: that `mail.activity` really accepts these
 * field names on a live Odoo 18. Only a run against the real server can.
 */
import { createServer, type Server } from "node:http";

type Rec = Record<string, unknown>;

export interface FakeOdoo {
  url: string;
  /** Records by model, keyed by id. */
  store: Map<string, Map<number, Rec>>;
  /** Every execute_kw the client made, in order. */
  calls: { model: string; method: string }[];
  /** Set to fail the next N calls with this fault. */
  failNext: { count: number; kind: "missing" | "server" | "denied" | "unreachable" } | null;
  close(): Promise<void>;
  countOf(model: string): number;
}

const FAULTS = {
  missing: { name: "odoo.exceptions.MissingError", message: "Record does not exist or has been deleted." },
  denied: { name: "odoo.exceptions.AccessError", message: "You are not allowed to modify this record." },
};

export async function startFakeOdoo(): Promise<FakeOdoo> {
  const store = new Map<string, Map<number, Rec>>();
  const calls: { model: string; method: string }[] = [];
  let nextId = Date.now(); // unique high base per run → no cross-run collisions with prior stamps

  const api: FakeOdoo = {
    url: "",
    store,
    calls,
    failNext: null,
    close: async () => {},
    countOf: (model) => store.get(model)?.size ?? 0,
  };

  const modelStore = (m: string) => {
    if (!store.has(m)) store.set(m, new Map());
    return store.get(m)!;
  };

  // Seed the lookup rows the activity anchor resolution needs: the res.partner
  // model row, and a "To-Do" activity type. A real Odoo ships both.
  modelStore("ir.model").set(88, { id: 88, model: "res.partner", name: "Contact" });
  modelStore("mail.activity.type").set(4, { id: 4, name: "To-Do" });
  // A bank journal for account.payment mirroring.
  modelStore("account.journal").set(6, { id: 6, name: "Bank", type: "bank", default_account_id: [45, "Bank"] });

  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const send = (payload: unknown, status = 200) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(payload));
      };

      const { params } = JSON.parse(body) as {
        params: { service: string; method: string; args: unknown[] };
      };

      // Failure injection happens before any dispatch, so a fault can be aimed
      // at exactly the call under test.
      if (api.failNext && api.failNext.count > 0 && params.service === "object") {
        const kind = api.failNext.kind;
        api.failNext.count -= 1;
        if (api.failNext.count === 0) api.failNext = null;

        if (kind === "server") return send({ jsonrpc: "2.0" }, 502);
        const fault = kind === "missing" ? FAULTS.missing : FAULTS.denied;
        return send({
          jsonrpc: "2.0",
          error: { message: "Odoo Server Error", data: { name: fault.name, message: fault.message } },
        });
      }

      if (params.service === "common" && (params.method === "authenticate" || params.method === "login")) {
        const [, username, key] = params.args as [string, string, string];
        // Odoo answers a bad credential with `false` and HTTP 200, not a fault.
        return send({ jsonrpc: "2.0", result: username && key !== "wrong-key" ? 2 : false });
      }

      if (params.service === "object" && params.method === "execute_kw") {
        const [, , , model, method, positional] = params.args as [
          string, number, string, string, string, unknown[]
        ];
        calls.push({ model, method });
        const recs = modelStore(model);

        if (method === "create") {
          const values = (positional as Rec[])[0];
          const id = ++nextId;
          recs.set(id, { id, ...values });
          return send({ jsonrpc: "2.0", result: id });
        }

        if (method === "write") {
          const [ids, values] = positional as [number[], Rec];
          for (const id of ids) {
            if (!recs.has(id)) {
              return send({
                jsonrpc: "2.0",
                error: { message: "Odoo Server Error", data: FAULTS.missing },
              });
            }
            recs.set(id, { ...recs.get(id)!, ...values });
          }
          return send({ jsonrpc: "2.0", result: true });
        }

        if (method === "read") {
          const [ids] = positional as [number[]];
          const out = ids.filter((id) => recs.has(id)).map((id) => recs.get(id)!);
          return send({ jsonrpc: "2.0", result: out });
        }

        if (method === "search" || method === "search_count" || method === "search_read") {
          const [domain] = positional as [unknown[][]];
          const flat = (domain?.[0] ?? []) as unknown[];
          const matched = [...recs.entries()].filter(([, r]) => {
            if (!Array.isArray(flat) || flat.length === 0) return true;
            const conds = (Array.isArray(flat[0]) ? flat : [flat]) as [string, string, unknown][];
            return conds.every(([f, op, v]) =>
              op === "in" ? (v as unknown[]).includes(r[f]) : r[f] === v);
          });
          if (method === "search_count") return send({ jsonrpc: "2.0", result: matched.length });
          if (method === "search_read") return send({ jsonrpc: "2.0", result: matched.map(([, r]) => r) });
          return send({ jsonrpc: "2.0", result: matched.map(([id]) => id) });
        }

        if (method === "unlink") {
          const [ids] = positional as [number[]];
          for (const id of ids) recs.delete(id);
          return send({ jsonrpc: "2.0", result: true });
        }

        // Payment state transitions — record the resulting state on the row.
        if (method === "action_post" || method === "action_cancel" || method === "action_draft") {
          const [ids] = positional as [number[]];
          const state = method === "action_post" ? "paid"
            : method === "action_cancel" ? "canceled" : "draft";
          for (const id of ids) if (recs.has(id)) recs.set(id, { ...recs.get(id)!, state });
          return send({ jsonrpc: "2.0", result: true });
        }

        return send({ jsonrpc: "2.0", result: false });
      }

      send({ jsonrpc: "2.0", result: false });
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;

  api.url = `http://127.0.0.1:${port}`;
  api.close = () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve());
    });

  return api;
}
