import { daysFromToday } from "@/lib/utils";

export interface DepositDraft {
  chequeId: string;
  retrieved: boolean;
  detailsMatch: boolean;
  dateMatch: boolean;
  bankAccount: string;
  depositSlipNo: string;
  depositDate: string;
  confirmChequeNo: string;
  method: "counter" | "atm" | "collection";
  note: string;
}

export interface BounceDraft {
  chequeId: string;
  returnDate: string;
  reason: string;
  bankMemoNo: string;
  bankCharges: number;
  tenantInformed: boolean;
  informedVia: "call" | "email" | "sms" | "visit" | "";
  replacementRequired: boolean;
  replacementDeadline: string;
  confirmChequeNo: string;
  note: string;
}

export const COMPANY_ACCOUNTS = [
  "FAB — Collections 1094 (main rent account)",
  "ADCB — Collections 5521",
  "Emirates NBD — Operations 3308",
  "ADIB — Deposits 7712",
];

export const BOUNCE_REASONS = [
  "Insufficient funds",
  "Account closed",
  "Signature mismatch",
  "Payment stopped by drawer",
  "Post-dated cheque presented early",
  "Amount in words differs from figures",
  "Cheque expired / stale dated",
  "Technical return by bank",
];

export function depositProblems(d: DepositDraft, cheque: { chequeNo: string; dueDate: string }) {
  const s: string[][] = [[], [], [], []];

  if (!d.retrieved) s[0].push("Confirm the original cheque has been taken out of the safe.");
  if (!d.detailsMatch) s[0].push("Confirm the cheque number, bank and amount match the record.");
  if (!d.dateMatch) s[0].push("Confirm the date written on the cheque matches the due date.");

  if (!d.bankAccount) s[1].push("Select the company account the cheque is going into.");
  if (!d.method) s[1].push("Select how the cheque was deposited.");
  if (!/^[A-Za-z0-9-]{4,20}$/.test(d.depositSlipNo.trim()))
    s[1].push("Enter the bank deposit slip / reference number.");
  if (!d.depositDate) s[1].push("Enter the date the cheque was deposited.");
  else if (daysFromToday(d.depositDate) > 0) s[1].push("Deposit date cannot be in the future.");
  else if (daysFromToday(d.depositDate) < -14)
    s[1].push("Deposit date is more than 14 days ago — ask a manager to record this instead.");

  if (d.confirmChequeNo.trim() !== cheque.chequeNo)
    s[2].push(`Type the cheque number ${cheque.chequeNo} exactly to confirm you have the right cheque.`);

  return s;
}

export function bounceProblems(d: BounceDraft, cheque: { chequeNo: string }) {
  const s: string[][] = [[], [], [], []];

  if (!d.returnDate) s[0].push("Enter the date the bank returned the cheque.");
  else if (daysFromToday(d.returnDate) > 0) s[0].push("Return date cannot be in the future.");
  if (!d.reason) s[0].push("Select the reason given by the bank.");
  if (!/^[A-Za-z0-9-]{3,20}$/.test(d.bankMemoNo.trim()))
    s[0].push("Enter the bank return memo reference.");

  if (d.bankCharges < 0) s[1].push("Bank charges cannot be negative.");

  if (!d.tenantInformed) s[2].push("Confirm the tenant has been informed of the returned cheque.");
  if (!d.informedVia) s[2].push("Record how the tenant was informed.");
  if (d.replacementRequired && !d.replacementDeadline)
    s[2].push("Set the deadline for the replacement cheque.");

  if (d.confirmChequeNo.trim() !== cheque.chequeNo)
    s[3].push(`Type the cheque number ${cheque.chequeNo} exactly to confirm.`);

  return s;
}
