"use server";

import { revalidatePath } from "next/cache";
import { requirePerm } from "@/lib/auth";
import { db, nextId, write } from "@/lib/store";
import { logAudit } from "@/lib/audit";
import { Cheque, Contract } from "@/lib/types";
import { addDays, addYears, today } from "@/lib/utils";
import { RENEWAL_DOCS, RenewalDraft, renewalProblems } from "./renewal-rules";

type Result = { ok: true; href: string; message?: string } | { ok: false; message: string };

export async function submitRenewalAction(payload: string): Promise<Result> {
  const user = await requirePerm("renewals.process");
  const draft = JSON.parse(payload) as RenewalDraft;

  const d = db();
  const old = d.contracts.find((c) => c.id === draft.contractId);
  if (!old) return { ok: false, message: "Contract not found." };
  if (old.status !== "active" && old.status !== "expiring")
    return { ok: false, message: `This contract is ${old.status} and cannot be renewed.` };

  const problems = renewalProblems(draft, {
    currentRent: old.annualRent,
    contractRef: old.ref,
    endDate: old.endDate,
  }).flat();
  if (problems.length) return { ok: false, message: problems[0] };

  const unit = d.units.find((u) => u.id === old.unitId)!;
  const tenant = d.tenants.find((t) => t.id === old.tenantId)!;
  const property = d.properties.find((p) => p.id === unit.propertyId);
  const now = new Date().toISOString();

  /* ------------------------------------------------ tenant is leaving ---- */
  if (draft.outcome === "not_renew") {
    const apId = nextId("approval", "AP");
    const ref = `APR-${apId.replace("AP", "").padStart(4, "0")}`;

    write((store) => {
      store.approvals.push({
        id: apId,
        ref,
        type: "contract_termination",
        title: `Non-renewal — ${unit.unitNo}, ${property?.name ?? ""}`,
        summary: `${tenant.name} · ends ${old.endDate} · ${draft.nonRenewalReason}`,
        entityType: "contract",
        entityId: old.id,
        amount: old.securityDeposit,
        requestedBy: user.id,
        requestedAt: now,
        status: "pending",
      });
      store.tasks.push({
        id: nextId("task", "TK"),
        title: `Move-out inspection — ${unit.unitNo}`,
        detail: `${tenant.name} vacating on ${old.endDate}. Meter readings, keys, deposit assessment.`,
        assignedTo: "U8",
        dueDate: old.endDate,
        status: "open",
        priority: "high",
        entityType: "contract",
        entityId: old.id,
        createdAt: now,
        source: "system",
      });
      store.tasks.push({
        id: nextId("task", "TK"),
        title: `Review approval ${ref}`,
        detail: `Non-renewal for ${unit.unitNo}`,
        assignedTo: "U2",
        dueDate: addDays(today(), 2),
        status: "open",
        priority: "high",
        entityType: "approval",
        entityId: apId,
        createdAt: now,
        source: "system",
      });
    });

    logAudit(user, "contract.non_renewal", "contract", old.id, `Submitted non-renewal for ${old.ref}`, [
      { field: "reason", from: "—", to: draft.nonRenewalReason },
    ]);

    revalidatePath("/", "layout");
    return { ok: true, href: `/contracts/${old.id}?nonrenewal=1` };
  }

  /* --------------------------------------------------- tenant renewing --- */
  const newId = nextId("contract", "C");

  write((store) => {
    const endDate = addDays(
      draft.termMonths === 12
        ? addYears(draft.startDate, 1)
        : draft.termMonths === 24
        ? addYears(draft.startDate, 2)
        : addDays(draft.startDate, 183),
      -1
    );

    const renewed: Contract = {
      id: newId,
      ref: `CTR-${draft.startDate.slice(0, 4)}-${newId.replace("C", "").padStart(4, "0")}`,
      unitId: old.unitId,
      tenantId: old.tenantId,
      startDate: draft.startDate,
      endDate,
      annualRent: Number(draft.newRent),
      chequeCount: draft.cheques.length,
      securityDeposit: old.securityDeposit,
      commission: 0,
      ejariNo: old.ejariNo,
      status: "pending_approval",
      createdBy: user.id,
      createdAt: now,
      documents: RENEWAL_DOCS.map((doc) => ({
        key: doc.key,
        label: doc.label,
        provided: !!draft.docs[doc.key],
        ref: `${doc.key}-${newId}.pdf`,
      })),
      notes: draft.notes.trim() || undefined,
      renewedFromId: old.id,
    };
    store.contracts.push(renewed);

    draft.cheques.forEach((line, i) => {
      const cheque: Cheque = {
        id: nextId("cheque", "CH"),
        contractId: newId,
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

    const apId = nextId("approval", "AP");
    const ref = `APR-${apId.replace("AP", "").padStart(4, "0")}`;
    const pct = old.annualRent ? ((Number(draft.newRent) - old.annualRent) / old.annualRent) * 100 : 0;

    store.approvals.push({
      id: apId,
      ref,
      type: "renewal",
      title: `Renewal — ${unit.unitNo}, ${property?.name ?? ""}`,
      summary: `${tenant.name} · AED ${old.annualRent.toLocaleString("en-US")} → AED ${Number(
        draft.newRent
      ).toLocaleString("en-US")} (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%) · ${draft.cheques.length} cheques`,
      entityType: "contract",
      entityId: newId,
      amount: Number(draft.newRent),
      requestedBy: user.id,
      requestedAt: now,
      status: "pending",
    });

    store.tasks.push({
      id: nextId("task", "TK"),
      title: `Review approval ${ref}`,
      detail: `Renewal for ${unit.unitNo} submitted by ${user.name}`,
      assignedTo: "U2",
      dueDate: addDays(today(), 2),
      status: "open",
      priority: "high",
      entityType: "approval",
      entityId: apId,
      createdAt: now,
      source: "system",
    });

    // close the renewal reminder that started this
    store.tasks
      .filter((t) => t.entityType === "contract" && t.entityId === old.id && t.status !== "done")
      .forEach((t) => {
        t.status = "done";
        t.completedAt = now;
      });
  });

  logAudit(user, "contract.renewal_submitted", "contract", newId, `Submitted renewal of ${old.ref}`, [
    { field: "annualRent", from: String(old.annualRent), to: String(draft.newRent) },
    { field: "term", from: "—", to: `${draft.termMonths} months` },
  ]);

  revalidatePath("/", "layout");
  return { ok: true, href: `/contracts/${newId}?submitted=1` };
}
