export interface MaintenanceDraft {
  propertyId: string;
  unitId: string;
  tenantConfirmed: boolean;
  category: string;
  description: string;
  priority: "low" | "medium" | "high" | "emergency";
  reportedVia: "call" | "email" | "portal" | "walkin" | "";
  accessArrangement: "tenant_present" | "key_with_office" | "concierge" | "";
  accessNotes: string;
  safetyRisk: boolean;
  safetyNotes: string;
  vendor: string;
  quoteAmount: number;
  quoteAttached: boolean;
  confirmUnit: string;
}

export const CATEGORIES = [
  "Air Conditioning", "Plumbing", "Electrical", "Carpentry", "Painting",
  "Appliance Repair", "Pest Control", "Common Area", "Lift / Elevator",
  "Water Leakage", "Doors & Locks", "Civil / Structural",
];

export const VENDORS = [
  "In-house team",
  "Cool Breeze AC LLC",
  "AquaFix Plumbing",
  "BrightSpark Electrical",
  "PestGuard UAE",
  "Emirates Lift Services",
  "Perfect Finish Painting",
];

export const SLA_DAYS: Record<MaintenanceDraft["priority"], number> = {
  emergency: 1,
  high: 2,
  medium: 5,
  low: 10,
};

export const PRIORITY_HELP: Record<MaintenanceDraft["priority"], string> = {
  emergency: "Danger to people or property — flooding, exposed wiring, trapped in lift. Attend within 24 hours.",
  high: "Unit is not usable as normal — no AC in summer, no water, front door will not lock. Within 2 days.",
  medium: "Affects comfort but the unit is usable. Within 5 working days.",
  low: "Cosmetic or minor. Within 10 working days.",
};

/** Spend above this needs a manager before any work is committed. */
export const SPEND_APPROVAL_LIMIT = 1000;

export function maintenanceProblems(d: MaintenanceDraft, unitNo?: string) {
  const s: string[][] = [[], [], [], [], []];

  if (!d.propertyId) s[0].push("Select the building.");
  if (!d.unitId) s[0].push("Select the unit the problem is in.");
  if (!d.tenantConfirmed) s[0].push("Confirm you have identified the correct tenant for this unit.");
  if (!d.reportedVia) s[0].push("Record how the problem was reported.");

  if (!d.category) s[1].push("Select the category of work.");
  if (d.description.trim().length < 20)
    s[1].push("Describe the problem in at least 20 characters — the vendor works from this text.");
  if (!d.priority) s[1].push("Set the priority.");

  if (!d.accessArrangement) s[2].push("Record how the technician will get into the unit.");
  if (d.accessArrangement === "tenant_present" && d.accessNotes.trim().length < 5)
    s[2].push("Note the time window the tenant will be at home.");
  if (d.safetyRisk && d.safetyNotes.trim().length < 10)
    s[2].push("Describe the safety risk so the technician arrives prepared.");

  if (!d.vendor) s[3].push("Assign a vendor or the in-house team.");
  if (d.quoteAmount < 0) s[3].push("Estimated cost cannot be negative.");
  if (d.quoteAmount >= SPEND_APPROVAL_LIMIT && !d.quoteAttached)
    s[3].push(`Spend of AED ${SPEND_APPROVAL_LIMIT}+ needs a written quotation attached.`);

  if (unitNo && d.confirmUnit.trim().toLowerCase() !== unitNo.toLowerCase())
    s[4].push(`Type the unit number ${unitNo} to confirm you are raising this against the right unit.`);

  return s;
}
