// Rules shared by the client wizard and the server action, so what the employee
// sees on screen is exactly what the server enforces.

import { daysFromToday } from "@/lib/utils";

export interface ChequeLine {
  chequeNo: string;
  bank: string;
  amount: number;
  dueDate: string;
}

export interface ContractDraft {
  propertyId: string;
  unitId: string;
  tenantMode: "new" | "existing";
  existingTenantId: string;
  tenantKind: "individual" | "company";
  tenantName: string;
  emiratesId: string;
  passportNo: string;
  nationality: string;
  phone: string;
  email: string;
  tradeLicense: string;
  startDate: string;
  termMonths: number;
  annualRent: number;
  chequeCount: number;
  cheques: ChequeLine[];
  securityDeposit: number;
  commission: number;
  ejariNo: string;
  docs: Record<string, boolean>;
  checks: Record<string, boolean>;
  notes: string;
  /** Typed confirmation on the last step. */
  confirmName: string;
  /** Resolved tenant name the confirmation is checked against. */
  confirmTargetName?: string;
}

export const BANKS = [
  "ADCB", "FAB", "Emirates NBD", "ADIB", "Mashreq", "RAKBANK", "DIB", "HSBC",
  "CBD", "Emirates Islamic", "Sharjah Islamic Bank", "Standard Chartered",
];

export const NATIONALITIES = [
  "UAE", "India", "Pakistan", "Philippines", "Egypt", "Jordan", "Syria", "Lebanon",
  "Bangladesh", "Sri Lanka", "Nepal", "UK", "USA", "Canada", "Australia", "Russia",
  "Sudan", "Morocco", "Tunisia", "Nigeria", "South Africa", "Other",
];

export const REQUIRED_DOCS = [
  { key: "eid", label: "Emirates ID — front and back", detail: "Must still be valid on the contract start date." },
  { key: "passport", label: "Passport copy", detail: "Photo page, clearly readable." },
  { key: "visa", label: "Residence visa page", detail: "For companies: trade licence and establishment card." },
  { key: "contract", label: "Signed tenancy contract", detail: "Signed by the tenant and by the company representative." },
  { key: "chequeImages", label: "Scans of every cheque", detail: "One image per cheque, front side, matching step 4." },
  { key: "deposit", label: "Security deposit receipt", detail: "Bank transfer slip or numbered cash receipt." },
];

export const COMPLIANCE_CHECKS = [
  { key: "idVerified", label: "Original Emirates ID checked against the copy", detail: "You are confirming you saw the original document." },
  { key: "inspection", label: "Unit inspected and handover checklist completed", detail: "Meter readings, keys and unit condition recorded." },
  { key: "noDues", label: "No outstanding dues on the unit", detail: "ADDC/DEWA, service charges and any previous tenant balance cleared." },
  { key: "ejari", label: "Tenancy registration (Ejari / Tawtheeq) submitted", detail: "Registration number captured in step 3." },
  { key: "chequesHeld", label: "All original cheques received and placed in the safe", detail: "Physically counted against the schedule in step 4." },
];

export const TERMS = [
  { value: 12, label: "12 months", detail: "Standard annual tenancy" },
  { value: 6, label: "6 months", detail: "Short term — needs manager approval" },
  { value: 24, label: "24 months", detail: "Two-year tenancy" },
];

/* ------------------------------------------------------------- validators */

export const validEid = (v: string) => /^784-\d{4}-\d{7}-\d$/.test(v.trim());
export const validPhone = (v: string) => /^\+9715\d{8}$/.test(v.replace(/[\s-]/g, ""));
export const validEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v.trim());
export const validChequeNo = (v: string) => /^\d{4,9}$/.test(v.trim());

export function chequeTotal(lines: ChequeLine[]) {
  return lines.reduce((s, c) => s + (Number(c.amount) || 0), 0);
}

/** Per-step problems. Index matches the wizard step order. */
export function stepProblems(d: ContractDraft, opts: { unitStatus?: string } = {}) {
  const s: string[][] = [[], [], [], [], [], [], [], []];

  // 1 — unit
  if (!d.propertyId) s[0].push("Choose the building.");
  if (!d.unitId) s[0].push("Choose a vacant unit.");
  else if (opts.unitStatus && opts.unitStatus !== "vacant")
    s[0].push("That unit is no longer vacant — choose another one.");

  // 2 — tenant
  if (d.tenantMode === "existing") {
    if (!d.existingTenantId) s[1].push("Select the existing tenant record.");
  } else {
    if (d.tenantName.trim().length < 3) s[1].push("Enter the tenant's full legal name.");
    if (!validEid(d.emiratesId)) s[1].push("Emirates ID must look like 784-1990-1234567-1.");
    if (d.passportNo.trim().length < 5) s[1].push("Enter the passport number.");
    if (!d.nationality) s[1].push("Select the nationality.");
    if (!validPhone(d.phone)) s[1].push("Mobile must be a UAE number, e.g. +971501234567.");
    if (!validEmail(d.email)) s[1].push("Enter a valid email address.");
    if (d.tenantKind === "company" && d.tradeLicense.trim().length < 4)
      s[1].push("Enter the company trade licence number.");
  }

  // 3 — terms
  if (!d.startDate) s[2].push("Choose the contract start date.");
  else if (daysFromToday(d.startDate) < -30)
    s[2].push("Start date cannot be more than 30 days in the past.");
  if (!TERMS.some((t) => t.value === d.termMonths)) s[2].push("Choose the contract term.");
  if (!d.annualRent || Number(d.annualRent) < 1000) s[2].push("Enter the agreed annual rent.");
  if (!/^\d{6,14}$/.test(d.ejariNo.trim()))
    s[2].push("Enter the Ejari / Tawtheeq registration number (digits only).");

  // 4 — cheque schedule
  if (!d.cheques.length) s[3].push("Generate the cheque schedule.");
  d.cheques.forEach((c, i) => {
    if (!validChequeNo(c.chequeNo)) s[3].push(`Cheque ${i + 1}: cheque number must be 4–9 digits.`);
    if (!c.bank) s[3].push(`Cheque ${i + 1}: select the bank.`);
    if (!c.dueDate) s[3].push(`Cheque ${i + 1}: set the due date.`);
    if (!Number(c.amount)) s[3].push(`Cheque ${i + 1}: enter the amount.`);
  });
  const keys = d.cheques.map((c) => c.chequeNo.trim() + "|" + c.bank).filter((k) => k.length > 2);
  if (new Set(keys).size !== keys.length)
    s[3].push("Two cheques share the same number at the same bank.");
  const total = chequeTotal(d.cheques);
  if (d.cheques.length && total !== Number(d.annualRent)) {
    const diff = Number(d.annualRent) - total;
    s[3].push(
      `Cheques add up to AED ${total.toLocaleString("en-US")}. That is AED ${Math.abs(diff).toLocaleString("en-US")} ${
        diff > 0 ? "short of" : "more than"
      } the annual rent.`
    );
  }

  // 5 — money
  if (!Number(d.securityDeposit)) s[4].push("Enter the security deposit collected.");
  if (Number(d.securityDeposit) < Number(d.annualRent) * 0.04)
    s[4].push("Security deposit is below the company minimum of 5% of annual rent.");
  if (Number(d.commission) < 0) s[4].push("Commission cannot be negative.");

  // 6 — documents
  REQUIRED_DOCS.forEach((doc) => {
    if (!d.docs[doc.key]) s[5].push(`Not attached: ${doc.label}.`);
  });

  // 7 — compliance
  COMPLIANCE_CHECKS.forEach((c) => {
    if (!d.checks[c.key]) s[6].push(`Not confirmed: ${c.label}.`);
  });

  // 8 — review
  const expected =
    d.tenantMode === "new" ? d.tenantName.trim() : (d.confirmTargetName ?? "").trim();
  if (!expected) s[7].push("Tenant name is missing from earlier steps.");
  else if (d.confirmName.trim().toLowerCase() !== expected.toLowerCase())
    s[7].push("Type the tenant's name exactly as shown to confirm you have checked every detail.");

  return s;
}

/** Flattened check used by the server before anything is written. */
export function validateDraft(d: ContractDraft, opts: { unitStatus?: string } = {}) {
  return stepProblems(d, opts).flat();
}
