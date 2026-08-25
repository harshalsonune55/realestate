import "server-only";
import { q1, toFils, tx } from "../db";
import { backend } from "../data";
import { toMaintenance } from "../repo";
import { db as jsonDb, nextId as nextJsonId, write as jsonWrite , pickAssigneeJson } from "../store";
import { addDays, today } from "../utils";
import type { MaintenanceRequest, MaintenanceStatus } from "../types";
import {
  ConflictError, assigneeFor, closeTasksFor, insertApproval, insertTask, nextRefIn,
} from "./shared";

/**
 * Work orders.
 *
 * A job above the spend limit is created already blocked on an approval, and
 * the approval and the work order have to appear together: a work order sitting
 * in `awaiting_approval` with no approval to decide is a job that can never
 * start, and an approval pointing at no work order is one nobody can action.
 */

export async function findMaintenance(id: string): Promise<MaintenanceRequest | null> {
  if (backend() === "json") return jsonDb().maintenance.find((m) => m.id === id) ?? null;
  const row = await q1("SELECT * FROM maintenance_requests WHERE id = $1", [id]);
  return row ? toMaintenance(row) : null;
}

/** The tenant currently living in a unit, if any — a work order names them. */
export async function tenantOfUnit(unitId: string): Promise<string | null> {
  if (backend() === "json") {
    const d = jsonDb();
    const contract = d.contracts.find(
      (c) => c.unitId === unitId && (c.status === "active" || c.status === "expiring")
    );
    return contract?.tenantId ?? null;
  }
  const row = await q1<{ tenant_id: string }>(
    `SELECT tenant_id FROM contracts
      WHERE unit_id = $1 AND status IN ('active','expiring')
      ORDER BY start_date DESC LIMIT 1`,
    [unitId]
  );
  return row?.tenant_id ?? null;
}

export interface CreateMaintenanceInput {
  unitId: string;
  unitNo: string;
  tenantId: string | null;
  category: string;
  priority: MaintenanceRequest["priority"];
  description: string;
  vendor: string;
  /** AED. Zero means no quote was given. */
  quoteAmount: number;
  slaDays: number;
  needsApproval: boolean;
  reportedBy: string;
  now: string;
}

export interface CreatedMaintenance {
  id: string;
  ref: string;
}

export async function createMaintenance(
  input: CreateMaintenanceInput
): Promise<CreatedMaintenance> {
  const slaDueAt = addDays(today(), input.slaDays);
  const status: MaintenanceStatus = input.needsApproval ? "awaiting_approval" : "assigned";

  if (backend() === "json") {
    const d = jsonDb();
    const id = "M" + (d.maintenance.length + 1);
    const ref = `WO-${String(1200 + d.maintenance.length + 1).padStart(4, "0")}`;

    jsonWrite((store) => {
      store.maintenance.push({
        id,
        ref,
        unitId: input.unitId,
        tenantId: input.tenantId ?? undefined,
        category: input.category,
        priority: input.priority,
        description: input.description,
        status,
        reportedAt: input.now,
        reportedBy: input.reportedBy,
        assignedTo: pickAssigneeJson(["maintenance"]) ?? undefined,
        vendor: input.vendor,
        quoteAmount: input.quoteAmount || undefined,
        slaDueAt,
      });

      store.tasks.push({
        id: nextJsonId("task", "TK"),
        title: `${ref} — ${input.category} at ${input.unitNo}`,
        detail: input.description.slice(0, 140),
        assignedTo: pickAssigneeJson(["maintenance"]) ?? "",
        dueDate: slaDueAt,
        status: "open",
        priority: input.priority === "emergency" || input.priority === "high" ? "high" : "medium",
        entityType: "maintenance",
        entityId: id,
        createdAt: input.now,
        source: "system",
      });

      if (input.needsApproval) {
        const apId = nextJsonId("approval", "AP");
        const apRef = `APR-${apId.replace("AP", "").padStart(4, "0")}`;
        store.approvals.push({
          id: apId,
          ref: apRef,
          type: "maintenance_spend",
          title: `Maintenance spend — ${ref} (${input.unitNo})`,
          summary: `${input.category} · ${input.vendor} · quote AED ${input.quoteAmount.toLocaleString("en-US")}`,
          entityType: "maintenance",
          entityId: id,
          amount: input.quoteAmount,
          requestedBy: input.reportedBy,
          requestedAt: input.now,
          status: "pending",
        });
        store.tasks.push({
          id: nextJsonId("task", "TK"),
          title: `Review approval ${apRef}`,
          detail: `Maintenance spend for ${input.unitNo}`,
          assignedTo: pickAssigneeJson(["manager", "admin"]) ?? "",
          dueDate: addDays(today(), 2),
          status: "open",
          priority: "high",
          entityType: "approval",
          entityId: apId,
          createdAt: input.now,
          source: "system",
        });
      }
    });

    return { id, ref };
  }

  return tx(async (c) => {
    // The counter holds the whole number ('WO-1264' → 1264); 004 backfills it
    // from the references already on file so a new one cannot collide.
    const ref = await nextRefIn(c, "maintenance", (n) => `WO-${String(n).padStart(4, "0")}`);
    const supervisor = await assigneeFor(c, ["maintenance"]);

    const { rows } = await c.query(
      `INSERT INTO maintenance_requests
         (ref, unit_id, tenant_id, category, priority, description, status,
          reported_at, reported_by, assigned_to, vendor, quote_amount, sla_due_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id`,
      [
        ref, input.unitId, input.tenantId, input.category, input.priority,
        input.description, status, input.now, input.reportedBy, supervisor,
        input.vendor, input.quoteAmount ? toFils(input.quoteAmount) : null, slaDueAt,
      ]
    );
    const id = String(rows[0].id);

    await insertTask(c, {
      title: `${ref} — ${input.category} at ${input.unitNo}`,
      detail: input.description.slice(0, 140),
      assignedTo: supervisor,
      dueDate: slaDueAt,
      status: "open",
      priority: input.priority === "emergency" || input.priority === "high" ? "high" : "medium",
      entityType: "maintenance",
      entityId: id,
      createdAt: input.now,
    });

    if (input.needsApproval) {
      const apRef = await nextRefIn(c, "approval", (n) => `APR-${String(n).padStart(4, "0")}`);
      const approvalId = await insertApproval(c, {
        ref: apRef,
        type: "maintenance_spend",
        title: `Maintenance spend — ${ref} (${input.unitNo})`,
        summary: `${input.category} · ${input.vendor} · quote AED ${input.quoteAmount.toLocaleString("en-US")}`,
        entityType: "maintenance",
        entityId: id,
        amount: toFils(input.quoteAmount),
        requestedBy: input.reportedBy,
        requestedAt: input.now,
      });
      await insertTask(c, {
        title: `Review approval ${apRef}`,
        detail: `Maintenance spend for ${input.unitNo}`,
        assignedTo: await assigneeFor(c, ["manager", "admin"]),
        dueDate: addDays(today(), 2),
        status: "open",
        priority: "high",
        entityType: "approval",
        entityId: approvalId,
        createdAt: input.now,
      });
    }

    return { id, ref };
  });
}

/* ---------------------------------------------------------------- advance */

export async function advanceMaintenance(
  id: string,
  from: MaintenanceStatus,
  next: MaintenanceStatus,
  note: string,
  now: string
): Promise<void> {
  if (backend() === "json") {
    jsonWrite((store) => {
      const m = store.maintenance.find((x) => x.id === id)!;
      m.status = next;
      if (next === "completed") {
        m.completedAt = today();
        m.resolutionNotes = note;
      }
      if (next === "closed") {
        m.resolutionNotes = (m.resolutionNotes ? m.resolutionNotes + " — " : "") + note;
        store.tasks
          .filter((t) => t.entityType === "maintenance" && t.entityId === id && t.status !== "done")
          .forEach((t) => {
            t.status = "done";
            t.completedAt = now;
          });
      }
    });
    return;
  }

  await tx(async (c) => {
    // Guarded on the status the caller validated against, so two people
    // advancing the same job cannot skip a step between them.
    const { rowCount } = await c.query(
      `UPDATE maintenance_requests
          SET status = $3,
              completed_at = CASE WHEN $3 = 'completed' THEN $4::date ELSE completed_at END,
              resolution_notes = CASE
                WHEN $3 = 'completed' THEN $5
                WHEN $3 = 'closed' THEN
                  CASE WHEN resolution_notes IS NULL OR resolution_notes = '' THEN $5
                       ELSE resolution_notes || ' — ' || $5 END
                ELSE resolution_notes END
        WHERE id = $1 AND status = $2`,
      [id, from, next, today(), note]
    );
    if (rowCount === 0) throw new ConflictError("This work order has already moved on.");

    if (next === "closed") await closeTasksFor(c, "maintenance", id, now);
  });
}
