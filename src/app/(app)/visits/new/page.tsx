import { requirePerm } from "@/lib/auth";
import { listVisits, loadData } from "@/lib/data";
import type { ExistingVisit } from "@/lib/actions/visit-rules";
import VisitForm, { UnitLite } from "../VisitForm";

export const dynamic = "force-dynamic";

export default async function BookVisitPage({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string; date?: string }>;
}) {
  await requirePerm("visits.manage");
  const sp = await searchParams;
  const d = await loadData();

  const units: UnitLite[] = d.units
    .map((u) => ({
      id: u.id,
      unitNo: u.unitNo,
      propertyId: u.propertyId,
      type: u.type,
      status: u.status,
    }))
    .sort((a, b) => a.unitNo.localeCompare(b.unitNo, undefined, { numeric: true }));

  // Only what the clash check needs. Sending whole visit records to the client
  // would leak visitor phone numbers into the page payload for no reason.
  const existing: ExistingVisit[] = (await listVisits()).map((v) => ({
    id: v.id,
    unitId: v.unitId,
    startsAt: v.startsAt,
    durationMins: v.durationMins,
    status: v.status,
  }));

  return (
    <VisitForm
      mode="create"
      properties={d.properties.map((p) => ({ id: p.id, name: p.name }))}
      units={units}
      existing={existing}
      presetUnitId={sp.unit}
      presetDate={sp.date}
    />
  );
}
