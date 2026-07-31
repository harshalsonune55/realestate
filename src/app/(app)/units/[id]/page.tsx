import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, DoorOpen, FilePlus2, History, Wrench } from "lucide-react";
import { requirePerm } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/store";
import { AED, fmtDate, titleCase } from "@/lib/utils";
import { Badge, Card, CardHead, ContractStatusBadge, Empty, LinkButton, PageHead } from "@/components/ui";
import { KV } from "@/components/form";

export const dynamic = "force-dynamic";

export default async function UnitPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePerm("properties.view");
  const { id } = await params;

  const d = db();
  const unit = d.units.find((u) => u.id === id);
  if (!unit) notFound();

  const property = d.properties.find((p) => p.id === unit.propertyId)!;
  const contracts = d.contracts
    .filter((c) => c.unitId === unit.id)
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  const current = contracts.find((c) => c.status === "active" || c.status === "expiring");
  const tenant = current ? d.tenants.find((t) => t.id === current.tenantId) : undefined;
  const maint = d.maintenance
    .filter((m) => m.unitId === unit.id)
    .sort((a, b) => (a.reportedAt < b.reportedAt ? 1 : -1));

  return (
    <div>
      <Link href="/units" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-ink-900">
        <ArrowLeft size={14} /> All units
      </Link>

      <PageHead
        title={`Unit ${unit.unitNo}`}
        sub={`${property.name} · ${property.area} · floor ${unit.floor}`}
        action={
          unit.status === "vacant" && can(user.role, "contracts.create") ? (
            <LinkButton href="/contracts/new">
              <FilePlus2 size={15} /> Let this unit
            </LinkButton>
          ) : (
            <Badge
              tone={unit.status === "occupied" ? "good" : unit.status === "reserved" ? "info" : "warn"}
              dot
            >
              {titleCase(unit.status)}
            </Badge>
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {current && tenant ? (
            <Card>
              <CardHead title="Current tenancy" icon={<DoorOpen size={17} />} />
              <div className="grid gap-x-8 sm:grid-cols-2">
                <div>
                  <KV
                    label="Tenant"
                    value={<Link href={`/tenants/${tenant.id}`} className="hover:text-brand-600">{tenant.name}</Link>}
                    strong
                  />
                  <KV label="Mobile" value={tenant.phone} />
                  <KV
                    label="Contract"
                    value={<Link href={`/contracts/${current.id}`} className="hover:text-brand-600">{current.ref}</Link>}
                  />
                  <KV label="Status" value={<ContractStatusBadge status={current.status} />} />
                </div>
                <div>
                  <KV label="Start" value={fmtDate(current.startDate)} />
                  <KV label="End" value={fmtDate(current.endDate)} />
                  <KV label="Annual rent" value={AED(current.annualRent)} strong />
                  <KV label="Cheques" value={String(current.chequeCount)} />
                </div>
              </div>
            </Card>
          ) : (
            <Card>
              <Empty
                title={unit.status === "vacant" ? "This unit is vacant" : `This unit is ${unit.status}`}
                sub={
                  unit.status === "vacant"
                    ? `List rent ${AED(unit.marketRent)} per year. Start the guided tenancy procedure to let it.`
                    : undefined
                }
                icon={<DoorOpen size={22} />}
              />
            </Card>
          )}

          <Card>
            <CardHead title="Tenancy history" icon={<History size={17} />} />
            {contracts.length === 0 ? (
              <p className="text-[12.5px] text-slate-400">No contracts recorded for this unit.</p>
            ) : (
              <div className="space-y-1.5">
                {contracts.map((c) => {
                  const t = d.tenants.find((x) => x.id === c.tenantId);
                  return (
                    <Link
                      key={c.id}
                      href={`/contracts/${c.id}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line px-3 py-2.5 text-[12.5px] hover:bg-slate-50"
                    >
                      <span className="font-medium text-ink-900">{c.ref}</span>
                      <span className="min-w-0 flex-1 truncate text-slate-600">{t?.name}</span>
                      <span className="text-slate-500">
                        {fmtDate(c.startDate)} – {fmtDate(c.endDate)}
                      </span>
                      <span className="tnum font-medium text-ink-900">{AED(c.annualRent)}</span>
                      <ContractStatusBadge status={c.status} />
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>

          <Card>
            <CardHead title="Maintenance history" icon={<Wrench size={17} />} />
            {maint.length === 0 ? (
              <p className="text-[12.5px] text-slate-400">No work orders raised on this unit.</p>
            ) : (
              <div className="space-y-1.5">
                {maint.slice(0, 12).map((m) => (
                  <Link
                    key={m.id}
                    href={`/maintenance/${m.id}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line px-3 py-2.5 text-[12.5px] hover:bg-slate-50"
                  >
                    <span className="font-medium text-ink-900">{m.ref}</span>
                    <span className="min-w-0 flex-1 truncate text-slate-600">{m.category}</span>
                    <span className="text-slate-500">{fmtDate(m.reportedAt.slice(0, 10))}</span>
                    <Badge tone={["closed", "completed"].includes(m.status) ? "good" : "neutral"}>
                      {titleCase(m.status)}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHead title="Unit details" />
            <KV label="Unit number" value={unit.unitNo} strong />
            <KV label="Building" value={<Link href={`/properties/${property.id}`} className="hover:text-brand-600">{property.name}</Link>} />
            <KV label="Floor" value={String(unit.floor)} />
            <KV label="Type" value={unit.type} />
            <KV label="Size" value={`${unit.sizeSqft} sqft`} />
            <KV label="Bathrooms" value={String(unit.bathrooms)} />
            <KV label="Parking" value={`${unit.parkingSlots} slot(s)`} />
            <KV label="List rent" value={AED(unit.marketRent)} strong />
            <KV label="Status" value={titleCase(unit.status)} />
          </Card>
        </div>
      </div>
    </div>
  );
}
