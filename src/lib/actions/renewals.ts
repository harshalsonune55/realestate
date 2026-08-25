"use server";

import { revalidatePath } from "next/cache";
import { requirePerm } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { findContract } from "@/lib/repos/contracts";
import { renewalContext, submitNonRenewal, submitRenewal } from "@/lib/repos/renewals";
import { addDays, addYears } from "@/lib/utils";
import { RENEWAL_DOCS, RenewalDraft, renewalProblems } from "./renewal-rules";
import { syncPendingTasks } from "@/lib/actions/task-sync";
import { syncPendingCheques } from "@/lib/actions/payment-sync";

type Result = { ok: true; href: string; message?: string } | { ok: false; message: string };

export async function submitRenewalAction(payload: string): Promise<Result> {
  const user = await requirePerm("renewals.process");
  const draft = JSON.parse(payload) as RenewalDraft;

  const old = await findContract(draft.contractId);
  if (!old) return { ok: false, message: "Contract not found." };
  if (old.status !== "active" && old.status !== "expiring")
    return { ok: false, message: `This contract is ${old.status} and cannot be renewed.` };

  const problems = renewalProblems(draft, {
    currentRent: old.annualRent,
    contractRef: old.ref,
    endDate: old.endDate,
  }).flat();
  if (problems.length) return { ok: false, message: problems[0] };

  const ctx = await renewalContext(old.id);
  if (!ctx) return { ok: false, message: "This contract is missing its unit or tenant." };
  const now = new Date().toISOString();

  /* ------------------------------------------------ tenant is leaving ---- */
  if (draft.outcome === "not_renew") {
    await submitNonRenewal({
      contractId: old.id,
      unitNo: ctx.unitNo,
      propertyName: ctx.propertyName,
      tenantName: ctx.tenantName,
      endDate: old.endDate,
      securityDeposit: old.securityDeposit,
      reason: draft.nonRenewalReason,
      requestedBy: user.id,
      now,
    });

    await logAudit(user, "contract.non_renewal", "contract", old.id, `Submitted non-renewal for ${old.ref}`, [
      { field: "reason", from: "—", to: draft.nonRenewalReason },
    ]);

    await syncPendingTasks();
  await syncPendingCheques();
    revalidatePath("/", "layout");
    return { ok: true, href: `/contracts/${old.id}?nonrenewal=1` };
  }

  /* --------------------------------------------------- tenant renewing --- */
  const endDate = addDays(
    draft.termMonths === 12
      ? addYears(draft.startDate, 1)
      : draft.termMonths === 24
      ? addYears(draft.startDate, 2)
      : addDays(draft.startDate, 183),
    -1
  );

  const created = await submitRenewal({
    previousId: old.id,
    previousRef: old.ref,
    unitId: ctx.unitId,
    unitNo: ctx.unitNo,
    propertyName: ctx.propertyName,
    tenantId: ctx.tenantId,
    tenantName: ctx.tenantName,
    startDate: draft.startDate,
    endDate,
    termMonths: draft.termMonths,
    previousRent: old.annualRent,
    newRent: Number(draft.newRent),
    securityDeposit: old.securityDeposit,
    ejariNo: old.ejariNo,
    notes: draft.notes.trim(),
    cheques: draft.cheques.map((line) => ({
      chequeNo: line.chequeNo.trim(),
      bank: line.bank,
      amount: Number(line.amount),
      dueDate: line.dueDate,
    })),
    docs: RENEWAL_DOCS.map((doc) => ({
      key: doc.key,
      label: doc.label,
      provided: !!draft.docs[doc.key],
    })),
    createdBy: user.id,
    createdByName: user.name,
    now,
  });

  await logAudit(user, "contract.renewal_submitted", "contract", created.id, `Submitted renewal of ${old.ref}`, [
    { field: "annualRent", from: String(old.annualRent), to: String(draft.newRent) },
    { field: "term", from: "—", to: `${draft.termMonths} months` },
  ]);

  await syncPendingTasks();
  await syncPendingCheques();
  revalidatePath("/", "layout");
  return { ok: true, href: `/contracts/${created.id}?submitted=1` };
}
