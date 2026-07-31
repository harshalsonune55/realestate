import { notFound, redirect } from "next/navigation";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/store";
import DepositWizard from "./DepositWizard";

export const dynamic = "force-dynamic";

export default async function DepositPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePerm("cheques.deposit");
  const { id } = await params;

  const d = db();
  const cheque = d.cheques.find((c) => c.id === id);
  if (!cheque) notFound();
  if (cheque.status !== "pending") redirect(`/cheques/${id}`);

  const contract = d.contracts.find((c) => c.id === cheque.contractId)!;
  const tenant = d.tenants.find((t) => t.id === contract.tenantId)!;
  const unit = d.units.find((u) => u.id === contract.unitId)!;
  const property = d.properties.find((p) => p.id === unit.propertyId)!;

  return (
    <DepositWizard
      cheque={{
        id: cheque.id,
        chequeNo: cheque.chequeNo,
        bank: cheque.bank,
        amount: cheque.amount,
        dueDate: cheque.dueDate,
        seq: cheque.seq,
        ofTotal: cheque.ofTotal,
        tenantName: tenant.name,
        unitLabel: `${unit.unitNo}, ${property.name}`,
        contractRef: contract.ref,
      }}
    />
  );
}
