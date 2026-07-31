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
  | "tasks.view"
  | "reports.view"
  | "audit.view"
  | "admin.users";

const ALL: Perm[] = [
  "dashboard.view", "properties.view", "properties.edit", "tenants.view", "tenants.edit",
  "contracts.view", "contracts.create", "contracts.terminate", "cheques.view", "cheques.deposit",
  "cheques.bounce", "payments.view", "renewals.view", "renewals.process", "maintenance.view",
  "maintenance.manage", "approvals.view", "approvals.decide", "tasks.view", "reports.view",
  "audit.view", "admin.users",
];

export const ROLE_PERMS: Record<Role, Perm[]> = {
  admin: ALL,
  manager: ALL.filter((p) => p !== "admin.users"),
  accountant: [
    "dashboard.view", "properties.view", "tenants.view", "contracts.view",
    "cheques.view", "cheques.deposit", "cheques.bounce", "payments.view",
    "renewals.view", "approvals.view", "tasks.view", "reports.view", "audit.view",
  ],
  leasing: [
    "dashboard.view", "properties.view", "tenants.view", "tenants.edit",
    "contracts.view", "contracts.create", "cheques.view", "payments.view",
    "renewals.view", "renewals.process", "maintenance.view", "approvals.view", "tasks.view",
  ],
  maintenance: [
    "dashboard.view", "properties.view", "tenants.view", "maintenance.view",
    "maintenance.manage", "tasks.view",
  ],
  viewer: [
    "dashboard.view", "properties.view", "tenants.view", "contracts.view", "cheques.view",
    "payments.view", "renewals.view", "maintenance.view", "approvals.view", "reports.view",
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
