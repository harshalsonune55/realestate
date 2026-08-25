import "server-only";
import { randomUUID } from "node:crypto";
import { q, q1 } from "./db";
import { loadDB } from "./repo";
import { db as jsonDb, nextId as nextJsonId, write as jsonWrite } from "./store";
import type { AuditEntry, DB, Visit } from "./types";

/**
 * The seam between application code and whatever is actually storing the data.
 *
 * The repository is chosen once, from configuration, and everything above this
 * module is written against the interface rather than against Postgres or the
 * JSON file:
 *
 *     server action / page
 *              ↓
 *        this module
 *         ↓         ↓
 *     Postgres     JSON store
 *   (production)  (demo, local, tests)
 *
 * `DATABASE_URL` decides. Setting it is what makes an install a real one; with
 * it unset the app runs entirely off the generated demo portfolio, which is how
 * a new engineer gets a populated system without provisioning anything.
 *
 * With it set there is no second store: `src/lib/store.ts` throws rather than
 * serve a read or absorb a write, so a path that has not been migrated fails
 * loudly instead of quietly saving a business record to a file nobody reads.
 *
 * WHAT IS MUTABLE IN PRODUCTION
 * Every entity a user can change goes through a repository in `src/lib/repos`,
 * and each of those writes to Postgres under `backend() === "postgres"`:
 *
 *   users            production mutable  signup, approve, decline, login stamp
 *   contracts        production mutable  created by the wizard and by renewals
 *   tenants          production mutable  created with a contract; never edited
 *   units            production mutable  status only — vacant/reserved/occupied
 *   cheques          production mutable  deposit, clear, bounce, cancel
 *   payments         production mutable  written when a cheque clears
 *   maintenance      production mutable  raised and advanced through its states
 *   tasks            production mutable  raised, reassigned, closed
 *   approvals        production mutable  raised and decided
 *   visits           production mutable  booked, rescheduled, cancelled
 *   activity_log     production mutable  append-only
 *
 *   properties       seed/demo only      no code path creates or edits one;
 *                                        buildings are loaded by db/seed.ts and
 *                                        the app only ever reads them. Adding a
 *                                        property is an admin feature that does
 *                                        not exist yet — when it does, it needs
 *                                        a repository like everything above.
 */

export type Backend = "postgres" | "json";

export function backend(): Backend {
  return process.env.DATABASE_URL ? "postgres" : "json";
}

/** True when losing a write would mean losing a real business record. */
export function isProductionData(): boolean {
  return backend() === "postgres";
}

/** The whole dataset, from whichever repository is configured. */
export async function loadData(opts: { auditLimit?: number } = {}): Promise<DB> {
  return backend() === "postgres" ? loadDB(opts) : jsonDb();
}

/* ------------------------------------------------------------------ visits */

/**
 * Visit ids are UUIDs in both backends.
 *
 * The JSON store's other entities use short ids ("U1", "P1-U5") and Postgres
 * uses UUIDs, which is exactly the mismatch that makes a half-finished cutover
 * painful. Visits are new, so they start on the shape Postgres needs and the
 * id means the same thing whichever repository is behind it.
 */
export function newVisitId(): string {
  return randomUUID();
}

interface VisitRow {
  id: string;
  ref: string;
  property_id: string;
  unit_id: string;
  tenant_id: string | null;
  visitor_name: string;
  visitor_phone: string;
  visitor_email: string | null;
  starts_at: Date | string;
  duration_mins: number;
  status: string;
  outcome: string;
  notes: string;
  booked_by: string | null;
  created_at: Date | string;
  odoo_event_id: string | number | null;
  odoo_synced_at: Date | string | null;
  odoo_error: string | null;
}

const iso = (v: Date | string): string =>
  v instanceof Date ? v.toISOString() : new Date(v).toISOString();

function rowToVisit(r: VisitRow): Visit {
  return {
    id: String(r.id),
    ref: String(r.ref),
    propertyId: String(r.property_id),
    unitId: String(r.unit_id),
    tenantId: r.tenant_id ?? undefined,
    visitorName: r.visitor_name,
    visitorPhone: r.visitor_phone,
    visitorEmail: r.visitor_email ?? undefined,
    startsAt: iso(r.starts_at),
    durationMins: Number(r.duration_mins),
    status: r.status as Visit["status"],
    outcome: (r.outcome as Visit["outcome"]) ?? "",
    notes: r.notes ?? "",
    bookedBy: r.booked_by ?? "",
    createdAt: iso(r.created_at),
    odooEventId: r.odoo_event_id == null ? undefined : Number(r.odoo_event_id),
    odooSyncedAt: r.odoo_synced_at ? iso(r.odoo_synced_at) : undefined,
    odooError: r.odoo_error ?? undefined,
  };
}

export async function listVisits(): Promise<Visit[]> {
  if (backend() === "json") return jsonDb().visits ?? [];
  const rows = await q<VisitRow>("SELECT * FROM visits ORDER BY starts_at");
  return rows.map(rowToVisit);
}

export async function getVisit(id: string): Promise<Visit | null> {
  if (backend() === "json") {
    return (jsonDb().visits ?? []).find((v) => v.id === id) ?? null;
  }
  const row = await q1<VisitRow>("SELECT * FROM visits WHERE id = $1", [id]);
  return row ? rowToVisit(row) : null;
}

/** The next `VW-` reference, counted from whichever repository is live. */
export async function nextVisitRef(): Promise<string> {
  const count =
    backend() === "json"
      ? (jsonDb().visits ?? []).length
      : Number((await q1<{ n: string }>("SELECT count(*)::text AS n FROM visits"))?.n ?? 0);
  return `VW-${String(3000 + count + 1).padStart(4, "0")}`;
}

export async function createVisit(visit: Visit): Promise<void> {
  if (backend() === "json") {
    jsonWrite((store) => {
      store.visits ??= [];
      store.visits.push(visit);
    });
    return;
  }

  // No try/catch: a failed insert must surface as a 500, not as a booking the
  // agent believes was saved. Losing a real appointment silently is worse than
  // an error the person can see and act on.
  await q(
    `INSERT INTO visits (
       id, ref, property_id, unit_id, tenant_id, visitor_name, visitor_phone,
       visitor_email, starts_at, duration_mins, status, outcome, notes,
       booked_by, created_at, odoo_event_id, odoo_synced_at, odoo_error
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
    [
      visit.id, visit.ref, visit.propertyId, visit.unitId, visit.tenantId ?? null,
      visit.visitorName, visit.visitorPhone, visit.visitorEmail ?? null,
      visit.startsAt, visit.durationMins, visit.status, visit.outcome, visit.notes,
      visit.bookedBy || null, visit.createdAt,
      visit.odooEventId ?? null, visit.odooSyncedAt ?? null, visit.odooError ?? null,
    ]
  );
}

/** Fields a caller is allowed to change after booking. */
export type VisitPatch = Partial<
  Pick<
    Visit,
    | "propertyId" | "unitId" | "visitorName" | "visitorPhone" | "visitorEmail"
    | "startsAt" | "durationMins" | "status" | "outcome" | "notes"
    | "odooEventId" | "odooSyncedAt" | "odooError"
  >
>;

const COLUMN: Record<keyof VisitPatch, string> = {
  propertyId: "property_id",
  unitId: "unit_id",
  visitorName: "visitor_name",
  visitorPhone: "visitor_phone",
  visitorEmail: "visitor_email",
  startsAt: "starts_at",
  durationMins: "duration_mins",
  status: "status",
  outcome: "outcome",
  notes: "notes",
  odooEventId: "odoo_event_id",
  odooSyncedAt: "odoo_synced_at",
  odooError: "odoo_error",
};

/**
 * Applies a patch to one visit.
 *
 * `undefined` in the patch means "leave alone"; clearing a value is done by
 * passing `null` through the nullable fields. That distinction is what lets the
 * Odoo sync clear a stale error without also wiping the event id.
 */
export async function updateVisit(id: string, patch: VisitPatch): Promise<void> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;

  if (backend() === "json") {
    jsonWrite((store) => {
      const row = store.visits?.find((v) => v.id === id);
      if (!row) return;
      Object.assign(row, patch);
      // `Object.assign` writes `null` through; the domain type uses `undefined`.
      for (const [k, v] of entries) {
        if (v === null) delete (row as unknown as Record<string, unknown>)[k];
      }
    });
    return;
  }

  const sets = entries.map(([k], i) => `${COLUMN[k as keyof VisitPatch]} = $${i + 2}`);
  const values = entries.map(([, v]) => v ?? null);
  await q(`UPDATE visits SET ${sets.join(", ")} WHERE id = $1`, [id, ...values]);
}

/* ------------------------------------------------------------------- audit */

/**
 * Appends one audit row.
 *
 * Deliberately not wrapped in a try/catch. An audit trail that quietly stops
 * recording is worse than one that fails loudly: the whole point of the log is
 * that its absence is evidence. If the insert fails, the action fails with it.
 */
export async function appendAudit(entry: Omit<AuditEntry, "id">): Promise<void> {
  if (backend() === "json") {
    jsonWrite((store) => {
      store.audit.unshift({ id: nextJsonId("audit", "AU"), ...entry });
      // A file that grows without bound eventually stops being loadable. The
      // Postgres path has no such limit — `repo.ts` caps the *read* instead.
      if (store.audit.length > 4000) store.audit.length = 4000;
    });
    return;
  }

  await q(
    `INSERT INTO activity_log
       (actor_id, actor_name, action, entity_type, entity_id, summary, changes, ip, at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      entry.actorId || null,
      entry.actorName,
      entry.action,
      entry.entityType || null,
      entry.entityId || null,
      entry.summary,
      entry.changes ? JSON.stringify(entry.changes) : null,
      entry.ip || null,
      entry.at,
    ]
  );
}
