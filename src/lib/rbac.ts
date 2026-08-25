import { Role } from "./types";

export type Perm =
  | "dashboard.view"
  | "properties.view"
  | "properties.edit"
  | "tenants.view"
  | "tenants.edit"
  | "contracts.view"
  | "contracts.create"
  | "contracts.terminate"
  | "cheques.view"
  | "cheques.deposit"
  | "cheques.bounce"
  | "payments.view"
  | "renewals.view"
  | "renewals.process"
  | "maintenance.view"
  | "maintenance.manage"
  | "approvals.view"
  | "approvals.decide"
  | "visits.view"
  | "visits.manage"
  | "tasks.view"
  | "reports.view"
  | "audit.view"
  | "assistant.use"
  | "admin.users";

const ALL: Perm[] = [
  "dashboard.view", "properties.view", "properties.edit", "tenants.view", "tenants.edit",
  "contracts.view", "contracts.create", "contracts.terminate", "cheques.view", "cheques.deposit",
  "cheques.bounce", "payments.view", "renewals.view", "renewals.process", "maintenance.view",
  "maintenance.manage", "approvals.view", "approvals.decide", "visits.view", "visits.manage", "tasks.view", "reports.view",
  "audit.view", "assistant.use", "admin.users",
];

export const ROLE_PERMS: Record<Role, Perm[]> = {
  admin: ALL,
  manager: ALL.filter((p) => p !== "admin.users"),
  accountant: [
    "dashboard.view", "properties.view", "tenants.view", "contracts.view",
    "cheques.view", "cheques.deposit", "cheques.bounce", "payments.view",
    "renewals.view", "approvals.view", "visits.view", "tasks.view", "reports.view", "audit.view",
  ],
  leasing: [
    "dashboard.view", "properties.view", "tenants.view", "tenants.edit",
    "contracts.view", "contracts.create", "cheques.view", "payments.view",
    "renewals.view", "renewals.process", "maintenance.view", "approvals.view",
    "visits.view", "visits.manage", "tasks.view",
  ],
  maintenance: [
    "dashboard.view", "properties.view", "tenants.view", "maintenance.view",
    "maintenance.manage", "tasks.view",
  ],
  viewer: [
    "dashboard.view", "properties.view", "tenants.view", "contracts.view", "cheques.view",
    "payments.view", "renewals.view", "maintenance.view", "approvals.view", "visits.view", "reports.view",
    "audit.view", "tasks.view",
  ],
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrator",
  manager: "Manager",
  accountant: "Accounts",
  leasing: "Leasing",
  maintenance: "Maintenance",
  viewer: "Auditor (read only)",
};

/** One line of plain English per role, shown on the signup screen. */
export const ROLE_SUMMARY: Record<Role, string> = {
  admin: "Full access, including user accounts and roles.",
  manager: "Approves contracts, renewals and spend across the portfolio.",
  accountant: "Deposits cheques, records payments and reconciles the rent roll.",
  leasing: "Prepares contracts, handles tenants and processes renewals.",
  maintenance: "Raises and progresses work orders on units.",
  viewer: "Reads everything, changes nothing.",
};

/**
 * Roles a person may request for themselves. Administrator is excluded on
 * purpose: it hands out permissions, so it can only ever be granted by someone
 * who already holds it.
 */
export const SIGNUP_ROLES: Role[] = ["leasing", "accountant", "maintenance", "manager", "viewer"];

export function can(role: Role, perm: Perm) {
  return ROLE_PERMS[role].includes(perm);
}

/** Actions that always need a second pair of eyes before they take effect. */
export const REQUIRES_APPROVAL: Record<string, string> = {
  new_contract: "New tenancy contracts must be approved by a manager before activation.",
  renewal: "Renewals must be approved by a manager before the new term starts.",
  rent_change: "Any change to agreed rent requires manager approval.",
  contract_termination: "Early termination requires manager approval.",
  cheque_hold: "Holding a cheque past its due date requires manager approval.",
  cheque_replacement: "Replacing a bounced or cancelled cheque requires manager approval.",
  maintenance_spend: "Maintenance spend above AED 1,000 requires manager approval.",
  refund: "Deposit refunds require manager approval.",
};

/* --------------------------------------------------------------- dashboard */

/**
 * Which blocks of the dashboard a role actually opens to.
 *
 * Permissions decide what a person *may* see; this decides what is *worth*
 * putting in front of them. An accountant may look at the unit mix, but their
 * morning is cheques and collection, and a dashboard that leads with viewings
 * makes them scroll past it every day.
 *
 * Both gates apply. A section listed here is still hidden when the role lacks
 * the permission behind it, so widening this list can never widen access —
 * that ordering is what keeps this a layout choice rather than a second,
 * competing security rule.
 */
export type DashSection =
  | "finance"
  | "revenue"
  | "unitRing"
  | "chequeRing"
  | "pipeline"
  | "tenancies"
  | "approvals"
  | "activity"
  | "agenda";

/** The permission each section is gated behind. */
export const DASH_PERM: Record<DashSection, Perm> = {
  finance: "cheques.view",
  revenue: "payments.view",
  unitRing: "properties.view",
  chequeRing: "cheques.view",
  pipeline: "visits.view",
  tenancies: "contracts.view",
  approvals: "approvals.view",
  activity: "audit.view",
  agenda: "visits.view",
};

const DASH: Record<Role, DashSection[]> = {
  admin: [
    "finance", "revenue", "unitRing", "chequeRing", "pipeline",
    "tenancies", "approvals", "activity", "agenda",
  ],
  manager: [
    "finance", "revenue", "unitRing", "chequeRing", "pipeline",
    "tenancies", "approvals", "activity", "agenda",
  ],
  // Money only. No viewings, no unit mix — neither is their work.
  accountant: ["finance", "revenue", "chequeRing", "approvals", "activity"],
  // The leasing funnel and the diary, with the unit mix they sell from.
  leasing: ["unitRing", "pipeline", "tenancies", "approvals", "agenda"],
  // Jobs and the buildings they happen in; no financial figures at all.
  maintenance: ["unitRing", "activity"],
  // Read-only oversight: the whole picture, none of the money detail.
  viewer: ["unitRing", "chequeRing", "pipeline", "tenancies", "approvals", "activity"],
};

/** True when this role's dashboard shows `section` and their role permits it. */
export function showsOnDashboard(role: Role, section: DashSection): boolean {
  return DASH[role].includes(section) && can(role, DASH_PERM[section]);
}
