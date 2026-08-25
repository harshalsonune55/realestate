// Domain model for the property management system.
// Everything is stored as plain JSON so the prototype can run with no database.

export type Role =
  | "admin"
  | "manager"
  | "accountant"
  | "leasing"
  | "maintenance"
  | "viewer";

/**
 * Signups land as `pending` and cannot sign in until an administrator approves
 * them — otherwise anyone who reaches the URL could enrol themselves into the
 * company's live tenancy data.
 */
export type UserStatus = "pending" | "active" | "suspended";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string;
  /** Whether the account may sign in. Pending and declined accounts are false. */
  active: boolean;
  phone?: string;
  /** Absent on the seeded demo accounts, which are active by definition. */
  status?: UserStatus;
  /** scrypt hash; absent on demo accounts, which sign in by one-click selection. */
  passwordHash?: string;
  /** The role the person asked for at signup — the admin decides the real one. */
  requestedRole?: Role;
  createdAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  declinedBy?: string;
  declinedAt?: string;
  declineReason?: string;
  lastLoginAt?: string;
}

/** Seeded accounts predate the status field; they are active by definition. */
export const userStatus = (u: User): UserStatus =>
  u.status ?? (u.active ? "active" : "suspended");

export interface Property {
  id: string;
  name: string;
  code: string;
  address: string;
  city: string;
  area: string;
  owner: string;
  floors: number;
  yearBuilt: number;
  managerId: string;
}

export type UnitStatus = "vacant" | "occupied" | "reserved" | "maintenance";
export type UnitType = "Studio" | "1BR" | "2BR" | "3BR" | "Retail" | "Office";

export interface Unit {
  id: string;
  propertyId: string;
  unitNo: string;
  floor: number;
  type: UnitType;
  sizeSqft: number;
  bathrooms: number;
  marketRent: number;
  status: UnitStatus;
  parkingSlots: number;
}

export interface Tenant {
  id: string;
  name: string;
  kind: "individual" | "company";
  emiratesId: string;
  passportNo: string;
  nationality: string;
  phone: string;
  email: string;
  tradeLicense?: string;
  createdAt: string;
}

export type ContractStatus =
  | "draft"
  | "pending_approval"
  | "active"
  | "expiring"
  | "renewed"
  | "terminated"
  | "rejected";

export interface Contract {
  id: string;
  ref: string;
  unitId: string;
  tenantId: string;
  startDate: string;
  endDate: string;
  annualRent: number;
  chequeCount: number;
  securityDeposit: number;
  commission: number;
  ejariNo: string;
  status: ContractStatus;
  createdBy: string;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  documents: DocumentItem[];
  notes?: string;
  renewedFromId?: string;
  terminationReason?: string;
}

export interface DocumentItem {
  key: string;
  label: string;
  provided: boolean;
  ref?: string;
}

export type ChequeStatus =
  | "pending"
  | "deposited"
  | "cleared"
  | "bounced"
  | "replaced"
  | "cancelled";

export interface Cheque {
  id: string;
  contractId: string;
  seq: number;
  ofTotal: number;
  chequeNo: string;
  bank: string;
  amount: number;
  dueDate: string;
  status: ChequeStatus;
  depositedAt?: string;
  depositedBy?: string;
  depositSlipNo?: string;
  clearedAt?: string;
  bouncedAt?: string;
  bounceReason?: string;
  replacedByChequeId?: string;
  heldReason?: string;
  /** Draft `account.payment` id in Odoo, once the mirror has landed. */
  odooPaymentId?: number;
  odooSyncedAt?: string;
  odooError?: string;
}

export type PaymentMethod = "cheque" | "cash" | "bank_transfer" | "card";

export interface Payment {
  id: string;
  receiptNo: string;
  contractId: string;
  chequeId?: string;
  amount: number;
  method: PaymentMethod;
  category: "rent" | "deposit" | "commission" | "fees" | "maintenance";
  receivedAt: string;
  receivedBy: string;
  reference: string;
  /** Draft `account.payment` id in Odoo, once the mirror has landed. */
  odooPaymentId?: number;
  odooSyncedAt?: string;
  odooError?: string;
}

export type MaintenanceStatus =
  | "new"
  | "assigned"
  | "in_progress"
  | "awaiting_approval"
  | "completed"
  | "closed"
  | "rejected";

export interface MaintenanceRequest {
  id: string;
  ref: string;
  unitId: string;
  tenantId?: string;
  category: string;
  priority: "low" | "medium" | "high" | "emergency";
  description: string;
  status: MaintenanceStatus;
  reportedAt: string;
  reportedBy: string;
  assignedTo?: string;
  vendor?: string;
  quoteAmount?: number;
  completedAt?: string;
  slaDueAt: string;
  resolutionNotes?: string;
}

export type ApprovalType =
  | "new_contract"
  | "renewal"
  | "rent_change"
  | "contract_termination"
  | "cheque_hold"
  | "cheque_replacement"
  | "maintenance_spend"
  | "refund";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface Approval {
  id: string;
  ref: string;
  type: ApprovalType;
  title: string;
  summary: string;
  entityType: string;
  entityId: string;
  amount?: number;
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  status: ApprovalStatus;
  decisionNote?: string;
}

export type TaskStatus = "open" | "in_progress" | "done" | "overdue";

export interface Task {
  id: string;
  title: string;
  detail: string;
  assignedTo: string;
  dueDate: string;
  status: TaskStatus;
  priority: "low" | "medium" | "high";
  entityType?: string;
  entityId?: string;
  createdAt: string;
  completedAt?: string;
  source: "system" | "manual";
  /** `mail.activity` id in Odoo, once the follow-up mirror has landed. */
  odooTaskId?: number;
  odooSyncedAt?: string;
  /** Why the last push failed. Present means Odoo is behind, not the task. */
  odooError?: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  actorId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  changes?: { field: string; from: string; to: string }[];
  ip: string;
}


export type VisitStatus = "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show";
export type VisitOutcome = "" | "interested" | "not_interested" | "offer_made";

/** A property viewing: a person, a unit, and a slot in the diary. */
export interface Visit {
  id: string;
  ref: string;
  propertyId: string;
  unitId: string;
  /** Set when the visitor is already a tenant on file. */
  tenantId?: string;
  visitorName: string;
  visitorPhone: string;
  visitorEmail?: string;
  /** UTC instant. The form collects Gulf wall-clock time and converts. */
  startsAt: string;
  durationMins: number;
  status: VisitStatus;
  outcome: VisitOutcome;
  notes: string;
  bookedBy: string;
  createdAt: string;
  /** `calendar.event` id in Odoo, once the mirror has landed. */
  odooEventId?: number;
  odooSyncedAt?: string;
  /** Why the last push failed. Present means the calendar is behind. */
  odooError?: string;
}

/**
 * A span of time an employee had the app open.
 *
 * `lastSeenAt` is what makes the figure honest. Closing a tab never signs
 * anybody out, so a span measured to its sign-out would run until the cookie
 * expired; measured to its last heartbeat, it stops when the person actually
 * stopped. `endedReason` keeps the two apart, because only a deliberate sign
 * out is a real end time — an idle span merely ran out of evidence.
 */
export interface WorkSession {
  id: string;
  userId: string;
  startedAt: string;
  lastSeenAt: string;
  /** Absent while the span is still open. */
  endedAt?: string;
  endedReason?: "signed_out" | "idle";
  userAgent?: string;
}

export interface DB {
  users: User[];
  properties: Property[];
  units: Unit[];
  tenants: Tenant[];
  contracts: Contract[];
  cheques: Cheque[];
  payments: Payment[];
  maintenance: MaintenanceRequest[];
  approvals: Approval[];
  tasks: Task[];
  audit: AuditEntry[];
  /** Optional: files written before viewings existed have no such key. */
  visits?: Visit[];
  /** Optional: files written before time tracking existed have no such key. */
  workSessions?: WorkSession[];
  counters: Record<string, number>;
}
