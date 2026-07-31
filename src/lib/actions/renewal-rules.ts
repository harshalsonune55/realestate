import { daysFromToday } from "@/lib/utils";

export interface RenewalChequeLine {
  chequeNo: string;
  bank: string;
  amount: number;
  dueDate: string;
}

export interface RenewalDraft {
  contractId: string;
  reviewedHistory: boolean;
  reviewedMaintenance: boolean;
  outcome: "renew" | "not_renew" | "";
  nonRenewalReason: string;
  noticeServed: boolean;
  newRent: number;
  rentJustification: string;
  startDate: string;
  termMonths: number;
  chequeCount: number;
  cheques: RenewalChequeLine[];
  tenantAgreed: boolean;
  agreedVia: "email" | "signed" | "whatsapp" | "";
  docs: Record<string, boolean>;
  confirmRef: string;
  notes: string;
}

/** Cap modelled on the Abu Dhabi / Dubai rent-increase conventions. */
export const MAX_INCREASE_PCT = 0.05;

export const RENEWAL_DOCS = [
  { key: "renewalAddendum", label: "Signed renewal addendum", detail: "Both parties signed, dated before the new term." },
  { key: "eid", label: "Updated Emirates ID copy", detail: "Valid for the whole of the new term." },
  { key: "ejari", label: "Renewed Ejari / Tawtheeq certificate", detail: "Registration renewed for the new period." },
  { key: "cheques", label: "Scans of the new cheques", detail: "One image per cheque, matching the schedule." },
];

export const NON_RENEWAL_REASONS = [
  "Tenant is vacating by choice",
  "Owner requires the unit",
  "Repeated late or bounced payments",
  "Breach of tenancy terms",
  "Unit scheduled for major refurbishment",
  "Tenant relocating outside the UAE",
];

export function renewalProblems(
  d: RenewalDraft,
  ctx: { currentRent: number; contractRef: string; endDate: string }
) {
  const s: string[][] = [[], [], [], [], [], []];

  // 1 — review
  if (!d.reviewedHistory) s[0].push("Confirm you have reviewed the payment history for this tenancy.");
  if (!d.reviewedMaintenance) s[0].push("Confirm you have reviewed open maintenance on the unit.");

  // 2 — outcome
  if (!d.outcome) s[1].push("Choose whether the tenancy is being renewed.");
  if (d.outcome === "not_renew") {
    if (!d.nonRenewalReason) s[1].push("Select the reason for not renewing.");
    if (!d.noticeServed)
      s[1].push("Confirm the 90-day non-renewal notice has been served to the tenant in writing.");
  }

  // 3 — terms (only when renewing)
  if (d.outcome === "renew") {
    if (!d.newRent || d.newRent < 1000) s[2].push("Enter the new annual rent.");
    const increase = ctx.currentRent ? (d.newRent - ctx.currentRent) / ctx.currentRent : 0;
    if (increase > MAX_INCREASE_PCT && d.rentJustification.trim().length < 15)
      s[2].push(
        `Increase of ${(increase * 100).toFixed(1)}% is above the ${(MAX_INCREASE_PCT * 100).toFixed(
          0
        )}% cap — write a justification of at least 15 characters.`
      );
    if (!d.startDate) s[2].push("Set the start date of the new term.");
    if (![6, 12, 24].includes(d.termMonths)) s[2].push("Choose the new term length.");

    // 4 — cheques
    if (!d.cheques.length) s[3].push("Generate the new cheque schedule.");
    d.cheques.forEach((c, i) => {
      if (!/^\d{4,9}$/.test(c.chequeNo.trim())) s[3].push(`Cheque ${i + 1}: cheque number must be 4–9 digits.`);
      if (!c.bank) s[3].push(`Cheque ${i + 1}: select the bank.`);
      if (!c.dueDate) s[3].push(`Cheque ${i + 1}: set the due date.`);
      if (!Number(c.amount)) s[3].push(`Cheque ${i + 1}: enter the amount.`);
    });
    const total = d.cheques.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    if (d.cheques.length && total !== Number(d.newRent)) {
      const diff = Number(d.newRent) - total;
      s[3].push(
        `Cheques total AED ${total.toLocaleString("en-US")} — ${diff > 0 ? "short by" : "over by"} AED ${Math.abs(
          diff
        ).toLocaleString("en-US")}.`
      );
    }

    // 5 — agreement and documents
    if (!d.tenantAgreed) s[4].push("Confirm the tenant has accepted the new terms.");
    if (!d.agreedVia) s[4].push("Record how the tenant confirmed acceptance.");
    RENEWAL_DOCS.forEach((doc) => {
      if (!d.docs[doc.key]) s[4].push(`Not attached: ${doc.label}.`);
    });
  } else if (d.outcome === "not_renew") {
    if (!d.tenantAgreed) s[4].push("Confirm the tenant has acknowledged the non-renewal.");
    if (!d.docs.moveOutBooked) s[4].push("Book the move-out inspection date.");
  }

  // 6 — confirm
  if (d.confirmRef.trim().toUpperCase() !== ctx.contractRef.toUpperCase())
    s[5].push(`Type the contract reference ${ctx.contractRef} exactly to confirm.`);
  if (daysFromToday(ctx.endDate) < -30)
    s[5].push("This contract expired more than 30 days ago — a manager must handle it.");

  return s;
}
