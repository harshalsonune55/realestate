import Link from "next/link";
import { CalendarClock, CalendarX2, CloudOff, Plus } from "lucide-react";
import { requirePerm } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { listVisits, loadData } from "@/lib/data";
import { formatVisitWhen } from "@/lib/actions/visit-rules";
import { Badge, Card, CardHead, Empty, LinkButton, PageHead, Table, TD, TH } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_TONE = {
  scheduled: "info",
  confirmed: "good",
  completed: "good",
  cancelled: "neutral",
  no_show: "warn",
} as const;

export default async function VisitsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const user = await requirePerm("visits.view");
  const sp = await searchParams;
  const scope = sp.scope === "past" ? "past" : "upcoming";

  const d = await loadData();
  // Per-request, which is what `force-dynamic` above is for.
  const now = new Date().getTime();
  const all = (await listVisits()).slice().sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const upcoming = all.filter(
    (v) => new Date(v.startsAt).getTime() >= now && v.status !== "cancelled"
  );
  const past = all
    .filter((v) => new Date(v.startsAt).getTime() < now || v.status === "cancelled")
    .reverse();

  const rows = scope === "past" ? past : upcoming;
  // A viewing that never reached the calendar is the one thing on this screen
  // somebody has to act on, so it is counted separately rather than buried.
  const unsynced = all.filter((v) => !v.odooEventId && v.status !== "cancelled").length;

  return (
    <>
      <PageHead
        title="Viewings"
        sub="Scheduled property viewings, mirrored to the Odoo calendar."
        action={
          can(user.role, "visits.manage") ? (
            <LinkButton href="/visits/new">
              <Plus size={15} /> Book a viewing
            </LinkButton>
          ) : null
        }
      />

      {unsynced > 0 ? (
        <Card>
          <div className="flex items-center gap-2 p-4 text-sm">
            <CloudOff size={16} className="text-amber-600 dark:text-amber-400" />
            <span>
              {unsynced} viewing{unsynced === 1 ? " is" : "s are"} not in the Odoo calendar yet.
              Open one to retry.
            </span>
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHead
          title={scope === "past" ? "Past and cancelled" : "Upcoming"}
          icon={<CalendarClock size={17} />}
          action={
            <div className="flex gap-2">
              <LinkButton href="/visits" variant={scope === "upcoming" ? "primary" : "ghost"}>
                Upcoming ({upcoming.length})
              </LinkButton>
              <LinkButton href="/visits?scope=past" variant={scope === "past" ? "primary" : "ghost"}>
                Past ({past.length})
              </LinkButton>
            </div>
          }
        />

        {rows.length === 0 ? (
          <Empty
            title={
              scope === "past" ? "No past viewings yet" : "Nothing booked"
            }
            icon={<CalendarX2 size={22} />}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <TH>Ref</TH>
                <TH>When</TH>
                <TH>Space</TH>
                <TH>Visitor</TH>
                <TH>Status</TH>
                <TH>Calendar</TH>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => {
                const unit = d.units.find((u) => u.id === v.unitId);
                const property = d.properties.find((p) => p.id === v.propertyId);
                return (
                  <tr key={v.id}>
                    <TD>
                      <Link href={`/visits/${v.id}`} className="underline-offset-2 hover:underline">
                        {v.ref}
                      </Link>
                    </TD>
                    <TD>
                      {formatVisitWhen(v.startsAt)}
                      <span className="block text-xs opacity-60">{v.durationMins} min</span>
                    </TD>
                    <TD>
                      {property?.name ?? "—"}
                      <span className="block text-xs opacity-60">
                        Unit {unit?.unitNo ?? "—"}
                      </span>
                    </TD>
                    <TD>
                      {v.visitorName}
                      <span className="block text-xs opacity-60">{v.visitorPhone}</span>
                    </TD>
                    <TD>
                      <Badge tone={STATUS_TONE[v.status]}>{v.status.replace("_", " ")}</Badge>
                    </TD>
                    <TD>
                      {v.odooEventId ? (
                        <Badge tone="good">in Odoo</Badge>
                      ) : v.status === "cancelled" ? (
                        <span className="opacity-50">—</span>
                      ) : (
                        <Badge tone="warn">not synced</Badge>
                      )}
                    </TD>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
