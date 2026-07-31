import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/store";
import MaintenanceWizard, { UnitLite } from "./MaintenanceWizard";

export const dynamic = "force-dynamic";

export default async function NewMaintenancePage() {
  await requirePerm("maintenance.manage");
  const d = db();

  const units: UnitLite[] = d.units
    .map((u) => {
      const contract = d.contracts.find(
        (c) => c.unitId === u.id && (c.status === "active" || c.status === "expiring")
      );
      const tenant = contract ? d.tenants.find((t) => t.id === contract.tenantId) : undefined;
      return {
        id: u.id,
        unitNo: u.unitNo,
        propertyId: u.propertyId,
        type: u.type,
        status: u.status,
        tenantName: tenant?.name,
        tenantPhone: tenant?.phone,
      };
    })
    .sort((a, b) => a.unitNo.localeCompare(b.unitNo));

  return (
    <MaintenanceWizard
      properties={d.properties.map((p) => ({ id: p.id, name: p.name }))}
      units={units}
    />
  );
}
