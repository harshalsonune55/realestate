"use server";

import { revalidatePath } from "next/cache";
import { requirePerm } from "@/lib/auth";
import { db, nextId, write } from "@/lib/store";
import { logAudit } from "@/lib/audit";
import { Cheque, Contract, DocumentItem, Tenant } from "@/lib/types";
import { addDays, addYears } from "@/lib/utils";
import { ContractDraft, REQUIRED_DOCS, validateDraft } from "./contract-rules";

type Result = { ok: true; href: string; message?: string } | { ok: false; message: string };

export async function createContractAction(payload: string): Promise<Result> {
  const user = await requirePerm("contracts.create");
  let draft: ContractDraft;
  try {
    draft = JSON.parse(payload) as ContractDraft;
  } catch {
    return { ok: false, message: "Could not read the form data. Please try again." };
  }

  const d = db();
  const unit = d.units.find((u) => u.id === draft.unitId);
  if (!unit) return { ok: false, message: "That unit no longer exists." };
  if (unit.status !== "vacant")
    return {
      ok: false,
      message:
        "That unit was taken by another employee while you were filling this in. Go back to step 1 and choose another unit.",
    };

  const problems = validateDraft(draft, { unitStatus: unit.status });
  if (problems.length) return { ok: false, message: problems[0] };

  const contractId = nextId("contract", "C");
  const now = new Date().toISOString();

  const created = write((store) => {
    // 1. tenant record
    let tenantId = draft.existingTenantId;
    if (draft.tenantMode === "new") {
      const tenant: Tenant = {
        id: nextId("tenant", "T"),
        name: draft.tenantName.trim(),
        kind: draft.tenantKind,
        emiratesId: draft.emiratesId.trim(),
        passportNo: draft.passportNo.trim(),
        nationality: draft.nationality,
        phone: draft.phone.replace(/\s/g, ""),
        email: draft.email.trim(),
        tradeLicense: draft.tenantKind === "company" ? draft.tradeLicense.trim() : undefined,
        createdAt: now,
      };
      store.tenants.push(tenant);
      tenantId = tenant.id;
    }

    const documents: DocumentItem[] = REQUIRED_DOCS.map((doc) => ({
      key: doc.key,
      label: doc.label,
      provided: !!draft.docs[doc.key],
      ref: `${doc.key}-${contractId}.pdf`,
    }));

    // 2. contract is created pending approval — it never goes live on its own
    const contract: Contract = {
      id: contractId,
      ref: `CTR-${draft.startDate.slice(0, 4)}-${contractId.replace("C", "").padStart(4, "0")}`,
      unitId: draft.unitId,
      tenantId,
      startDate: draft.startDate,
      endDate: addDays(
        draft.termMonths === 12
          ? addYears(draft.startDate, 1)
          : draft.termMonths === 24
          ? addYears(draft.startDate, 2)
          : addDays(draft.startDate, 183),
        -1
      ),
      annualRent: Number(draft.annualRent),
      chequeCount: draft.cheques.length,
      securityDeposit: Number(draft.securityDeposit),
      commission: Number(draft.commission),
      ejariNo: draft.ejariNo.trim(),
      status: "pending_approval",
      createdBy: user.id,
      createdAt: now,
      documents,
      notes: draft.notes.trim() || undefined,
    };
    store.contracts.push(contract);

    // 3. cheque schedule
    draft.cheques.forEach((line, i) => {
      const cheque: Cheque = {
        id: nextId("cheque", "CH"),
        contractId,
        seq: i + 1,
        ofTotal: draft.cheques.length,
        chequeNo: line.chequeNo.trim(),
        bank: line.bank,
        amount: Number(line.amount),
        dueDate: line.dueDate,
        status: "pending",
      };
      store.cheques.push(cheque);
    });

    // 4. hold the unit so no one else can lease it
    const u = store.units.find((x) => x.id === draft.unitId)!;
    u.status = "reserved";

    // 5. raise the approval
    const approvalId = nextId("approval", "AP");
    const approvalRef = `APR-${approvalId.replace("AP", "").padStart(4, "0")}`;
    const property = store.properties.find((p) => p.id === u.propertyId);
    const tenantName =
      draft.tenantMode === "new"
        ? draft.tenantName.trim()
        : store.tenants.find((t) => t.id === tenantId)?.name ?? "";

    store.approvals.push({
      id: approvalId,
      ref: approvalRef,
      type: "new_contract",
      title: `New tenancy — ${u.unitNo}, ${property?.name ?? ""}`,
      summary: `${tenantName} · ${draft.termMonths} months · AED ${Number(
        draft.annualRent
      ).toLocaleString("en-US")} · ${draft.cheques.length} cheques`,
      entityType: "contract",
      entityId: contractId,
      amount: Number(draft.annualRent),
      requestedBy: user.id,
      requestedAt: now,
      status: "pending",
    });

    // 6. and put it on a manager's task list
    store.tasks.push({
      id: nextId("task", "TK"),
      title: `Review approval ${approvalRef}`,
      detail: `New tenancy for ${u.unitNo} submitted by ${user.name}`,
      assignedTo: "U2",
      dueDate: addDays(now.slice(0, 10), 2),
      status: "open",
      priority: "high",
      entityType: "approval",
      entityId: approvalId,
      createdAt: now,
      source: "system",
    });

    return contract;
  });

  logAudit(user, "contract.created", "contract", contractId, `Submitted tenancy ${created.ref} for approval`, [
    { field: "unit", from: "vacant", to: unit.unitNo },
    { field: "annualRent", from: "—", to: String(draft.annualRent) },
    { field: "status", from: "—", to: "pending_approval" },
  ]);

  revalidatePath("/", "layout");
  return { ok: true, href: `/contracts/${contractId}?submitted=1` };
}

