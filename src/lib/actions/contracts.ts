"use server";

import { revalidatePath } from "next/cache";
import { requirePerm } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createContract, findUnit } from "@/lib/repos/contracts";
import { ConflictError } from "@/lib/repos/shared";
import { addDays, addYears } from "@/lib/utils";
import { ContractDraft, REQUIRED_DOCS, validateDraft } from "./contract-rules";
import { syncPendingTasks } from "@/lib/actions/task-sync";
import { syncPendingCheques } from "@/lib/actions/payment-sync";

type Result = { ok: true; href: string; message?: string } | { ok: false; message: string };

export async function createContractAction(payload: string): Promise<Result> {
  const user = await requirePerm("contracts.create");
  let draft: ContractDraft;
  try {
    draft = JSON.parse(payload) as ContractDraft;
  } catch {
    return { ok: false, message: "Could not read the form data. Please try again." };
  }

  const unit = await findUnit(draft.unitId);
  if (!unit) return { ok: false, message: "That unit no longer exists." };
  if (unit.status !== "vacant")
    return {
      ok: false,
      message:
        "That unit was taken by another employee while you were filling this in. Go back to step 1 and choose another unit.",
    };

  const problems = validateDraft(draft, { unitStatus: unit.status });
  if (problems.length) return { ok: false, message: problems[0] };

  const endDate = addDays(
    draft.termMonths === 12
      ? addYears(draft.startDate, 1)
      : draft.termMonths === 24
      ? addYears(draft.startDate, 2)
      : addDays(draft.startDate, 183),
    -1
  );

  let created;
  try {
    created = await createContract({
      unitId: draft.unitId,
      existingTenantId: draft.tenantMode === "new" ? undefined : draft.existingTenantId,
      newTenant:
        draft.tenantMode === "new"
          ? {
              name: draft.tenantName.trim(),
              kind: draft.tenantKind,
              emiratesId: draft.emiratesId.trim(),
              passportNo: draft.passportNo.trim(),
              nationality: draft.nationality,
              phone: draft.phone.replace(/\s/g, ""),
              email: draft.email.trim(),
              tradeLicense:
                draft.tenantKind === "company" ? draft.tradeLicense.trim() : undefined,
            }
          : undefined,
      startDate: draft.startDate,
      endDate,
      termMonths: draft.termMonths,
      annualRent: Number(draft.annualRent),
      securityDeposit: Number(draft.securityDeposit),
      commission: Number(draft.commission),
      ejariNo: draft.ejariNo.trim(),
      notes: draft.notes.trim(),
      cheques: draft.cheques.map((line) => ({
        chequeNo: line.chequeNo.trim(),
        bank: line.bank,
        amount: Number(line.amount),
        dueDate: line.dueDate,
      })),
      docs: REQUIRED_DOCS.map((doc) => ({
        key: doc.key,
        label: doc.label,
        provided: !!draft.docs[doc.key],
      })),
      createdBy: user.id,
      createdByName: user.name,
      now: new Date().toISOString(),
    });
  } catch (err) {
    // The unit hold is taken inside the same transaction, so losing the race
    // rolls the whole tenancy back rather than leaving a half-made contract.
    // Anything that is not a lost race is a real failure and must surface.
    if (!(err instanceof ConflictError)) throw err;
    return {
      ok: false,
      message:
        "That unit was taken by another employee while you were filling this in. Go back to step 1 and choose another unit.",
    };
  }

  await logAudit(user, "contract.created", "contract", created.id, `Submitted tenancy ${created.ref} for approval`, [
    { field: "unit", from: "vacant", to: unit.unitNo },
    { field: "annualRent", from: "—", to: String(draft.annualRent) },
    { field: "status", from: "—", to: "pending_approval" },
  ]);

  await syncPendingTasks();
  await syncPendingCheques();
  revalidatePath("/", "layout");
  return { ok: true, href: `/contracts/${created.id}?submitted=1` };
}
