import { notFound, redirect } from "next/navigation";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/store";
import { addDays, daysFromToday } from "@/lib/utils";
import RenewalWizard, { RenewalContext } from "./RenewalWizard";

export const dynamic = "force-dynamic";

export default async function RenewalPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePerm("renewals.process");
  const { id } = await params;

  const d = db();
  const contract = d.contracts.find((c) => c.id === id);
  if (!contract) notFound();
  if (contract.status !== "active" && contract.status !== "expiring") redirect(`/contracts/${id}`);

  const unit = d.units.find((u) => u.id === contract.unitId)!;
  const property = d.properties.find((p) => p.id === unit.propertyId)!;
  const tenant = d.tenants.find((t) => t.id === contract.tenantId)!;
  const cheques = d.cheques.filter((c) => c.contractId === contract.id);

  const ctx: RenewalContext = {
    contractId: contract.id,
    contractRef: contract.ref,
    tenantName: tenant.name,
    unitLabel: `${unit.unitNo}, ${property.name}`,
    currentRent: contract.annualRent,
    startDate: contract.startDate,
    endDate: contract.endDate,
    marketRent: unit.marketRent,
    newStartDate: addDays(contract.endDate, 1),
    history: {
      total: cheques.length,
      cleared: cheques.filter((c) => c.status === "cleared").length,
      bounced: cheques.filter((c) => c.status === "bounced").length,
      late: cheques.filter(
        (c) => c.depositedAt && c.depositedAt > c.dueDate && daysFromToday(c.dueDate) < 0
      ).length,
      pending: cheques.filter((c) => c.status === "pending").length,
    },
    openMaintenance: d.maintenance
      .filter((m) => m.unitId === unit.id && !["closed", "completed", "rejected"].includes(m.status))
      .map((m) => ({ ref: m.ref, category: m.category, status: m.status })),
  };

  return <RenewalWizard ctx={ctx} />;
}
