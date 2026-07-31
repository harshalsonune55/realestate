import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/store";
import NewContractWizard, {
  PropertyOption,
  TenantOption,
  UnitOption,
} from "./NewContractWizard";

export const dynamic = "force-dynamic";

export default async function NewContractPage() {
  await requirePerm("contracts.create");
  const d = db();

  const vacant = d.units.filter((u) => u.status === "vacant");

  const units: UnitOption[] = vacant
    .map((u) => ({
      id: u.id,
      unitNo: u.unitNo,
      propertyId: u.propertyId,
      type: u.type,
      floor: u.floor,
      sizeSqft: u.sizeSqft,
      marketRent: u.marketRent,
      parkingSlots: u.parkingSlots,
    }))
    .sort((a, b) => a.unitNo.localeCompare(b.unitNo));

  const properties: PropertyOption[] = d.properties.map((p) => ({
    id: p.id,
    name: p.name,
    area: p.area,
    vacant: vacant.filter((u) => u.propertyId === p.id).length,
  }));

  const tenants: TenantOption[] = d.tenants
    .map((t) => ({ id: t.id, name: t.name, emiratesId: t.emiratesId, phone: t.phone }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return <NewContractWizard properties={properties} units={units} tenants={tenants} />;
}
