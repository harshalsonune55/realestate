import "server-only";
import { db } from "./store";
import { Cheque, Contract, Tenant, Unit } from "./types";
import { addDays, daysFromToday, today } from "./utils";

/** How many days before a cheque due date the system starts nagging. */
export const REMINDER_WINDOW_DAYS = 7;
/** Grace period after the due date before a cheque is flagged as leakage. */
export const DEPOSIT_GRACE_DAYS = 0;

export type ChequeFlag = "ok" | "due_soon" | "overdue" | "bounced" | "stuck";

export function chequeFlag(c: Cheque): ChequeFlag {
  if (c.status === "bounced") return "bounced";
  if (c.status === "pending") {
    const d = daysFromToday(c.dueDate);
    if (d < -DEPOSIT_GRACE_DAYS) return "overdue";
    if (d <= REMINDER_WINDOW_DAYS) return "due_soon";
    return "ok";
  }
  if (c.status === "deposited" && daysFromToday(c.depositedAt ?? today()) < -5) return "stuck";
  return "ok";
}

export interface Enriched {
  cheque: Cheque;
  contract: Contract;
  tenant: Tenant;
  unit: Unit;
  property: string;
  flag: ChequeFlag;
}

export function enrichCheques(list?: Cheque[]): Enriched[] {
  const d = db();
  const contracts = new Map(d.contracts.map((c) => [c.id, c]));
  const tenants = new Map(d.tenants.map((t) => [t.id, t]));
  const units = new Map(d.units.map((u) => [u.id, u]));
  const props = new Map(d.properties.map((p) => [p.id, p.name]));
  return (list ?? d.cheques)
    .map((cheque) => {
      const contract = contracts.get(cheque.contractId);
      if (!contract) return null;
      const unit = units.get(contract.unitId);
      const tenant = tenants.get(contract.tenantId);
      if (!unit || !tenant) return null;
      return {
        cheque,
        contract,
        tenant,
        unit,
        property: props.get(unit.propertyId) ?? "",
        flag: chequeFlag(cheque),
      } as Enriched;
    })
    .filter(Boolean) as Enriched[];
}

export function unitLabel(unitId: string) {
  const d = db();
  const u = d.units.find((x) => x.id === unitId);
  if (!u) return "—";
  const p = d.properties.find((x) => x.id === u.propertyId);
  return `${u.unitNo} · ${p?.name ?? ""}`;
}

export function contractOf(unitId: string) {
  return db().contracts.find(
    (c) => c.unitId === unitId && (c.status === "active" || c.status === "expiring")
  );
}

export function userName(id: string) {
  return db().users.find((u) => u.id === id)?.name ?? id;
}

export interface Alert {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  href: string;
  count?: number;
}

/** The heart of the "nothing gets missed" promise: everything the system is watching. */
export function alerts(): Alert[] {
  const d = db();
  const out: Alert[] = [];
  const live = d.cheques.filter((c) => {
    const ct = d.contracts.find((x) => x.id === c.contractId);
    return ct && ct.status !== "pending_approval" && ct.status !== "draft" && ct.status !== "rejected";
  });

  const overdue = live.filter((c) => chequeFlag(c) === "overdue");
  if (overdue.length) {
    const value = overdue.reduce((s, c) => s + c.amount, 0);
    out.push({
      id: "overdue-cheques",
      severity: "critical",
      title: `${overdue.length} cheque${overdue.length > 1 ? "s" : ""} past due and not deposited`,
      detail: `AED ${value.toLocaleString("en-US")} sitting undeposited. Oldest is ${Math.max(
        ...overdue.map((c) => -daysFromToday(c.dueDate))
      )} days late.`,
      href: "/cheques?flag=overdue",
      count: overdue.length,
    });
  }

  const bounced = live.filter((c) => c.status === "bounced");
  if (bounced.length) {
    out.push({
      id: "bounced-cheques",
      severity: "critical",
      title: `${bounced.length} bounced cheque${bounced.length > 1 ? "s" : ""} awaiting replacement`,
      detail: `AED ${bounced.reduce((s, c) => s + c.amount, 0).toLocaleString("en-US")} unrecovered.`,
      href: "/cheques?flag=bounced",
      count: bounced.length,
    });
  }

  const dueSoon = live.filter((c) => chequeFlag(c) === "due_soon");
  if (dueSoon.length) {
    out.push({
      id: "due-soon",
      severity: "warning",
      title: `${dueSoon.length} cheques due within ${REMINDER_WINDOW_DAYS} days`,
      detail: `AED ${dueSoon.reduce((s, c) => s + c.amount, 0).toLocaleString("en-US")} to be banked. Reminders have been issued.`,
      href: "/cheques?flag=due_soon",
      count: dueSoon.length,
    });
  }

  const stuck = live.filter((c) => chequeFlag(c) === "stuck");
  if (stuck.length) {
    out.push({
      id: "stuck",
      severity: "warning",
      title: `${stuck.length} cheques deposited but not cleared after 5 days`,
      detail: "Confirm the clearance with the bank or chase the tenant.",
      href: "/cheques?flag=stuck",
      count: stuck.length,
    });
  }

  const expiring = d.contracts.filter(
    (c) => c.status === "expiring" || (c.status === "active" && daysFromToday(c.endDate) <= 90 && daysFromToday(c.endDate) >= 0)
  );
  if (expiring.length) {
    const urgent = expiring.filter((c) => daysFromToday(c.endDate) <= 30);
    out.push({
      id: "expiring",
      severity: urgent.length ? "warning" : "info",
      title: `${expiring.length} contracts expiring within 90 days`,
      detail: `${urgent.length} of them expire in under 30 days and have no signed renewal yet.`,
      href: "/renewals",
      count: expiring.length,
    });
  }

  const pendingApprovals = d.approvals.filter((a) => a.status === "pending");
  if (pendingApprovals.length) {
    const old = pendingApprovals.filter((a) => daysFromToday(a.requestedAt.slice(0, 10)) < -2);
    out.push({
      id: "approvals",
      severity: old.length ? "warning" : "info",
      title: `${pendingApprovals.length} items waiting for manager approval`,
      detail: old.length ? `${old.length} have been waiting more than 2 days.` : "All within the 2-day service level.",
      href: "/approvals",
      count: pendingApprovals.length,
    });
  }

  const slaBreach = d.maintenance.filter(
    (m) => !["completed", "closed", "rejected"].includes(m.status) && daysFromToday(m.slaDueAt) < 0
  );
  if (slaBreach.length) {
    out.push({
      id: "sla",
      severity: "warning",
      title: `${slaBreach.length} maintenance jobs past their SLA`,
      detail: "Assign a vendor or escalate to the operations manager.",
      href: "/maintenance?flag=breach",
      count: slaBreach.length,
    });
  }

  const overdueTasks = d.tasks.filter((t) => t.status === "overdue");
  if (overdueTasks.length) {
    out.push({
      id: "tasks",
      severity: "warning",
      title: `${overdueTasks.length} employee tasks are overdue`,
      detail: "Every overdue task is visible to the manager on the team workload report.",
      href: "/tasks?filter=overdue",
      count: overdueTasks.length,
    });
  }

  const order = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

export function kpis() {
  const d = db();
  const totalUnits = d.units.length;
  const occupied = d.units.filter((u) => u.status === "occupied").length;
  const activeContracts = d.contracts.filter((c) => c.status === "active" || c.status === "expiring");
  const annualised = activeContracts.reduce((s, c) => s + c.annualRent, 0);

  const yearAgo = addDays(today(), -365);
  const collected = d.payments
    .filter((p) => p.receivedAt >= yearAgo && p.category === "rent")
    .reduce((s, p) => s + p.amount, 0);

  const live = d.cheques.filter((c) => {
    const ct = d.contracts.find((x) => x.id === c.contractId);
    return ct && (ct.status === "active" || ct.status === "expiring");
  });
  const outstanding = live
    .filter((c) => c.status === "pending" || c.status === "bounced")
    .reduce((s, c) => s + c.amount, 0);
  const atRisk = live
    .filter((c) => chequeFlag(c) === "overdue" || c.status === "bounced")
    .reduce((s, c) => s + c.amount, 0);

  return {
    totalUnits,
    occupied,
    vacant: d.units.filter((u) => u.status === "vacant").length,
    occupancy: totalUnits ? occupied / totalUnits : 0,
    activeContracts: activeContracts.length,
    annualised,
    collected,
    outstanding,
    atRisk,
    chequesTotal: live.length,
    chequesCleared: live.filter((c) => c.status === "cleared").length,
    pendingApprovals: d.approvals.filter((a) => a.status === "pending").length,
    openTasks: d.tasks.filter((t) => t.status !== "done").length,
    overdueTasks: d.tasks.filter((t) => t.status === "overdue").length,
    openMaintenance: d.maintenance.filter((m) => !["closed", "completed", "rejected"].includes(m.status)).length,
    expiring90: d.contracts.filter(
      (c) => (c.status === "active" || c.status === "expiring") && daysFromToday(c.endDate) <= 90 && daysFromToday(c.endDate) >= 0
    ).length,
  };
}

/** Cheques falling due month by month for the next 12 months. */
export function collectionForecast() {
  const d = db();
  const buckets: { month: string; label: string; due: number; count: number }[] = [];
  const start = new Date();
  for (let i = 0; i < 12; i++) {
    const dt = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    buckets.push({
      month: dt.toISOString().slice(0, 7),
      label: dt.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
      due: 0,
      count: 0,
    });
  }
  const map = new Map(buckets.map((b) => [b.month, b]));
  for (const c of d.cheques) {
    if (c.status !== "pending") continue;
    const b = map.get(c.dueDate.slice(0, 7));
    if (b) {
      b.due += c.amount;
      b.count += 1;
    }
  }
  return buckets;
}
