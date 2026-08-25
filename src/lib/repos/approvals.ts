import "server-only";
import type { PoolClient } from "pg";
import { q1, tx } from "../db";
import { backend } from "../data";
import { toApproval } from "../repo";
import { db as jsonDb, nextId as nextJsonId, write as jsonWrite , pickAssigneeJson } from "../store";
import { addDays, daysFromToday, today } from "../utils";
import type { Approval } from "../types";
import { ConflictError, assigneeFor, closeTasksFor, insertTask } from "./shared";

/**
 * Deciding an approval.
 *
 * This is the only place a contract becomes live, so the decision and
 * everything that follows from it are one transaction: the contract's status,
 * the unit's, the cheques', the follow-up tasks and the closing of the review
 * task. A decision that half-applied would leave a tenancy approved on the
 * contract screen and the unit still showing vacant to the next agent.
 *
 * Every transition is derived here from the approval's own type and the stored
 * state. Nothing about which transition to apply comes from the caller.
 */

export async function findApproval(id: string): Promise<Approval | null> {
  if (backend() === "json") return jsonDb().approvals.find((a) => a.id === id) ?? null;
  const row = await q1("SELECT * FROM approvals WHERE id = $1", [id]);
  return row ? toApproval(row) : null;
}

export type Decision = "approved" | "rejected";

export interface DecideInput {
  approvalId: string;
  decision: Decision;
  note: string;
  actorId: string;
  now: string;
}

export async function decideApproval(input: DecideInput): Promise<void> {
  if (backend() === "json") return decideApprovalJson(input);

  await tx(async (c) => {
    // Guarded on `pending`, so a second decision on the same item is refused
    // rather than overwriting the first one.
    const { rows } = await c.query(
      `UPDATE approvals
          SET status = $2, decided_by = $3, decided_at = $4, decision_note = $5
        WHERE id = $1 AND status = 'pending'
        RETURNING type, entity_id, summary, requested_by`,
      [input.approvalId, input.decision, input.actorId, input.now, input.note || null]
    );
    if (rows.length === 0) throw new ConflictError("This item was already decided.");
    const a = rows[0];

    await closeTasksFor(c, "approval", input.approvalId, input.now);

    // The decision above always stands. The cascade below only runs when the
    // approval actually points at an entity: an approval with a null entity_id
    // (some seeded ones do) is still decidable, it just has nothing downstream
    // to act on. Guarding here is also what stops `String(null)` becoming the
    // literal "null" and being rejected as an invalid uuid.
    if ((a.type === "new_contract" || a.type === "renewal") && a.entity_id) {
      await applyContractDecision(c, String(a.entity_id), input);
    }

    if (a.type === "maintenance_spend" && a.entity_id) {
      await c.query(
        "UPDATE maintenance_requests SET status = $2 WHERE id = $1",
        [a.entity_id, input.decision === "approved" ? "in_progress" : "rejected"]
      );
    }

    if (a.type === "cheque_replacement" && input.decision === "approved") {
      await insertTask(c, {
        title: "Register the replacement cheque",
        detail: `${a.summary}. Add the new cheque against the contract once received.`,
        assignedTo: String(a.requested_by),
        dueDate: addDays(today(), 3),
        status: "open",
        priority: "high",
        entityType: "cheque",
        entityId: a.entity_id ? String(a.entity_id) : null,
        createdAt: input.now,
      });
    }
  });
}

/* --------------------------------------------------------------- contracts */

async function applyContractDecision(
  c: PoolClient,
  contractId: string,
  input: DecideInput
): Promise<void> {
  const { rows } = await c.query(
    `SELECT id, ref, unit_id, created_by, end_date::text AS end_date
       FROM contracts WHERE id = $1`,
    [contractId]
  );
  if (rows.length === 0) return;
  const contract = rows[0];
  const unitNo = await unitNumber(c, String(contract.unit_id));

  if (input.decision === "approved") {
    const daysLeft = daysFromToday(String(contract.end_date));
    const status = daysLeft <= 90 && daysLeft >= 0 ? "expiring" : "active";

    await c.query(
      `UPDATE contracts SET status = $2, approved_by = $3, approved_at = $4 WHERE id = $1`,
      [contractId, status, input.actorId, input.now]
    );
    await c.query("UPDATE units SET status = 'occupied' WHERE id = $1", [contract.unit_id]);

    // Every cheque coming due soon now gets a real owner and a real deadline.
    const { rows: due } = await c.query(
      `SELECT id, cheque_no, amount, seq, of_total, due_date::text AS due_date
         FROM cheques WHERE contract_id = $1 AND status = 'pending' ORDER BY seq`,
      [contractId]
    );
    const accountants = await roleHolders(c, "accountant");
    let i = 0;
    for (const ch of due) {
      if (daysFromToday(String(ch.due_date)) > 10) continue;
      await insertTask(c, {
        title: `Deposit cheque ${ch.cheque_no}`,
        detail: `Contract ${contract.ref} · AED ${(Number(ch.amount) / 100).toLocaleString("en-US")} · cheque ${ch.seq} of ${ch.of_total}`,
        assignedTo: accountants.length ? accountants[i % accountants.length] : null,
        dueDate: String(ch.due_date),
        status: daysFromToday(String(ch.due_date)) < 0 ? "overdue" : "open",
        priority: "medium",
        entityType: "cheque",
        entityId: String(ch.id),
        createdAt: input.now,
      });
      i += 1;
    }

    // And the renewal clock starts immediately.
    await insertTask(c, {
      title: `Start renewal — ${unitNo} (${contract.ref})`,
      detail: `Contract expires ${contract.end_date}. Begin the renewal 90 days before.`,
      assignedTo: contract.created_by ? String(contract.created_by) : await assigneeFor(c, ["leasing"]),
      dueDate: addDays(String(contract.end_date), -90),
      status: "open",
      priority: "medium",
      entityType: "contract",
      entityId: contractId,
      createdAt: input.now,
    });
    return;
  }

  await c.query("UPDATE contracts SET status = 'rejected' WHERE id = $1", [contractId]);
  await c.query("UPDATE units SET status = 'vacant' WHERE id = $1", [contract.unit_id]);
  await c.query("UPDATE cheques SET status = 'cancelled' WHERE contract_id = $1", [contractId]);
  await insertTask(c, {
    title: `Rework rejected contract ${contract.ref}`,
    detail: input.note,
    assignedTo: contract.created_by ? String(contract.created_by) : await assigneeFor(c, ["leasing"]),
    dueDate: addDays(today(), 2),
    status: "open",
    priority: "high",
    entityType: "contract",
    entityId: contractId,
    createdAt: input.now,
  });
}

async function unitNumber(c: PoolClient, unitId: string): Promise<string> {
  const { rows } = await c.query("SELECT unit_no FROM units WHERE id = $1", [unitId]);
  return rows[0] ? String(rows[0].unit_no) : "";
}

/** Everyone holding a role, so work can be spread rather than piled on one person. */
async function roleHolders(c: PoolClient, role: string): Promise<string[]> {
  const { rows } = await c.query(
    "SELECT id FROM users WHERE role = $1::user_role AND status = 'active' ORDER BY created_at",
    [role]
  );
  return rows.map((r) => String(r.id));
}

/* -------------------------------------------------------------- json store */

function decideApprovalJson(input: DecideInput): void {
  jsonWrite((store) => {
    const a = store.approvals.find((x) => x.id === input.approvalId);
    // Same guard the SQL path gets from `WHERE status = 'pending'`. Returning
    // quietly here would let the action report a successful decision for an
    // item somebody else had already decided.
    if (!a || a.status !== "pending") throw new ConflictError("This item was already decided.");
    a.status = input.decision;
    a.decidedBy = input.actorId;
    a.decidedAt = input.now;
    a.decisionNote = input.note || undefined;

    store.tasks
      .filter(
        (t) => t.entityType === "approval" && t.entityId === input.approvalId && t.status !== "done"
      )
      .forEach((t) => {
        t.status = "done";
        t.completedAt = input.now;
      });

    if (a.type === "new_contract" || a.type === "renewal") {
      const contract = store.contracts.find((c) => c.id === a.entityId);
      if (!contract) return;
      const unit = store.units.find((u) => u.id === contract.unitId);

      if (input.decision === "approved") {
        contract.status =
          daysFromToday(contract.endDate) <= 90 && daysFromToday(contract.endDate) >= 0
            ? "expiring"
            : "active";
        contract.approvedBy = input.actorId;
        contract.approvedAt = input.now;
        if (unit) unit.status = "occupied";

        store.cheques
          .filter((c) => c.contractId === contract.id && c.status === "pending")
          .forEach((c, i) => {
            if (daysFromToday(c.dueDate) > 10) return;
            store.tasks.push({
              id: nextJsonId("task", "TK"),
              title: `Deposit cheque ${c.chequeNo}`,
              detail: `Contract ${contract.ref} · AED ${c.amount.toLocaleString("en-US")} · cheque ${c.seq} of ${c.ofTotal}`,
              // Balanced across the accounts team rather than alternating two ids.
              assignedTo: pickAssigneeJson(["accountant"]) ?? "",
              dueDate: c.dueDate,
              status: daysFromToday(c.dueDate) < 0 ? "overdue" : "open",
              priority: "medium",
              entityType: "cheque",
              entityId: c.id,
              createdAt: input.now,
              source: "system",
            });
          });

        store.tasks.push({
          id: nextJsonId("task", "TK"),
          title: `Start renewal — ${unit?.unitNo ?? ""} (${contract.ref})`,
          detail: `Contract expires ${contract.endDate}. Begin the renewal 90 days before.`,
          assignedTo: contract.createdBy,
          dueDate: addDays(contract.endDate, -90),
          status: "open",
          priority: "medium",
          entityType: "contract",
          entityId: contract.id,
          createdAt: input.now,
          source: "system",
        });
      } else {
        contract.status = "rejected";
        if (unit) unit.status = "vacant";
        store.cheques
          .filter((c) => c.contractId === contract.id)
          .forEach((c) => {
            c.status = "cancelled";
          });
        store.tasks.push({
          id: nextJsonId("task", "TK"),
          title: `Rework rejected contract ${contract.ref}`,
          detail: input.note,
          assignedTo: contract.createdBy,
          dueDate: addDays(today(), 2),
          status: "open",
          priority: "high",
          entityType: "contract",
          entityId: contract.id,
          createdAt: input.now,
          source: "system",
        });
      }
    }

    if (a.type === "maintenance_spend") {
      const m = store.maintenance.find((x) => x.id === a.entityId);
      if (m) m.status = input.decision === "approved" ? "in_progress" : "rejected";
    }

    if (a.type === "cheque_replacement" && input.decision === "approved") {
      store.tasks.push({
        id: nextJsonId("task", "TK"),
        title: "Register the replacement cheque",
        detail: `${a.summary}. Add the new cheque against the contract once received.`,
        assignedTo: a.requestedBy,
        dueDate: addDays(today(), 3),
        status: "open",
        priority: "high",
        entityType: "cheque",
        entityId: a.entityId,
        createdAt: input.now,
        source: "system",
      });
    }
  });
}
