import "server-only";

import { toOdooDatetime } from "./actions/visit-rules";

export { toOdooDatetime };

/**
 * Minimal Odoo JSON-RPC client.
 *
 * Server-only, and deliberately so: the API key authenticates as a real Odoo
 * user, so it must never reach the browser. Nothing in `src/app` imports this
 * directly — it is reached through a server action.
 *
 * Odoo is a *mirror* here, not a source of truth. A viewing is saved to our own
 * store first and pushed afterwards; if Odoo is down the booking still stands
 * and the calendar entry is retried. That ordering is the whole design.
 */

export interface OdooConfig {
  url: string;
  db: string;
  username: string;
  apiKey: string;
}

/** Reads the environment, or returns null when Odoo is not configured. */
export function odooConfig(): OdooConfig | null {
  const url = process.env.ODOO_URL;
  const db = process.env.ODOO_DB ?? process.env.ODOO_DB_NAME;
  const username = process.env.ODOO_USERNAME;
  const apiKey = process.env.ODOO_API_KEY;
  if (!url || !db || !username || !apiKey) return null;
  return { url: url.replace(/\/$/, ""), db, username, apiKey };
}

/**
 * What to say when the integration has not been set up.
 *
 * Distinct from "unreachable" on purpose. A retry that reports the server is
 * down sends somebody to check the server; the truth is that this app has
 * never been told where Odoo is, and no amount of retrying will change that.
 */
export const ODOO_NOT_CONFIGURED =
  "Odoo is not configured on this server — set ODOO_URL, ODOO_DB, ODOO_USERNAME and ODOO_API_KEY.";

export class OdooError extends Error {
  constructor(
    message: string,
    readonly permanent: boolean,
    /** The Odoo exception class, when the fault carried one. Callers branch on
     *  this to tell "the event is gone" apart from "the payload was refused". */
    readonly odooException?: string
  ) {
    super(message);
    this.name = "OdooError";
  }
}

/** Odoo raises this when the record you addressed no longer exists. */
export const ODOO_MISSING = "odoo.exceptions.MissingError";

/** Odoo faults that will fail identically however often we retry. */
const PERMANENT = new Set([
  "odoo.exceptions.AccessDenied",
  "odoo.exceptions.AccessError",
  "odoo.exceptions.ValidationError",
  "odoo.exceptions.UserError",
  "odoo.exceptions.MissingError",
]);

async function rpc(
  cfg: OdooConfig,
  service: string,
  method: string,
  args: unknown[],
  timeoutMs: number
): Promise<unknown> {
  // AbortSignal.timeout rather than a manual race: a hung Odoo must not pin a
  // request handler open for the whole Node keep-alive window.
  let res: Response;
  try {
    res = await fetch(`${cfg.url}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: { service, method, args },
        id: 1,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new OdooError(`Odoo unreachable: ${(err as Error).message}`, false);
  }

  if (res.status >= 500) throw new OdooError(`Odoo returned HTTP ${res.status}`, false);
  if (res.status >= 400) throw new OdooError(`Odoo returned HTTP ${res.status}`, true);

  let body: { result?: unknown; error?: { message?: string; data?: { name?: string; message?: string } } };
  try {
    body = await res.json();
  } catch {
    // Almost always a proxy error page rather than Odoo itself.
    throw new OdooError("Odoo returned a non-JSON response", false);
  }

  if (body.error) {
    const name = body.error.data?.name ?? "";
    const message = body.error.data?.message ?? body.error.message ?? "unknown Odoo error";
    throw new OdooError(`${name || "OdooError"}: ${message}`, PERMANENT.has(name), name || undefined);
  }
  return body.result;
}


/**
 * Authenticates and returns the uid every `execute_kw` call needs.
 *
 * Uses the documented `common`/`authenticate` method (not the older `login`),
 * passing the API key in the password position exactly as the external-API
 * guide prescribes: "replace your password by the key. The login remains
 * in-use." The trailing `{}` is the required user-agent environment argument.
 *
 * Odoo answers a bad key with `false` and HTTP 200 rather than a fault, so this
 * is the only place a wrong credential is detectable — which is why every entry
 * point routes through here.
 */
const uidCache = new Map<string, number>();

async function authenticate(cfg: OdooConfig, timeoutMs: number): Promise<number> {
  // The uid is the integration user's stable id, not an expiring session token
  // (every execute_kw re-sends the API key), so it is safe to cache and skip a
  // login round-trip on every call. Big win when mirroring many records.
  const key = `${cfg.url}|${cfg.db}|${cfg.username}`;
  const cached = uidCache.get(key);
  if (cached) return cached;

  const uid = await rpc(
    cfg, "common", "authenticate", [cfg.db, cfg.username, cfg.apiKey, {}], timeoutMs
  );
  if (!uid || typeof uid !== "number") {
    throw new OdooError("Odoo rejected the integration credentials", true);
  }
  uidCache.set(key, uid);
  return uid;
}

/** One `execute_kw` call against a model. */
async function call(
  cfg: OdooConfig,
  uid: number,
  model: string,
  method: string,
  params: unknown[],
  timeoutMs: number
): Promise<unknown> {
  return rpc(cfg, "object", "execute_kw", [cfg.db, uid, cfg.apiKey, model, method, ...params], timeoutMs);
}

export interface CalendarEventInput {
  name: string;
  startIso: string;
  stopIso: string;
  location?: string;
  description?: string;
}

/** Creates a `calendar.event` and returns its id. */
export async function createCalendarEvent(
  cfg: OdooConfig,
  event: CalendarEventInput,
  timeoutMs = 8000
): Promise<number> {
  const uid = await authenticate(cfg, timeoutMs);

  const values: Record<string, unknown> = {
    name: event.name,
    start: toOdooDatetime(event.startIso),
    stop: toOdooDatetime(event.stopIso),
    allday: false,
  };
  if (event.location) values.location = event.location;
  if (event.description) values.description = event.description;

  const id = await rpc(
    cfg,
    "object",
    "execute_kw",
    [cfg.db, uid, cfg.apiKey, "calendar.event", "create", [values]],
    timeoutMs
  );
  return id as number;
}

/** Updates an event we previously created. Used when a viewing is rescheduled. */
export async function updateCalendarEvent(
  cfg: OdooConfig,
  eventId: number,
  event: Partial<CalendarEventInput>,
  timeoutMs = 8000
): Promise<void> {
  const uid = await authenticate(cfg, timeoutMs);

  const values: Record<string, unknown> = {};
  if (event.name) values.name = event.name;
  if (event.startIso) values.start = toOdooDatetime(event.startIso);
  if (event.stopIso) values.stop = toOdooDatetime(event.stopIso);
  if (event.location !== undefined) values.location = event.location;
  if (event.description !== undefined) values.description = event.description;

  await rpc(
    cfg,
    "object",
    "execute_kw",
    [cfg.db, uid, cfg.apiKey, "calendar.event", "write", [[eventId], values]],
    timeoutMs
  );
}


/* --------------------------------------------------------------- follow-ups */

/**
 * WHY `mail.activity` AND NOT `project.task`
 *
 * `mail.activity` is Odoo's native follow-up / reminder / to-do model, and on
 * this deployment it is the only fit: the `project` module is not installed, so
 * `project.task` does not exist. `mail.activity` ships with `mail`, which is
 * always present, and a PMS task IS a scheduled reminder — the "To-Do" activity
 * type models it exactly.
 *
 * Two facts about the model shape the code below:
 *
 * 1. An activity must hang off a record that inherits `mail.thread`. `res.users`
 *    does not; `res.partner` does. So all PMS-mirrored activities are anchored
 *    to a single carrier partner ("Al Manara PMS"), found or created once. They
 *    are a to-do list about the PMS, which is what they are.
 *
 * 2. Odoo's native "mark done" (`action_feedback`) UNLINKS the activity. That
 *    would break the guarantee the rest of this integration is built on — the
 *    same Odoo record kept for the whole life of the PMS record. So completion
 *    and cancellation are done the way viewings do them: by WRITING a marker to
 *    the same activity, never deleting it. The id a PMS task owns is the id it
 *    keeps, through completion and cancellation alike.
 */

/** The partner all PMS-mirrored activities are anchored to. */
export const ODOO_CARRIER_NAME = process.env.ODOO_CARRIER_NAME ?? "Al Manara PMS";

/** The activity type PMS follow-ups are filed under. */
export const ODOO_ACTIVITY_TYPE = process.env.ODOO_ACTIVITY_TYPE ?? "To-Do";

/**
 * How a PMS status is written onto the mirrored activity's summary.
 *
 * There is no state field on an activity, so status lives in the summary as a
 * prefix. Open tasks carry none, so they read naturally in Odoo's activity
 * inbox; completed and cancelled ones are marked and kept.
 */
export const ACTIVITY_MARK = {
  done: "✓ Completed",
  cancelled: "✗ Cancelled",
} as const;

export interface ActivityInput {
  summary: string;
  /** YYYY-MM-DD. Required by Odoo; a follow-up without a date is not a reminder. */
  deadline: string;
  note?: string;
}

/** Resolves and caches the ids the carrier lookups need, per config. */
interface Anchors {
  partnerModelId: number;
  carrierPartnerId: number;
  activityTypeId: number;
}
const anchorCache = new Map<string, Anchors>();

async function resolveAnchors(cfg: OdooConfig, uid: number, timeoutMs: number): Promise<Anchors> {
  const key = `${cfg.url}|${cfg.db}`;
  const cached = anchorCache.get(key);
  if (cached) return cached;

  const partnerModel = await call(
    cfg, uid, "ir.model", "search", [[[["model", "=", "res.partner"]]], { limit: 1 }], timeoutMs
  );
  const partnerModelId = (partnerModel as number[])[0];

  const typeSearch = await call(
    cfg, uid, "mail.activity.type", "search",
    [[[["name", "=", ODOO_ACTIVITY_TYPE]]], { limit: 1 }], timeoutMs
  );
  let activityTypeId = (typeSearch as number[])[0];
  // Fall back to any type rather than fail: a missing "To-Do" label must not
  // block the mirror on a differently-configured Odoo.
  if (activityTypeId == null) {
    const anyType = await call(cfg, uid, "mail.activity.type", "search", [[[]], { limit: 1 }], timeoutMs);
    activityTypeId = (anyType as number[])[0];
  }

  const found = await call(
    cfg, uid, "res.partner", "search",
    [[[["name", "=", ODOO_CARRIER_NAME]]], { limit: 1 }], timeoutMs
  );
  let carrierPartnerId = (found as number[])[0];
  if (carrierPartnerId == null) {
    // Search-then-create: two mirrors racing must not leave two carriers.
    carrierPartnerId = (await call(
      cfg, uid, "res.partner", "create",
      [[{ name: ODOO_CARRIER_NAME, comment: "Carrier for PMS-mirrored follow-up tasks. Do not delete." }]],
      timeoutMs
    )) as number;
  }

  const anchors = { partnerModelId, carrierPartnerId, activityTypeId };
  anchorCache.set(key, anchors);
  return anchors;
}

/** Creates a `mail.activity` on the carrier partner and returns its id. */
export async function createActivity(
  cfg: OdooConfig,
  activity: ActivityInput,
  timeoutMs = 8000
): Promise<number> {
  const uid = await authenticate(cfg, timeoutMs);
  const a = await resolveAnchors(cfg, uid, timeoutMs);

  const values: Record<string, unknown> = {
    activity_type_id: a.activityTypeId,
    res_model_id: a.partnerModelId,
    res_id: a.carrierPartnerId,
    user_id: uid,
    summary: activity.summary,
    date_deadline: activity.deadline,
  };
  if (activity.note) values.note = activity.note;

  const id = await call(cfg, uid, "mail.activity", "create", [[values]], timeoutMs);
  return id as number;
}

/**
 * Updates the activity a PMS task already owns.
 *
 * Every later change — reschedule, reassignment, completion, cancellation —
 * lands here against the id held in Postgres, so none can create a second row.
 */
export async function updateActivity(
  cfg: OdooConfig,
  activityId: number,
  activity: Partial<ActivityInput>,
  timeoutMs = 8000
): Promise<void> {
  const uid = await authenticate(cfg, timeoutMs);

  const values: Record<string, unknown> = {};
  if (activity.summary !== undefined) values.summary = activity.summary;
  if (activity.deadline !== undefined) values.date_deadline = activity.deadline;
  if (activity.note !== undefined) values.note = activity.note;
  if (Object.keys(values).length === 0) return;

  await call(cfg, uid, "mail.activity", "write", [[[activityId], values]], timeoutMs);
}

/** Reads an activity back. Used by the regression to prove what landed. */
export async function readActivity(
  cfg: OdooConfig,
  activityId: number,
  fields: string[] = ["summary", "date_deadline", "note", "res_name", "activity_type_id"],
  timeoutMs = 8000
): Promise<Record<string, unknown> | null> {
  const uid = await authenticate(cfg, timeoutMs);
  const rows = await call(cfg, uid, "mail.activity", "read", [[[activityId]], { fields }], timeoutMs);
  return Array.isArray(rows) && rows.length > 0 ? (rows[0] as Record<string, unknown>) : null;
}

/** How many activities carry this id — 0 once it is gone. Never raises. */
export async function activityExists(
  cfg: OdooConfig,
  activityId: number,
  timeoutMs = 8000
): Promise<boolean> {
  const uid = await authenticate(cfg, timeoutMs);
  const n = await call(cfg, uid, "mail.activity", "search_count", [[[["id", "=", activityId]]]], timeoutMs);
  return (n as number) > 0;
}

/* ---------------------------------------------------------------- payments */

/**
 * WHY DRAFT `account.payment`
 *
 * Cheques and payments are money, so they mirror to Odoo's money-in model,
 * `account.payment` (the `account` module is installed). Every record is
 * created as a DRAFT and never posted by the PMS: a draft carries the full
 * detail for an accountant to see and reconcile, but touches no ledger until a
 * person deliberately posts it. Postgres stays the source of truth; Odoo holds
 * a reviewable copy.
 *
 * Same lifecycle rule as the other mirrors: the id a cheque/payment owns is the
 * id it keeps. A status change (deposited → cleared → bounced) WRITES to the
 * same payment, so nothing is ever duplicated in the ledger.
 */

export interface PaymentInput {
  /** AED, as a decimal. */
  amount: number;
  /** YYYY-MM-DD. */
  date: string;
  /** Free-text detail carried in the payment's memo. */
  memo: string;
  /** Tenant name; a matching res.partner is found or created when given. */
  partnerName?: string;
}

interface PaymentAnchors {
  journalId: number;
  /** The journal's own account — used as the outstanding account so a posted
   *  payment settles straight to Paid rather than sitting in In Process. */
  bankAccountId: number | null;
}
const paymentAnchorCache = new Map<string, PaymentAnchors>();

/** Finds a bank (or cash) journal to file payments under. Cached per config. */
async function paymentAnchors(cfg: OdooConfig, uid: number, timeoutMs: number): Promise<PaymentAnchors> {
  const key = `${cfg.url}|${cfg.db}`;
  const cached = paymentAnchorCache.get(key);
  if (cached) return cached;

  const journals = await call(
    cfg, uid, "account.journal", "search_read",
    [[[["type", "in", ["bank", "cash"]]]], { fields: ["default_account_id"], limit: 1 }], timeoutMs
  ) as Array<{ id: number; default_account_id: [number, string] | false }>;
  if (!Array.isArray(journals) || journals.length === 0) {
    throw new OdooError("No bank or cash journal exists in Odoo", true);
  }
  const journalId = journals[0].id;
  const bankAccountId = journals[0].default_account_id ? journals[0].default_account_id[0] : null;

  const anchors = { journalId, bankAccountId };
  paymentAnchorCache.set(key, anchors);
  return anchors;
}

/** Finds or creates a customer partner by exact name. Cached per config+name. */
const partnerCache = new Map<string, number>();
async function findOrCreateCustomer(
  cfg: OdooConfig,
  uid: number,
  name: string,
  timeoutMs: number
): Promise<number | undefined> {
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  const key = `${cfg.url}|${cfg.db}|${trimmed}`;
  const cached = partnerCache.get(key);
  if (cached) return cached;

  const found = await call(
    cfg, uid, "res.partner", "search",
    [[[["name", "=", trimmed]]], { limit: 1 }], timeoutMs
  );
  let id = (found as number[])[0];
  if (id == null) {
    id = (await call(
      cfg, uid, "res.partner", "create",
      [[{ name: trimmed, customer_rank: 1 }]], timeoutMs
    )) as number;
  }
  partnerCache.set(key, id);
  return id;
}

/** Creates a draft inbound customer `account.payment` and returns its id. */
export async function createPayment(
  cfg: OdooConfig,
  payment: PaymentInput,
  timeoutMs = 8000
): Promise<number> {
  const uid = await authenticate(cfg, timeoutMs);
  const { journalId } = await paymentAnchors(cfg, uid, timeoutMs);
  const partnerId = payment.partnerName
    ? await findOrCreateCustomer(cfg, uid, payment.partnerName, timeoutMs)
    : undefined;

  const values: Record<string, unknown> = {
    payment_type: "inbound",
    partner_type: "customer",
    amount: payment.amount,
    date: payment.date,
    journal_id: journalId,
    memo: payment.memo,
  };
  if (partnerId) values.partner_id = partnerId;

  const id = await call(cfg, uid, "account.payment", "create", [[values]], timeoutMs);
  return id as number;
}

/**
 * Updates the payment a cheque/receipt already owns.
 *
 * Every later change lands here against the stored id, so a status update moves
 * the existing draft rather than raising a second one.
 */
export async function updatePayment(
  cfg: OdooConfig,
  paymentId: number,
  payment: Partial<Pick<PaymentInput, "amount" | "date" | "memo">>,
  timeoutMs = 8000
): Promise<void> {
  const uid = await authenticate(cfg, timeoutMs);
  const values: Record<string, unknown> = {};
  if (payment.amount !== undefined) values.amount = payment.amount;
  if (payment.date !== undefined) values.date = payment.date;
  if (payment.memo !== undefined) values.memo = payment.memo;
  if (Object.keys(values).length === 0) return;

  await call(cfg, uid, "account.payment", "write", [[[paymentId], values]], timeoutMs);
}

/** Reads a payment back. Used by the regression to prove what landed. */
export async function readPayment(
  cfg: OdooConfig,
  paymentId: number,
  fields: string[] = ["amount", "date", "memo", "state", "payment_type", "partner_id"],
  timeoutMs = 8000
): Promise<Record<string, unknown> | null> {
  const uid = await authenticate(cfg, timeoutMs);
  const rows = await call(cfg, uid, "account.payment", "read", [[[paymentId]], { fields }], timeoutMs);
  return Array.isArray(rows) && rows.length > 0 ? (rows[0] as Record<string, unknown>) : null;
}

/** How many payments carry this id — 0 once it is gone. Never raises. */
export async function paymentExists(
  cfg: OdooConfig,
  paymentId: number,
  timeoutMs = 8000
): Promise<boolean> {
  const uid = await authenticate(cfg, timeoutMs);
  const n = await call(cfg, uid, "account.payment", "search_count", [[[["id", "=", paymentId]]]], timeoutMs);
  return (n as number) > 0;
}

/**
 * Drives a payment's Odoo lifecycle state to match the PMS cheque status, so
 * the statusbar in Odoo reflects reality:
 *   pending, deposited → Draft   (not yet money in the bank)
 *   cleared            → Paid    (posted; the bank journal's method line points
 *                                 its outstanding account at the bank account,
 *                                 so posting settles straight to Paid)
 *   bounced, cancelled → Canceled
 *
 * Only cleared posts, so a merely-deposited cheque never shows as Paid. It
 * reads the current state first so it never re-posts or double-cancels.
 */
export async function syncPaymentState(
  cfg: OdooConfig,
  paymentId: number,
  chequeStatus: string,
  timeoutMs = 8000
): Promise<void> {
  const uid = await authenticate(cfg, timeoutMs);
  const rows = await call(cfg, uid, "account.payment", "read", [[[paymentId]], { fields: ["state"] }], timeoutMs);
  const current = Array.isArray(rows) && rows[0] ? String((rows[0] as Record<string, unknown>).state) : "draft";

  const act = (method: string) =>
    call(cfg, uid, "account.payment", method, [[[paymentId]]], timeoutMs);

  const cancelled = chequeStatus === "bounced" || chequeStatus === "cancelled" || chequeStatus === "replaced";
  const paid = chequeStatus === "cleared";

  if (cancelled) {
    if (current === "paid") await act("action_draft");
    if (current !== "canceled") await act("action_cancel");
  } else if (paid) {
    if (current === "paid") return;
    if (current === "in_process") await act("action_draft");
    // Point the outstanding account at the bank account so posting settles
    // straight to Paid. Written per payment, so it works whatever age the
    // record is (the journal default only binds at creation time).
    const { bankAccountId } = await paymentAnchors(cfg, uid, timeoutMs);
    if (bankAccountId) {
      await call(cfg, uid, "account.payment", "write",
        [[[paymentId], { outstanding_account_id: bankAccountId }]], timeoutMs);
    }
    await act("action_post"); // → Paid (green tick)
  }
  // pending and deposited stay Draft.
}
