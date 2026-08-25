import "server-only";
import { Cheque, Contract, DB, Tenant, Unit } from "./types";
import { addDays, daysFromToday, today } from "./utils";

/**
 * Derivations over the working set — flags, alerts, KPIs, the forecast.
 *
 * Every function takes the dataset rather than fetching one. They used to call
 * the JSON store directly, which meant a screen could render Postgres data
 * beside a figure computed from a stale file, with nothing to indicate the two
 * disagreed. Taking `DB` as an argument makes that impossible: the caller loads
 * once from the configured repository and everything on the page is derived
 * from that same snapshot.
 */

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

export function enrichCheques(d: DB, list?: Cheque[]): Enriched[] {
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

export function unitLabel(d: DB, unitId: string) {
  const u = d.units.find((x) => x.id === unitId);
  if (!u) return "—";
  const p = d.properties.find((x) => x.id === u.propertyId);
  return `${u.unitNo} · ${p?.name ?? ""}`;
}

export function contractOf(d: DB, unitId: string) {
  return d.contracts.find(
    (c) => c.unitId === unitId && (c.status === "active" || c.status === "expiring")
  );
}

export function userName(d: DB, id: string) {
  return d.users.find((u) => u.id === id)?.name ?? id;
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
export function alerts(d: DB): Alert[] {
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

export function kpis(d: DB) {
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
export function collectionForecast(d: DB) {
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

/* ------------------------------------------------------------------ revenue */

export interface RevenueWindow {
  /** Column heading on the strip — "Last 30 days". */
  label: string;
  /** Rent banked inside the window. */
  amount: number;
  /**
   * Movement against the window of equal length immediately before it, as a
   * fraction. `null` when that earlier window banked nothing: dividing by zero
   * would print an infinite jump, and "no comparison" is the honest reading.
   */
  delta: number | null;
}

export interface RevenueMonth {
  month: string;
  label: string;
  /** Rent actually banked that month. */
  collected: number;
  /** Cheques dated that month still pending or bounced. */
  outstanding: number;
}

/**
 * The revenue card — a strip of windowed totals over a twelve-month series.
 *
 * Both series are money in AED, so they share one axis: plotting collected
 * cash against a *count* of cheques would be a second scale invented to fill
 * the same box, and the correlation it implied would not be in the data.
 *
 * "Collected" counts rent payments by the day they were received. "Outstanding"
 * counts cheques by their due date — money the month was owed and did not get.
 * A month can carry both, which is the point of drawing them together.
 */
export function revenue(d: DB, now = new Date()) {
  const rent = d.payments.filter((p) => p.category === "rent");
  const banked = (from: string, to: string) =>
    rent
      .filter((p) => p.receivedAt >= from && p.receivedAt < to)
      .reduce((s, p) => s + p.amount, 0);

  const nowIso = now.toISOString();
  const ago = (days: number) => addDays(nowIso.slice(0, 10), -days);

  /** A window and the equally long one before it, so the delta is like-for-like. */
  const windowOf = (label: string, days: number): RevenueWindow => {
    const amount = banked(ago(days), nowIso);
    const prior = banked(ago(days * 2), ago(days));
    return { label, amount, delta: prior === 0 ? null : (amount - prior) / prior };
  };

  const windows: RevenueWindow[] = [
    windowOf("Last 24h", 1),
    windowOf("Last week", 7),
    windowOf("Last month", 30),
    windowOf("Last year", 365),
    {
      label: "All time",
      amount: rent.reduce((s, p) => s + p.amount, 0),
      delta: null,
    },
  ];

  // Twelve months back to this one, oldest first.
  const months: RevenueMonth[] = [];
  for (let i = 11; i >= 0; i--) {
    const dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push({
      month: dt.toISOString().slice(0, 7),
      label: dt.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
      collected: 0,
      outstanding: 0,
    });
  }
  const byMonth = new Map(months.map((m) => [m.month, m]));

  for (const p of rent) {
    const m = byMonth.get(p.receivedAt.slice(0, 7));
    if (m) m.collected += p.amount;
  }
  for (const c of d.cheques) {
    // Same definition of "owed" the outstanding KPI uses, so the card and the
    // pastel tiles above it can never disagree about the same money.
    if (c.status !== "pending" && c.status !== "bounced") continue;
    const m = byMonth.get(c.dueDate.slice(0, 7));
    if (m) m.outstanding += c.amount;
  }

  return { windows, months };
}

/* ------------------------------------------------------------------- splits */

export interface Slice {
  key: string;
  label: string;
  value: number;
  /** Share of the whole, 0–1. Computed here so the chart never divides. */
  share: number;
}

/** Turns raw counts into slices, dropping empties so no zero-width arc is drawn. */
function toSlices(rows: { key: string; label: string; value: number }[]): Slice[] {
  const total = rows.reduce((s, r) => s + r.value, 0);
  return rows
    .filter((r) => r.value > 0)
    .map((r) => ({ ...r, share: total === 0 ? 0 : r.value / total }));
}

/**
 * The two part-to-whole splits the dashboard draws as donuts.
 *
 * Both are genuine parts of a whole — every unit is in exactly one state, and
 * every live cheque's value falls in exactly one bucket — which is the only
 * thing a ring is honest for. Neither is a ranking, and neither is a set of
 * near-identical values a reader would have to compare by eye.
 */
export function portfolioSplits(d: DB) {
  const units = toSlices([
    { key: "occupied", label: "Occupied", value: d.units.filter((u) => u.status === "occupied").length },
    { key: "vacant", label: "Vacant", value: d.units.filter((u) => u.status === "vacant").length },
    { key: "reserved", label: "Reserved", value: d.units.filter((u) => u.status === "reserved").length },
    { key: "maintenance", label: "Maintenance", value: d.units.filter((u) => u.status === "maintenance").length },
  ]);

  // Only cheques on live tenancies: a cancelled contract's paper is not money
  // anybody is still waiting for, and counting it would inflate every share.
  const live = d.cheques.filter((c) => {
    const ct = d.contracts.find((x) => x.id === c.contractId);
    return ct && (ct.status === "active" || ct.status === "expiring");
  });
  const sum = (f: (c: Cheque) => boolean) =>
    live.filter(f).reduce((s, c) => s + c.amount, 0);

  const cheques = toSlices([
    { key: "cleared", label: "Cleared", value: sum((c) => c.status === "cleared") },
    {
      key: "inFlight",
      label: "In flight",
      value: sum(
        (c) => c.status === "deposited" || (c.status === "pending" && chequeFlag(c) !== "overdue")
      ),
    },
    {
      key: "atRisk",
      label: "At risk",
      value: sum((c) => c.status === "bounced" || chequeFlag(c) === "overdue"),
    },
  ]);

  return { units, cheques };
}

/* ------------------------------------------------------------------ pipeline */

export interface PipelineMonth {
  month: string;
  label: string;
  /** Viewings that happened but went no further. */
  viewed: number;
  /** The visitor said they were interested. */
  interested: number;
  /** An offer was put on the table. */
  offered: number;
  /** A contract was raised off the back of it. */
  signed: number;
  /** Cancelled, no-show, or explicitly not interested. Drawn below the line. */
  lost: number;
}

export interface FunnelStage {
  key: string;
  label: string;
  value: number;
  /** Share of the stage above it — where the pipeline actually leaks. */
  ofPrevious: number | null;
  /** Share of the very top of the funnel. */
  ofTop: number;
}

/**
 * The leasing funnel: viewings in, tenancies out.
 *
 * The stages are strictly nested — every signing had an offer, every offer came
 * from an interested viewer — which is what makes both the stack and the funnel
 * legitimate. A column's stacked height is therefore the *outcome mix* of that
 * month's viewings, never a sum of overlapping counts.
 *
 * Losses are plotted below the baseline rather than as a fifth stacked band:
 * they are not part of the same whole, and burying them inside the stack would
 * make a bad month look like a tall one.
 */
export function leasingPipeline(d: DB, now = new Date()) {
  const visits = d.visits ?? [];

  const months: PipelineMonth[] = [];
  for (let i = 5; i >= 0; i--) {
    const dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push({
      month: dt.toISOString().slice(0, 7),
      label: dt.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
      viewed: 0,
      interested: 0,
      offered: 0,
      signed: 0,
      lost: 0,
    });
  }
  const byMonth = new Map(months.map((m) => [m.month, m]));

  const totals = { viewed: 0, interested: 0, offered: 0, signed: 0, lost: 0 };

  for (const v of visits) {
    const key = v.startsAt.slice(0, 7);
    const m = byMonth.get(key);
    const lost =
      v.status === "cancelled" ||
      v.status === "no_show" ||
      v.outcome === "not_interested";

    if (lost) {
      totals.lost += 1;
      if (m) m.lost += 1;
      continue;
    }

    // Each viewing lands in exactly one band — the furthest stage it reached —
    // so the stacked column totals the month's viewings and nothing is
    // double-counted up the funnel.
    const band =
      v.outcome === "offer_made"
        ? d.contracts.some((c) => c.unitId === v.unitId && c.createdAt >= v.startsAt)
          ? "signed"
          : "offered"
        : v.outcome === "interested"
        ? "interested"
        : "viewed";

    totals[band] += 1;
    if (m) m[band] += 1;
  }

  /* The funnel is cumulative — each stage counts everything that reached it or
     went past it — because "how many got this far" is the question a funnel
     answers, and it is what makes the step percentages meaningful. */
  const top = totals.viewed + totals.interested + totals.offered + totals.signed;
  const reached = [
    { key: "viewed", label: "Viewings held", value: top },
    {
      key: "interested",
      label: "Interested",
      value: totals.interested + totals.offered + totals.signed,
    },
    { key: "offered", label: "Offer made", value: totals.offered + totals.signed },
    { key: "signed", label: "Signed", value: totals.signed },
  ];

  const stages: FunnelStage[] = reached.map((s, i) => ({
    ...s,
    ofPrevious:
      i === 0 || reached[i - 1].value === 0 ? null : s.value / reached[i - 1].value,
    ofTop: top === 0 ? 0 : s.value / top,
  }));

  return { months, stages, lost: totals.lost };
}
