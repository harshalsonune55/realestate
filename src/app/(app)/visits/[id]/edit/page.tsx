import { notFound } from "next/navigation";
import { requirePerm } from "@/lib/auth";
import { getVisit, listVisits, loadData } from "@/lib/data";
import { GULF_OFFSET_MINUTES, type ExistingVisit } from "@/lib/actions/visit-rules";
import VisitForm, { UnitLite } from "../../VisitForm";

export const dynamic = "force-dynamic";

/** A stored UTC instant back into the `date` + `time` the form inputs expect. */
function toDraftFields(startsAt: string): { date: string; time: string } {
  const gulf = new Date(new Date(startsAt).getTime() + GULF_OFFSET_MINUTES * 60_000);
  return {
    date: gulf.toISOString().slice(0, 10),
    time: gulf.toISOString().slice(11, 16),
  };
}

export default async function EditVisitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePerm("visits.manage");
  const { id } = await params;

  const visit = await getVisit(id);
  if (!visit) notFound();

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

  // Every other viewing: a booking must not be reported as clashing with itself.
  const existing: ExistingVisit[] = (await listVisits())
    .filter((v) => v.id !== id)
    .map((v) => ({
      id: v.id,
      unitId: v.unitId,
      startsAt: v.startsAt,
      durationMins: v.durationMins,
      status: v.status,
    }));

  const { date, time } = toDraftFields(visit.startsAt);

  return (
    <VisitForm
      mode="edit"
      visitId={visit.id}
      initialDraft={{
        propertyId: visit.propertyId,
        unitId: visit.unitId,
        visitorName: visit.visitorName,
        visitorPhone: visit.visitorPhone,
        visitorEmail: visit.visitorEmail ?? "",
        date,
        time,
        durationMins: visit.durationMins,
        notes: visit.notes,
      }}
      properties={d.properties.map((p) => ({ id: p.id, name: p.name }))}
      units={units}
      existing={existing}
    />
  );
}
