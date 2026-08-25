/**
 * Imports the generated demo portfolio into Postgres.
 *
 *   npx tsx db/seed.ts            # only if the database is empty
 *   npx tsx db/seed.ts --force    # wipe and reload
 *
 * The generator produces short string ids ("U1", "P1-U5"); Postgres uses UUIDs.
 * Every insert returns its new id into a map so foreign keys can be resolved.
 */

import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { generate } from "../src/lib/seed";
import { hashPassword } from "../src/lib/password";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgresql://localhost:5432/almanara_pms",
});

const AED = (n: number) => Math.round(n * 100); // → fils

/** Everyone gets the same password in the demo; production signups set their own. */
const DEMO_PASSWORD = "AlManara2026";

async function main() {
  const force = process.argv.includes("--force");
  const { rows } = await pool.query<{ n: string }>("SELECT count(*)::text AS n FROM users");

  if (Number(rows[0].n) > 0 && !force) {
    console.log(`users table already has ${rows[0].n} rows — pass --force to wipe and reload.`);
    await pool.end();
    return;
  }

  const d = generate();
  const id = new Map<string, string>(); // seed id → uuid
  const uuid = (key: string) => {
    if (!id.has(key)) id.set(key, randomUUID());
    return id.get(key)!;
  };

  // Actor columns reference users, but the generator puts a *tenant* id in
  // maintenance.reportedBy (the tenant phoned it in). Minting a uuid for that
  // would create a dangling foreign key, so unknown actors resolve to null and
  // the tenant is recorded in tenant_id instead.
  const userIds = new Set(d.users.map((u) => u.id));
  const userRef = (key: string | undefined | null) =>
    key && userIds.has(key) ? uuid(key) : null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (force) {
      await client.query(`TRUNCATE
        notifications, activity_log, check_ins, expenses, payments, cheques,
        approvals, tasks, maintenance_requests, contracts, tenants, units,
        properties, sessions, users RESTART IDENTITY CASCADE`);
    }

    // ------------------------------------------------------------- users --
    const pw = await hashPassword(DEMO_PASSWORD);
    for (const u of d.users) {
      await client.query(
        `INSERT INTO users (id, name, email, title, role, status, password_hash, created_at)
         VALUES ($1,$2,$3,$4,$5::user_role,'active',$6, now())`,
        [uuid(u.id), u.name, u.email, u.title, u.role, pw]
      );
    }

    // -------------------------------------------------------- properties --
    for (const p of d.properties) {
      await client.query(
        `INSERT INTO properties (id, name, code, address, city, area, owner, floors, year_built)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [uuid(p.id), p.name, p.code, p.address, p.city, p.area, p.owner, p.floors, p.yearBuilt]
      );
    }

    for (const u of d.units) {
      await client.query(
        `INSERT INTO units (id, property_id, unit_no, floor, type, size_sqft, bathrooms,
                            parking_slots, market_rent, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::unit_status)`,
        [uuid(u.id), uuid(u.propertyId), u.unitNo, u.floor, u.type, u.sizeSqft,
         u.bathrooms, u.parkingSlots, AED(u.marketRent), u.status]
      );
    }

    // ----------------------------------------------------------- tenants --
    for (const t of d.tenants) {
      await client.query(
        `INSERT INTO tenants (id, name, kind, emirates_id, passport_no, nationality,
                              phone, email, trade_license, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [uuid(t.id), t.name, t.kind, t.emiratesId, t.passportNo, t.nationality,
         t.phone, t.email, t.tradeLicense ?? null, t.createdAt]
      );
    }

    // --------------------------------------------------------- contracts --
    for (const c of d.contracts) {
      await client.query(
        `INSERT INTO contracts (id, ref, unit_id, tenant_id, start_date, end_date, annual_rent,
                                cheque_count, security_deposit, commission, ejari_no,
                                status, created_by, created_at, approved_by, approved_at, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::contract_status,$13,$14,$15,$16,$17)`,
        [uuid(c.id), c.ref, uuid(c.unitId), uuid(c.tenantId), c.startDate, c.endDate,
         AED(c.annualRent), c.chequeCount, AED(c.securityDeposit), AED(c.commission),
         c.ejariNo, c.status, userRef(c.createdBy), c.createdAt,
         userRef(c.approvedBy), c.approvedAt ?? null, c.notes ?? null]
      );
    }

    // ----------------------------------------------------------- cheques --
    // The generator can repeat a (bank, cheque_no) pair; the schema forbids it,
    // so collisions are renumbered rather than dropped — losing a cheque would
    // silently change the rent roll.
    const seen = new Set<string>();
    for (const ch of d.cheques) {
      let no = ch.chequeNo;
      while (seen.has(`${ch.bank}:${no}`)) no = String(Number(no) + 1).padStart(no.length, "0");
      seen.add(`${ch.bank}:${no}`);

      await client.query(
        `INSERT INTO cheques (id, contract_id, seq, of_total, cheque_no, bank, amount, due_date,
                              status, deposited_at, deposited_by, deposit_slip_no,
                              cleared_at, bounced_at, bounce_reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::cheque_status,$10,$11,$12,$13,$14,$15)`,
        [uuid(ch.id), uuid(ch.contractId), ch.seq, ch.ofTotal, no, ch.bank, AED(ch.amount),
         ch.dueDate, ch.status, ch.depositedAt ?? null,
         userRef(ch.depositedBy), ch.depositSlipNo ?? null,
         ch.clearedAt ?? null, ch.bouncedAt ?? null, ch.bounceReason ?? null]
      );
    }

    // ---------------------------------------------------------- payments --
    for (const p of d.payments) {
      const contract = d.contracts.find((c) => c.id === p.contractId);
      await client.query(
        `INSERT INTO payments (id, receipt_no, contract_id, unit_id, cheque_id, amount,
                               method, category, received_at, received_by, reference)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [uuid(p.id), p.receiptNo, uuid(p.contractId),
         contract ? uuid(contract.unitId) : null,
         p.chequeId ? uuid(p.chequeId) : null, AED(p.amount), p.method, p.category,
         p.receivedAt, userRef(p.receivedBy), p.reference]
      );
    }

    // ------------------------------------------------------- maintenance --
    for (const m of d.maintenance) {
      await client.query(
        `INSERT INTO maintenance_requests (id, ref, unit_id, tenant_id, category, priority,
                                           description, status, reported_at, reported_by,
                                           assigned_to, vendor, quote_amount, sla_due_at,
                                           completed_at, resolution_notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [uuid(m.id), m.ref, uuid(m.unitId), m.tenantId ? uuid(m.tenantId) : null,
         m.category, m.priority, m.description, m.status, m.reportedAt,
         userRef(m.reportedBy), userRef(m.assignedTo),
         m.vendor ?? null, m.quoteAmount != null ? AED(m.quoteAmount) : null,
         m.slaDueAt, m.completedAt ?? null, m.resolutionNotes ?? null]
      );
    }

    // ---------------------------------------- expenses derived from works --
    // The JSON store had no expenses. Completed maintenance with a quotation is
    // real money out, so it seeds the expense ledger and makes net profit
    // meaningful from day one.
    let expenseNo = 1;
    for (const m of d.maintenance) {
      if (!m.quoteAmount) continue;
      const unit = d.units.find((u) => u.id === m.unitId);
      await client.query(
        `INSERT INTO expenses (id, ref, unit_id, property_id, category, description,
                               amount, vendor, incurred_on, recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [randomUUID(), `EXP-${String(expenseNo++).padStart(4, "0")}`, uuid(m.unitId),
         unit ? uuid(unit.propertyId) : null, m.category,
         m.description.slice(0, 180), AED(m.quoteAmount), m.vendor ?? null,
         (m.completedAt ?? m.reportedAt).slice(0, 10),
         userRef(m.assignedTo)]
      );
    }

    // ------------------------------------------------- tasks & approvals --
    for (const t of d.tasks) {
      await client.query(
        `INSERT INTO tasks (id, title, detail, assigned_to, due_date, status, priority,
                            entity_type, source, created_at, completed_at)
         VALUES ($1,$2,$3,$4,$5,$6::task_status,$7,$8,$9,$10,$11)`,
        [uuid(t.id), t.title, t.detail, userRef(t.assignedTo),
         t.dueDate, t.status, t.priority, t.entityType ?? null, t.source,
         t.createdAt, t.completedAt ?? null]
      );
    }

    for (const a of d.approvals) {
      await client.query(
        `INSERT INTO approvals (id, ref, type, title, summary, entity_type, amount,
                                requested_by, requested_at, decided_by, decided_at,
                                status, decision_note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::approval_status,$13)`,
        [uuid(a.id), a.ref, a.type, a.title, a.summary, a.entityType,
         a.amount != null ? AED(a.amount) : null,
         userRef(a.requestedBy), a.requestedAt,
         userRef(a.decidedBy), a.decidedAt ?? null,
         a.status, a.decisionNote ?? null]
      );
    }

    // ------------------------------------------------------ activity log --
    for (const e of d.audit) {
      await client.query(
        `INSERT INTO activity_log (id, actor_id, actor_name, action, entity_type,
                                   summary, changes, ip, at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [uuid(e.id), userRef(e.actorId), e.actorName, e.action,
         e.entityType, e.summary, e.changes ? JSON.stringify(e.changes) : null, e.ip, e.at]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const counts = await pool.query<{ t: string; n: string }>(`
    SELECT 'users' t, count(*)::text n FROM users
    UNION ALL SELECT 'properties', count(*)::text FROM properties
    UNION ALL SELECT 'units', count(*)::text FROM units
    UNION ALL SELECT 'tenants', count(*)::text FROM tenants
    UNION ALL SELECT 'contracts', count(*)::text FROM contracts
    UNION ALL SELECT 'cheques', count(*)::text FROM cheques
    UNION ALL SELECT 'payments', count(*)::text FROM payments
    UNION ALL SELECT 'expenses', count(*)::text FROM expenses
    UNION ALL SELECT 'maintenance', count(*)::text FROM maintenance_requests
    UNION ALL SELECT 'tasks', count(*)::text FROM tasks
    UNION ALL SELECT 'approvals', count(*)::text FROM approvals
    ORDER BY 1`);

  for (const r of counts.rows) console.log(`  ${r.t.padEnd(12)} ${r.n}`);

  // Push the reference counters past everything just imported, or the first
  // contract created in the UI would try to reuse a ref that already exists.
  // Requires 002_alignment.sql; skipped with a warning if it has not been run.
  try {
    await pool.query("SELECT sync_counters()");
    console.log("\nreference counters synced");
  } catch {
    console.warn("\nsync_counters() missing — apply db/002_alignment.sql");
  }

  console.log(`\nEvery demo account signs in with: ${DEMO_PASSWORD}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
