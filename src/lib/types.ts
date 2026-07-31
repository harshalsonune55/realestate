// Domain model for the property management system.
// Everything is stored as plain JSON so the prototype can run with no database.

export type Role =
  | "admin"
  | "manager"
  | "accountant"
  | "leasing"
  | "maintenance"
  | "viewer";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string;
  active: boolean;
}

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
  counters: Record<string, number>;
}
