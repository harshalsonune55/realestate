import "server-only";
import { q } from "./db";
import type {
  Approval, AuditEntry, Cheque, Contract, DB, DocumentItem, MaintenanceRequest,
  Payment, Property, Task, Tenant, Unit, User, Visit,
} from "./types";

/**
 * Postgres-backed replacement for the JSON store's `db()`.
 *
 * It returns the same `DB` shape the pages already consume, so the migration is
 * a one-line change at each call site (`db()` → `await loadDB()`) rather than a
 * rewrite of twenty screens. The filtering those pages do in memory still
 * works; pushing it down into SQL is a follow-up, worth doing per screen once
 * the cutover is proven.
 *
 * The one place that cannot stay in memory is the activity log: it grows
 * without bound, so it is capped here rather than loaded whole.
 */

const AUDIT_LIMIT = 500;

/* ---------------------------------------------------------------- helpers */

/** fils → AED. Postgres returns BIGINT as a string; Number() before dividing. */
const aed = (v: unknown): number => (v == null ? 0 : Number(v) / 100);

/** Optional money: preserved as undefined rather than coerced to 0. */
const aedOpt = (v: unknown): number | undefined =>
  v == null ? undefined : Number(v) / 100;

/** TIMESTAMPTZ → ISO string. */
const iso = (v: unknown): string =>
  v == null ? "" : v instanceof Date ? v.toISOString() : String(v);

const isoOpt = (v: unknown): string | undefined =>
  v == null ? undefined : iso(v);

/** Drops SQL NULLs so optional fields stay absent, matching the JSON store. */
const opt = <T,>(v: T | null | undefined): T | undefined => v ?? undefined;

type Row = Record<string, unknown>;

/* ------------------------------------------------------------------ users */

function toUser(r: Row): User {
  const status = r.status as User["status"];
  return {
    id: String(r.id),
    name: String(r.name),
    email: String(r.email),
    role: r.role as User["role"],
    title: String(r.title ?? ""),
    // `active` is derived, not stored: only an approved account may sign in.
    active: status === "active",
    status,
    phone: opt(r.phone as string | null),
    passwordHash: opt(r.password_hash as string | null),
    requestedRole: opt(r.requested_role as User["role"] | null),
    createdAt: isoOpt(r.created_at),
    approvedBy: opt(r.approved_by as string | null),
    approvedAt: isoOpt(r.approved_at),
    declinedBy: opt(r.declined_by as string | null),
    declinedAt: isoOpt(r.declined_at),
    declineReason: opt(r.decline_reason as string | null),
    lastLoginAt: isoOpt(r.last_login_at),
  };
}

/* ------------------------------------------------------------- properties */

const toProperty = (r: Row): Property => ({
  id: String(r.id),
  name: String(r.name),
  code: String(r.code),
  address: String(r.address ?? ""),
  city: String(r.city ?? ""),
  area: String(r.area ?? ""),
  owner: String(r.owner ?? ""),
  floors: Number(r.floors ?? 0),
  yearBuilt: Number(r.year_built ?? 0),
  managerId: String(r.manager_id ?? ""),
});

const toUnit = (r: Row): Unit => ({
  id: String(r.id),
  propertyId: String(r.property_id),
  unitNo: String(r.unit_no),
  floor: Number(r.floor ?? 0),
  type: r.type as Unit["type"],
  sizeSqft: Number(r.size_sqft ?? 0),
  bathrooms: Number(r.bathrooms ?? 0),
  marketRent: aed(r.market_rent),
  status: r.status as Unit["status"],
  parkingSlots: Number(r.parking_slots ?? 0),
});

const toTenant = (r: Row): Tenant => ({
  id: String(r.id),
  name: String(r.name),
  kind: (r.kind as Tenant["kind"]) ?? "individual",
  emiratesId: String(r.emirates_id ?? ""),
  passportNo: String(r.passport_no ?? ""),
  nationality: String(r.nationality ?? ""),
  phone: String(r.phone ?? ""),
  email: String(r.email ?? ""),
  tradeLicense: opt(r.trade_license as string | null),
  createdAt: iso(r.created_at),
});

/* -------------------------------------------------------------- contracts */

const toContract = (r: Row): Contract => ({
  id: String(r.id),
  ref: String(r.ref),
  unitId: String(r.unit_id),
  tenantId: String(r.tenant_id),
  startDate: String(r.start_date),
  endDate: String(r.end_date),
  annualRent: aed(r.annual_rent),
  chequeCount: Number(r.cheque_count ?? 0),
  securityDeposit: aed(r.security_deposit),
  commission: aed(r.commission),
  ejariNo: String(r.ejari_no ?? ""),
  status: r.status as Contract["status"],
  createdBy: String(r.created_by ?? ""),
  createdAt: iso(r.created_at),
  approvedBy: opt(r.approved_by as string | null),
  approvedAt: isoOpt(r.approved_at),
  documents: (r.documents as DocumentItem[] | null) ?? [],
  notes: opt(r.notes as string | null),
  renewedFromId: opt(r.renewed_from_id as string | null),
  terminationReason: opt(r.termination_reason as string | null),
});

const toCheque = (r: Row): Cheque => ({
  id: String(r.id),
  contractId: String(r.contract_id),
  seq: Number(r.seq ?? 0),
  ofTotal: Number(r.of_total ?? 0),
  chequeNo: String(r.cheque_no),
  bank: String(r.bank),
  amount: aed(r.amount),
  dueDate: String(r.due_date),
  status: r.status as Cheque["status"],
  depositedAt: isoOpt(r.deposited_at),
  depositedBy: opt(r.deposited_by as string | null),
  depositSlipNo: opt(r.deposit_slip_no as string | null),
  clearedAt: isoOpt(r.cleared_at),
  bouncedAt: isoOpt(r.bounced_at),
  bounceReason: opt(r.bounce_reason as string | null),
  replacedByChequeId: opt(r.replaced_by_cheque_id as string | null),
  heldReason: opt(r.held_reason as string | null),
  odooPaymentId: r.odoo_payment_id == null ? undefined : Number(r.odoo_payment_id),
  odooSyncedAt: isoOpt(r.odoo_synced_at),
  odooError: opt(r.odoo_error as string | null),
});

const toPayment = (r: Row): Payment => ({
  id: String(r.id),
  receiptNo: String(r.receipt_no),
  contractId: String(r.contract_id ?? ""),
  chequeId: opt(r.cheque_id as string | null),
  amount: aed(r.amount),
  method: r.method as Payment["method"],
  category: r.category as Payment["category"],
  receivedAt: iso(r.received_at),
  receivedBy: String(r.received_by ?? ""),
  reference: String(r.reference ?? ""),
  odooPaymentId: r.odoo_payment_id == null ? undefined : Number(r.odoo_payment_id),
  odooSyncedAt: isoOpt(r.odoo_synced_at),
  odooError: opt(r.odoo_error as string | null),
});

const toMaintenance = (r: Row): MaintenanceRequest => ({
  id: String(r.id),
  ref: String(r.ref),
  unitId: String(r.unit_id),
  tenantId: opt(r.tenant_id as string | null),
  category: String(r.category ?? ""),
  priority: r.priority as MaintenanceRequest["priority"],
  description: String(r.description ?? ""),
  status: r.status as MaintenanceRequest["status"],
  reportedAt: iso(r.reported_at),
  reportedBy: String(r.reported_by ?? ""),
  assignedTo: opt(r.assigned_to as string | null),
  vendor: opt(r.vendor as string | null),
  quoteAmount: aedOpt(r.quote_amount),
  completedAt: isoOpt(r.completed_at),
  slaDueAt: iso(r.sla_due_at),
  resolutionNotes: opt(r.resolution_notes as string | null),
});

const toApproval = (r: Row): Approval => ({
  id: String(r.id),
  ref: String(r.ref),
  type: r.type as Approval["type"],
  title: String(r.title),
  summary: String(r.summary ?? ""),
  entityType: String(r.entity_type ?? ""),
  entityId: String(r.entity_id ?? ""),
  amount: aedOpt(r.amount),
  requestedBy: String(r.requested_by ?? ""),
  requestedAt: iso(r.requested_at),
  decidedBy: opt(r.decided_by as string | null),
  decidedAt: isoOpt(r.decided_at),
  status: r.status as Approval["status"],
  decisionNote: opt(r.decision_note as string | null),
});

const toTask = (r: Row): Task => ({
  id: String(r.id),
  title: String(r.title),
  detail: String(r.detail ?? ""),
  assignedTo: String(r.assigned_to ?? ""),
  dueDate: String(r.due_date),
  status: r.status as Task["status"],
  priority: r.priority as Task["priority"],
  entityType: opt(r.entity_type as string | null),
  entityId: opt(r.entity_id as string | null),
  createdAt: iso(r.created_at),
  completedAt: isoOpt(r.completed_at),
  source: (r.source as Task["source"]) ?? "system",
  odooTaskId: r.odoo_task_id == null ? undefined : Number(r.odoo_task_id),
  odooSyncedAt: isoOpt(r.odoo_synced_at),
  odooError: opt(r.odoo_error as string | null),
});

const toAudit = (r: Row): AuditEntry => ({
  id: String(r.id),
  at: iso(r.at),
  actorId: String(r.actor_id ?? ""),
  actorName: String(r.actor_name ?? ""),
  action: String(r.action),
  entityType: String(r.entity_type ?? ""),
  entityId: String(r.entity_id ?? ""),
  summary: String(r.summary ?? ""),
  changes: opt(r.changes as AuditEntry["changes"]),
  ip: String(r.ip ?? ""),
});

/* ------------------------------------------------------------------- load */

/**
 * Loads the whole working set in one round of parallel queries.
 *
 * DATE columns are cast to text so `pg` hands back 'YYYY-MM-DD' rather than a
 * Date in the server's timezone — a contract starting 2026-01-01 in Dubai must
 * not read as 2025-12-31 because the box is on UTC.
 */
const toVisit = (r: Row): Visit => ({
  id: String(r.id),
  ref: String(r.ref),
  propertyId: String(r.property_id),
  unitId: String(r.unit_id),
  tenantId: opt(r.tenant_id as string | null),
  visitorName: String(r.visitor_name),
  visitorPhone: String(r.visitor_phone),
  visitorEmail: opt(r.visitor_email as string | null),
  startsAt: iso(r.starts_at),
  durationMins: Number(r.duration_mins ?? 30),
  status: r.status as Visit["status"],
  outcome: (r.outcome as Visit["outcome"]) ?? "",
  notes: String(r.notes ?? ""),
  bookedBy: String(r.booked_by ?? ""),
  createdAt: iso(r.created_at),
  // Null means the calendar mirror has not landed yet — the visits screen
  // counts these and offers a retry.
  odooEventId: r.odoo_event_id == null ? undefined : Number(r.odoo_event_id),
  odooSyncedAt: isoOpt(r.odoo_synced_at),
  odooError: opt(r.odoo_error as string | null),
});

export async function loadDB(opts: { auditLimit?: number } = {}): Promise<DB> {
  const auditLimit = opts.auditLimit ?? AUDIT_LIMIT;

  const [
    users, properties, units, tenants, contracts,
    cheques, payments, maintenance, approvals, tasks, visits, audit, counters,
  ] = await Promise.all([
    q("SELECT * FROM users ORDER BY name"),
    q("SELECT * FROM properties ORDER BY code"),
    q("SELECT * FROM units ORDER BY unit_no"),
    q("SELECT * FROM tenants ORDER BY name"),
    q(`SELECT *, start_date::text AS start_date, end_date::text AS end_date
         FROM contracts ORDER BY created_at DESC`),
    // ORDER BY is qualified because the aliased cast introduces a second
    // output column of the same name, which is ambiguous to sort on.
    q(`SELECT *, due_date::text AS due_date FROM cheques ORDER BY cheques.due_date`),
    q("SELECT * FROM payments ORDER BY received_at DESC"),
    q("SELECT * FROM maintenance_requests ORDER BY reported_at DESC"),
    q("SELECT * FROM approvals ORDER BY requested_at DESC"),
    q(`SELECT *, due_date::text AS due_date FROM tasks ORDER BY tasks.due_date`),
    q("SELECT * FROM visits ORDER BY starts_at"),
    q(`SELECT * FROM activity_log ORDER BY at DESC LIMIT $1`, [auditLimit]),
    q("SELECT name, value FROM counters"),
  ]);

  return {
    users: users.map(toUser),
    properties: properties.map(toProperty),
    units: units.map(toUnit),
    tenants: tenants.map(toTenant),
    contracts: contracts.map(toContract),
    cheques: cheques.map(toCheque),
    payments: payments.map(toPayment),
    maintenance: maintenance.map(toMaintenance),
    approvals: approvals.map(toApproval),
    tasks: tasks.map(toTask),
    visits: visits.map(toVisit),
    audit: audit.map(toAudit),
    counters: Object.fromEntries(
      counters.map((r) => [String(r.name), Number(r.value)])
    ),
  };
}

/* -------------------------------------------------------------- reference */

/**
 * Atomic human-facing reference number. The JSON store incremented a counter in
 * memory; two people creating a contract in the same second would both have got
 * CN-0042. `next_counter()` takes a row lock, so they cannot.
 */
export async function nextRef(counter: string, prefix: string, pad = 4): Promise<string> {
  const rows = await q<{ next_counter: string }>("SELECT next_counter($1)", [counter]);
  return `${prefix}${String(rows[0].next_counter).padStart(pad, "0")}`;
}

export { toUser, toContract, toCheque, toUnit, toProperty, toTenant, toTask, toApproval, toPayment, toMaintenance, toAudit };
