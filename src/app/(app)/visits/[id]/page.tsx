import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, PencilLine } from "lucide-react";
import { requirePerm } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getVisit, loadData } from "@/lib/data";
import { formatVisitWhen } from "@/lib/actions/visit-rules";
import { Badge, Card, CardHead, LinkButton, PageHead } from "@/components/ui";
import { KV, Note } from "@/components/form";
import VisitActions from "./VisitActions";

export const dynamic = "force-dynamic";

const STATUS_TONE = {
  scheduled: "info",
  confirmed: "good",
  completed: "good",
  cancelled: "neutral",
  no_show: "warn",
} as const;

/** The end of the slot, for display. */
function endsAt(startsAt: string, mins: number): string {
  return formatVisitWhen(new Date(new Date(startsAt).getTime() + mins * 60_000).toISOString())
    .split(", ")
    .pop()!;
}

export default async function VisitPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePerm("visits.view");
  const { id } = await params;

  const visit = await getVisit(id);
  if (!visit) notFound();

  const d = await loadData();
  const unit = d.units.find((u) => u.id === visit.unitId);
  const property = d.properties.find((p) => p.id === visit.propertyId);
  const bookedBy = d.users.find((u) => u.id === visit.bookedBy);

  const manage = can(user.role, "visits.manage");
  const open = visit.status === "scheduled" || visit.status === "confirmed";
  const synced = Boolean(visit.odooEventId) && !visit.odooError;

  return (
    <>
      <Link href="/visits" className="mb-3 inline-flex items-center gap-1 text-sm opacity-70">
        <ArrowLeft size={14} /> All viewings
      </Link>

      <PageHead
        title={`${property?.name ?? "Property"} — Unit ${unit?.unitNo ?? "—"}`}
        sub={`${visit.ref} · ${visit.visitorName}`}
        action={
          manage && open ? (
            <LinkButton href={`/visits/${visit.id}/edit`}>
              <PencilLine size={15} /> Edit viewing
            </LinkButton>
          ) : (
            <Badge tone={STATUS_TONE[visit.status]} dot>
              {visit.status.replace("_", " ")}
            </Badge>
          )
        }
      />

      <Card>
        <CardHead title="Viewing details" icon={<CalendarClock size={17} />} />
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <KV label="When" value={formatVisitWhen(visit.startsAt)} strong />
          <KV label="Ends" value={endsAt(visit.startsAt, visit.durationMins)} />
          <KV label="Duration" value={`${visit.durationMins} minutes`} />
          <KV label="Status" value={<Badge tone={STATUS_TONE[visit.status]}>{visit.status.replace("_", " ")}</Badge>} />
          <KV label="Property" value={property?.name ?? "—"} />
          <KV label="Unit" value={unit?.unitNo ?? "—"} />
          <KV label="Visitor" value={visit.visitorName} />
          <KV label="Phone" value={visit.visitorPhone} />
          {visit.visitorEmail ? <KV label="Email" value={visit.visitorEmail} /> : null}
          <KV label="Booked by" value={bookedBy?.name ?? "—"} />
        </div>
        {visit.notes ? (
          <div className="border-t border-line px-4 py-3 text-sm whitespace-pre-wrap">
            {visit.notes}
          </div>
        ) : null}
      </Card>

      <Card>
        <CardHead
          title="Odoo calendar"
          sub={
            synced
              ? "This viewing has an entry in the Odoo calendar. Editing it moves the same entry."
              : "This viewing is not in the Odoo calendar yet."
          }
          action={<Badge tone={synced ? "good" : "warn"}>{synced ? "Synced" : "Not synced"}</Badge>}
        />
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <KV label="Calendar event" value={visit.odooEventId ? `#${visit.odooEventId}` : "—"} />
          <KV
            label="Last synced"
            value={visit.odooSyncedAt ? formatVisitWhen(visit.odooSyncedAt) : "—"}
          />
        </div>
        {visit.odooError ? (
          <div className="px-4 pb-4">
            <Note tone="warn">{visit.odooError}</Note>
          </div>
        ) : null}
        {manage ? (
          <div className="border-t border-line p-4">
            <VisitActions
              visitId={visit.id}
              canCancel={open}
              canRetry={!synced && visit.status !== "cancelled"}
            />
          </div>
        ) : null}
      </Card>
    </>
  );
}
