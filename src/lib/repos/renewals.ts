import "server-only";
import { q1, toFils, tx } from "../db";
import { backend } from "../data";
import { db as jsonDb, nextId as nextJsonId, write as jsonWrite , pickAssigneeJson } from "../store";
import { addDays, today } from "../utils";
import type { Cheque, Contract } from "../types";
import type { ChequeLine, CreatedContract, DocSpec } from "./contracts";
import { assigneeFor, closeTasksFor, insertApproval, insertTask, nextRefIn } from "./shared";

/**
 * The two ends of a tenancy: renewing it, or letting it run out.
 *
 * A renewal creates a *second* contract linked back to the first rather than
 * editing the original. The old tenancy stays exactly as it was signed, which
 * is what makes the rent history on the renewals screen trustworthy, and the
 * new one goes through the same approval as any other.
 */

/** Everything the renewal screens need to describe a tenancy in one query. */
export interface RenewalContext {
  unitId: string;
  unitNo: string;
  propertyName: string;
  tenantId: string;
  tenantName: string;
}

export async function renewalContext(contractId: string): Promise<RenewalContext | null> {
  if (backend() === "json") {
    const d = jsonDb();
    const contract = d.contracts.find((c) => c.id === contractId);
    if (!contract) return null;
    const unit = d.units.find((u) => u.id === contract.unitId);
    const tenant = d.tenants.find((t) => t.id === contract.tenantId);
    if (!unit || !tenant) return null;
    return {
      unitId: unit.id,
      unitNo: unit.unitNo,
      propertyName: d.properties.find((p) => p.id === unit.propertyId)?.name ?? "",
      tenantId: tenant.id,
      tenantName: tenant.name,
    };
  }

  const row = await q1<{
    unit_id: string; unit_no: string; property_name: string;
    tenant_id: string; tenant_name: string;
  }>(
    `SELECT u.id AS unit_id, u.unit_no, p.name AS property_name,
            t.id AS tenant_id, t.name AS tenant_name
       FROM contracts c
       JOIN units      u ON u.id = c.unit_id
       JOIN properties p ON p.id = u.property_id
       JOIN tenants    t ON t.id = c.tenant_id
      WHERE c.id = $1`,
    [contractId]
  );
  if (!row) return null;
  return {
    unitId: String(row.unit_id),
    unitNo: String(row.unit_no),
    propertyName: String(row.property_name),
    tenantId: String(row.tenant_id),
    tenantName: String(row.tenant_name),
  };
}

export interface NonRenewalInput {
  contractId: string;
  unitNo: string;
  propertyName: string;
  tenantName: string;
  endDate: string;
  /** AED. */
  securityDeposit: number;
  reason: string;
  requestedBy: string;
  now: string;
}

export async function submitNonRenewal(input: NonRenewalInput): Promise<void> {
  if (backend() === "json") {
    const apId = nextJsonId("approval", "AP");
    const ref = `APR-${apId.replace("AP", "").padStart(4, "0")}`;
    jsonWrite((store) => {
      store.approvals.push({
        id: apId,
        ref,
        type: "contract_termination",
        title: `Non-renewal — ${input.unitNo}, ${input.propertyName}`,
        summary: `${input.tenantName} · ends ${input.endDate} · ${input.reason}`,
        entityType: "contract",
        entityId: input.contractId,
        amount: input.securityDeposit,
        requestedBy: input.requestedBy,
        requestedAt: input.now,
        status: "pending",
      });
      store.tasks.push({
        id: nextJsonId("task", "TK"),
        title: `Move-out inspection — ${input.unitNo}`,
        detail: `${input.tenantName} vacating on ${input.endDate}. Meter readings, keys, deposit assessment.`,
        assignedTo: pickAssigneeJson(["maintenance"]) ?? "",
        dueDate: input.endDate,
        status: "open",
        priority: "high",
        entityType: "contract",
        entityId: input.contractId,
        createdAt: input.now,
        source: "system",
      });
      store.tasks.push({
        id: nextJsonId("task", "TK"),
        title: `Review approval ${ref}`,
        detail: `Non-renewal for ${input.unitNo}`,
        assignedTo: "U2",
        dueDate: addDays(today(), 2),
        status: "open",
        priority: "high",
        entityType: "approval",
        entityId: apId,
        createdAt: input.now,
        source: "system",
      });
    });
    return;
  }

  await tx(async (c) => {
    const ref = await nextRefIn(c, "approval", (n) => `APR-${String(n).padStart(4, "0")}`);
    const approvalId = await insertApproval(c, {
      ref,
      type: "contract_termination",
      title: `Non-renewal — ${input.unitNo}, ${input.propertyName}`,
      summary: `${input.tenantName} · ends ${input.endDate} · ${input.reason}`,
      entityType: "contract",
      entityId: input.contractId,
      amount: toFils(input.securityDeposit),
      requestedBy: input.requestedBy,
      requestedAt: input.now,
    });

    await insertTask(c, {
      title: `Move-out inspection — ${input.unitNo}`,
      detail: `${input.tenantName} vacating on ${input.endDate}. Meter readings, keys, deposit assessment.`,
      assignedTo: await assigneeFor(c, ["maintenance"]),
      dueDate: input.endDate,
      status: "open",
      priority: "high",
      entityType: "contract",
      entityId: input.contractId,
      createdAt: input.now,
    });

    await insertTask(c, {
      title: `Review approval ${ref}`,
      detail: `Non-renewal for ${input.unitNo}`,
      assignedTo: await assigneeFor(c, ["manager", "admin"]),
      dueDate: addDays(today(), 2),
      status: "open",
      priority: "high",
      entityType: "approval",
      entityId: approvalId,
      createdAt: input.now,
    });
  });
}

/* ---------------------------------------------------------------- renewal */

export interface RenewalInput {
  previousId: string;
  previousRef: string;
  unitId: string;
  unitNo: string;
  propertyName: string;
  tenantId: string;
  tenantName: string;
  startDate: string;
  endDate: string;
  termMonths: number;
  /** AED. */
  previousRent: number;
  newRent: number;
  securityDeposit: number;
  ejariNo: string;
  notes?: string;
  cheques: ChequeLine[];
  docs: DocSpec[];
  createdBy: string;
  createdByName: string;
  now: string;
}

export async function submitRenewal(input: RenewalInput): Promise<CreatedContract> {
  const pct = input.previousRent
    ? ((input.newRent - input.previousRent) / input.previousRent) * 100
    : 0;
  const summary =
    `${input.tenantName} · AED ${input.previousRent.toLocaleString("en-US")} → ` +
    `AED ${input.newRent.toLocaleString("en-US")} ` +
    `(${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%) · ${input.cheques.length} cheques`;

  if (backend() === "json") return submitRenewalJson(input, summary);

  return tx(async (c) => {
    const ref = await nextRefIn(
      c,
      "contract",
      (n) => `CTR-${input.startDate.slice(0, 4)}-${String(n).padStart(4, "0")}`
    );

    const { rows } = await c.query(
      `INSERT INTO contracts
         (ref, unit_id, tenant_id, start_date, end_date, annual_rent, cheque_count,
          security_deposit, commission, ejari_no, status, created_by, created_at,
          documents, notes, renewed_from_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,'pending_approval',$10,$11,$12,$13,$14)
       RETURNING id`,
      [
        ref, input.unitId, input.tenantId, input.startDate, input.endDate,
        toFils(input.newRent), input.cheques.length, toFils(input.securityDeposit),
        input.ejariNo, input.createdBy, input.now,
        JSON.stringify(
          input.docs.map((d) => ({ ...d, ref: `${d.key}-${ref}.pdf` }))
        ),
        input.notes || null, input.previousId,
      ]
    );
    const newId = String(rows[0].id);

    for (const [i, line] of input.cheques.entries()) {
      await c.query(
        `INSERT INTO cheques
           (contract_id, seq, of_total, cheque_no, bank, amount, due_date, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')`,
        [
          newId, i + 1, input.cheques.length, line.chequeNo, line.bank,
          toFils(line.amount), line.dueDate,
        ]
      );
    }

    const apRef = await nextRefIn(c, "approval", (n) => `APR-${String(n).padStart(4, "0")}`);
    const approvalId = await insertApproval(c, {
      ref: apRef,
      type: "renewal",
      title: `Renewal — ${input.unitNo}, ${input.propertyName}`,
      summary,
      entityType: "contract",
      entityId: newId,
      amount: toFils(input.newRent),
      requestedBy: input.createdBy,
      requestedAt: input.now,
    });

    await insertTask(c, {
      title: `Review approval ${apRef}`,
      detail: `Renewal for ${input.unitNo} submitted by ${input.createdByName}`,
      assignedTo: await assigneeFor(c, ["manager", "admin"]),
      dueDate: addDays(today(), 2),
      status: "open",
      priority: "high",
      entityType: "approval",
      entityId: approvalId,
      createdAt: input.now,
    });

    // Close the renewal reminder that started this.
    await closeTasksFor(c, "contract", input.previousId, input.now);

    return { id: newId, ref };
  });
}

/* -------------------------------------------------------------- json store */

function submitRenewalJson(input: RenewalInput, summary: string): CreatedContract {
  const newId = nextJsonId("contract", "C");
  const ref = `CTR-${input.startDate.slice(0, 4)}-${newId.replace("C", "").padStart(4, "0")}`;

  jsonWrite((store) => {
    const renewed: Contract = {
      id: newId,
      ref,
      unitId: input.unitId,
      tenantId: input.tenantId,
      startDate: input.startDate,
      endDate: input.endDate,
      annualRent: input.newRent,
      chequeCount: input.cheques.length,
      securityDeposit: input.securityDeposit,
      commission: 0,
      ejariNo: input.ejariNo,
      status: "pending_approval",
      createdBy: input.createdBy,
      createdAt: input.now,
      documents: input.docs.map((d) => ({ ...d, ref: `${d.key}-${newId}.pdf` })),
      notes: input.notes || undefined,
      renewedFromId: input.previousId,
    };
    store.contracts.push(renewed);

    input.cheques.forEach((line, i) => {
      const cheque: Cheque = {
        id: nextJsonId("cheque", "CH"),
        contractId: newId,
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

    const apId = nextJsonId("approval", "AP");
    const apRef = `APR-${apId.replace("AP", "").padStart(4, "0")}`;

    store.approvals.push({
      id: apId,
      ref: apRef,
      type: "renewal",
      title: `Renewal — ${input.unitNo}, ${input.propertyName}`,
      summary,
      entityType: "contract",
      entityId: newId,
      amount: input.newRent,
      requestedBy: input.createdBy,
      requestedAt: input.now,
      status: "pending",
    });

    store.tasks.push({
      id: nextJsonId("task", "TK"),
      title: `Review approval ${apRef}`,
      detail: `Renewal for ${input.unitNo} submitted by ${input.createdByName}`,
      assignedTo: "U2",
      dueDate: addDays(today(), 2),
      status: "open",
      priority: "high",
      entityType: "approval",
      entityId: apId,
      createdAt: input.now,
      source: "system",
    });

    store.tasks
      .filter(
        (t) => t.entityType === "contract" && t.entityId === input.previousId && t.status !== "done"
      )
      .forEach((t) => {
        t.status = "done";
        t.completedAt = input.now;
      });
  });

  return { id: newId, ref };
}
