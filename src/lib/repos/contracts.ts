import "server-only";
import { q1, toFils, tx } from "../db";
import { backend } from "../data";
import { toContract, toUnit } from "../repo";
import { db as jsonDb, nextId as nextJsonId, write as jsonWrite } from "../store";
import { addDays } from "../utils";
import type { Cheque, Contract, DocumentItem, Tenant, Unit } from "../types";
import { ConflictError, assigneeFor, insertApproval, insertTask, nextRefIn } from "./shared";

/**
 * Creating a tenancy.
 *
 * A contract is never created on its own: it comes with the tenant record, the
 * cheque schedule, a hold on the unit and the approval that has to clear before
 * any of it becomes real. All of that is one transaction. A contract saved
 * without its cheques is a tenancy nobody will collect rent on, and a unit left
 * vacant after a contract was accepted is a unit two people can lease.
 */

export async function findContract(id: string): Promise<Contract | null> {
  if (backend() === "json") return jsonDb().contracts.find((c) => c.id === id) ?? null;
  const row = await q1(
    `SELECT *, start_date::text AS start_date, end_date::text AS end_date
       FROM contracts WHERE id = $1`,
    [id]
  );
  return row ? toContract(row) : null;
}

export async function findUnit(id: string): Promise<Unit | null> {
  if (backend() === "json") return jsonDb().units.find((u) => u.id === id) ?? null;
  const row = await q1("SELECT * FROM units WHERE id = $1", [id]);
  return row ? toUnit(row) : null;
}

export interface ChequeLine {
  chequeNo: string;
  bank: string;
  /** AED. Converted to fils on the way in. */
  amount: number;
  dueDate: string;
}

export interface DocSpec {
  key: string;
  label: string;
  provided: boolean;
}

export interface NewTenant {
  name: string;
  kind: Tenant["kind"];
  emiratesId: string;
  passportNo: string;
  nationality: string;
  phone: string;
  email: string;
  tradeLicense?: string;
}

export interface CreateContractInput {
  unitId: string;
  /** Exactly one of these is set. */
  existingTenantId?: string;
  newTenant?: NewTenant;
  startDate: string;
  endDate: string;
  termMonths: number;
  annualRent: number;
  securityDeposit: number;
  commission: number;
  ejariNo: string;
  notes?: string;
  cheques: ChequeLine[];
  docs: DocSpec[];
  createdBy: string;
  createdByName: string;
  now: string;
}

export interface CreatedContract {
  id: string;
  ref: string;
}

export async function createContract(input: CreateContractInput): Promise<CreatedContract> {
  if (backend() === "json") return createContractJson(input);

  return tx(async (c) => {
    /* 1. tenant record */
    let tenantId = input.existingTenantId;
    if (input.newTenant) {
      const t = input.newTenant;
      const { rows } = await c.query(
        `INSERT INTO tenants
           (name, kind, emirates_id, passport_no, nationality, phone, email,
            trade_license, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [
          t.name, t.kind, t.emiratesId, t.passportNo, t.nationality, t.phone,
          t.email, t.tradeLicense ?? null, input.now,
        ]
      );
      tenantId = String(rows[0].id);
    }
    if (!tenantId) throw new ConflictError("A contract needs a tenant.");

    /* 2. hold the unit — and refuse if somebody else already holds it */
    const held = await c.query(
      "UPDATE units SET status = 'reserved' WHERE id = $1 AND status = 'vacant' RETURNING unit_no, property_id",
      [input.unitId]
    );
    if (held.rowCount === 0) throw new ConflictError("That unit is no longer vacant.");
    const unitNo = String(held.rows[0].unit_no);

    /* 3. contract, created pending approval — it never goes live on its own */
    const ref = await nextRefIn(
      c,
      "contract",
      (n) => `CTR-${input.startDate.slice(0, 4)}-${String(n).padStart(4, "0")}`
    );
    const { rows: cRows } = await c.query(
      `INSERT INTO contracts
         (ref, unit_id, tenant_id, start_date, end_date, annual_rent, cheque_count,
          security_deposit, commission, ejari_no, status, created_by, created_at,
          documents, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending_approval',$11,$12,$13,$14)
       RETURNING id`,
      [
        ref, input.unitId, tenantId, input.startDate, input.endDate,
        toFils(input.annualRent), input.cheques.length, toFils(input.securityDeposit),
        toFils(input.commission), input.ejariNo, input.createdBy, input.now,
        JSON.stringify(documentsFor(input.docs, ref)), input.notes || null,
      ]
    );
    const contractId = String(cRows[0].id);

    /* 4. cheque schedule */
    for (const [i, line] of input.cheques.entries()) {
      await c.query(
        `INSERT INTO cheques
           (contract_id, seq, of_total, cheque_no, bank, amount, due_date, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')`,
        [
          contractId, i + 1, input.cheques.length, line.chequeNo, line.bank,
          toFils(line.amount), line.dueDate,
        ]
      );
    }

    /* 5. raise the approval */
    const propertyName = await propertyNameFor(c, String(held.rows[0].property_id));
    const tenantName = await tenantNameFor(c, tenantId);
    const approvalRef = await nextRefIn(c, "approval", (n) => `APR-${String(n).padStart(4, "0")}`);
    const approvalId = await insertApproval(c, {
      ref: approvalRef,
      type: "new_contract",
      title: `New tenancy — ${unitNo}, ${propertyName}`,
      summary: `${tenantName} · ${input.termMonths} months · AED ${input.annualRent.toLocaleString("en-US")} · ${input.cheques.length} cheques`,
      entityType: "contract",
      entityId: contractId,
      amount: toFils(input.annualRent),
      requestedBy: input.createdBy,
      requestedAt: input.now,
    });

    /* 6. and put it on a manager's list */
    await insertTask(c, {
      title: `Review approval ${approvalRef}`,
      detail: `New tenancy for ${unitNo} submitted by ${input.createdByName}`,
      assignedTo: await assigneeFor(c, ["manager", "admin"]),
      dueDate: addDays(input.now.slice(0, 10), 2),
      status: "open",
      priority: "high",
      entityType: "approval",
      entityId: approvalId,
      createdAt: input.now,
    });

    return { id: contractId, ref };
  });
}

/* ------------------------------------------------------------------ shared */

const documentsFor = (docs: DocSpec[], stem: string): DocumentItem[] =>
  docs.map((d) => ({ key: d.key, label: d.label, provided: d.provided, ref: `${d.key}-${stem}.pdf` }));

async function propertyNameFor(
  c: { query: (t: string, p: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  propertyId: string
): Promise<string> {
  const { rows } = await c.query("SELECT name FROM properties WHERE id = $1", [propertyId]);
  return rows[0] ? String(rows[0].name) : "";
}

async function tenantNameFor(
  c: { query: (t: string, p: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  tenantId: string
): Promise<string> {
  const { rows } = await c.query("SELECT name FROM tenants WHERE id = $1", [tenantId]);
  return rows[0] ? String(rows[0].name) : "";
}

/* -------------------------------------------------------------- json store */

function createContractJson(input: CreateContractInput): CreatedContract {
  const contractId = nextJsonId("contract", "C");
  const ref = `CTR-${input.startDate.slice(0, 4)}-${contractId.replace("C", "").padStart(4, "0")}`;

  jsonWrite((store) => {
    let tenantId = input.existingTenantId;
    if (input.newTenant) {
      const t = input.newTenant;
      const tenant: Tenant = {
        id: nextJsonId("tenant", "T"),
        name: t.name,
        kind: t.kind,
        emiratesId: t.emiratesId,
        passportNo: t.passportNo,
        nationality: t.nationality,
        phone: t.phone,
        email: t.email,
        tradeLicense: t.tradeLicense,
        createdAt: input.now,
      };
      store.tenants.push(tenant);
      tenantId = tenant.id;
    }

    const contract: Contract = {
      id: contractId,
      ref,
      unitId: input.unitId,
      tenantId: tenantId!,
      startDate: input.startDate,
      endDate: input.endDate,
      annualRent: input.annualRent,
      chequeCount: input.cheques.length,
      securityDeposit: input.securityDeposit,
      commission: input.commission,
      ejariNo: input.ejariNo,
      status: "pending_approval",
      createdBy: input.createdBy,
      createdAt: input.now,
      documents: documentsFor(input.docs, contractId),
      notes: input.notes || undefined,
    };
    store.contracts.push(contract);

    input.cheques.forEach((line, i) => {
      const cheque: Cheque = {
        id: nextJsonId("cheque", "CH"),
        contractId,
        seq: i + 1,
        ofTotal: input.cheques.length,
        chequeNo: line.chequeNo,
        bank: line.bank,
        amount: line.amount,
        dueDate: line.dueDate,
        status: "pending",
      };
      store.cheques.push(cheque);
    });

    const u = store.units.find((x) => x.id === input.unitId)!;
    u.status = "reserved";

    const approvalId = nextJsonId("approval", "AP");
    const approvalRef = `APR-${approvalId.replace("AP", "").padStart(4, "0")}`;
    const property = store.properties.find((p) => p.id === u.propertyId);
    const tenantName = store.tenants.find((t) => t.id === tenantId)?.name ?? "";

    store.approvals.push({
      id: approvalId,
      ref: approvalRef,
      type: "new_contract",
      title: `New tenancy — ${u.unitNo}, ${property?.name ?? ""}`,
      summary: `${tenantName} · ${input.termMonths} months · AED ${input.annualRent.toLocaleString("en-US")} · ${input.cheques.length} cheques`,
      entityType: "contract",
      entityId: contractId,
      amount: input.annualRent,
      requestedBy: input.createdBy,
      requestedAt: input.now,
      status: "pending",
    });

    store.tasks.push({
      id: nextJsonId("task", "TK"),
      title: `Review approval ${approvalRef}`,
      detail: `New tenancy for ${u.unitNo} submitted by ${input.createdByName}`,
      assignedTo: "U2",
      dueDate: addDays(input.now.slice(0, 10), 2),
      status: "open",
      priority: "high",
      entityType: "approval",
      entityId: approvalId,
      createdAt: input.now,
      source: "system",
    });
  });

  return { id: contractId, ref };
}
