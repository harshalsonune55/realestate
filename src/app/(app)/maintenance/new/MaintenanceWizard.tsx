"use client";

import { useMemo } from "react";
import { KeyRound, Mail, Phone, User, Building2, Globe } from "lucide-react";
import Wizard, { StepDef } from "@/components/Wizard";
import { CheckItem, Field, Input, KV, Note, RadioCards, Row, Select, Textarea } from "@/components/form";
import { AED, cx, fmtDate, addDays, today } from "@/lib/utils";
import {
  CATEGORIES, MaintenanceDraft, PRIORITY_HELP, SLA_DAYS, SPEND_APPROVAL_LIMIT, VENDORS,
  maintenanceProblems,
} from "@/lib/actions/maintenance-rules";
import { createMaintenanceAction } from "@/lib/actions/maintenance";

export interface UnitLite {
  id: string;
  unitNo: string;
  propertyId: string;
  type: string;
  status: string;
  tenantName?: string;
  tenantPhone?: string;
}

export default function MaintenanceWizard({
  properties,
  units,
}: {
  properties: { id: string; name: string }[];
  units: UnitLite[];
}) {
  const initial: MaintenanceDraft = {
    propertyId: "",
    unitId: "",
    tenantConfirmed: false,
    category: "",
    description: "",
    priority: "medium",
    reportedVia: "",
    accessArrangement: "",
    accessNotes: "",
    safetyRisk: false,
    safetyNotes: "",
    vendor: "",
    quoteAmount: 0,
    quoteAttached: false,
    confirmUnit: "",
  };

  const byId = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const p = (d: MaintenanceDraft, i: number) => maintenanceProblems(d, byId.get(d.unitId)?.unitNo)[i];

  const steps: StepDef<MaintenanceDraft>[] = [
    {
      id: "where",
      title: "Where is the problem?",
      hint: "Pick the exact unit. The tenant on record is pulled in automatically.",
      problems: (d) => p(d, 0),
      render: ({ data, set }) => {
        const list = units.filter((u) => u.propertyId === data.propertyId);
        const unit = byId.get(data.unitId);
        return (
          <>
            <Row>
              <Field label="Building" required>
                <Select
                  value={data.propertyId}
                  onChange={(e) => set({ propertyId: e.target.value, unitId: "", tenantConfirmed: false })}
                >
                  <option value="">Select…</option>
                  {properties.map((pr) => (
                    <option key={pr.id} value={pr.id}>
                      {pr.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Unit" required>
                <Select
                  value={data.unitId}
                  onChange={(e) => set({ unitId: e.target.value, tenantConfirmed: false, confirmUnit: "" })}
                  disabled={!data.propertyId}
                >
                  <option value="">{data.propertyId ? "Select…" : "Choose a building first"}</option>
                  {list.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.unitNo} — {u.type} {u.tenantName ? `(${u.tenantName})` : "(vacant)"}
                    </option>
                  ))}
                </Select>
              </Field>
            </Row>

            {unit && (
              <div className="rounded-lg border border-line bg-slate-50 p-4">
                <KV label="Unit" value={`${unit.unitNo} · ${unit.type}`} strong />
                <KV label="Occupancy" value={unit.tenantName ? "Occupied" : "Vacant"} />
                <KV label="Tenant" value={unit.tenantName ?? "No active tenancy"} />
                <KV label="Contact" value={unit.tenantPhone ?? "—"} />
              </div>
            )}

            {unit && (
              <CheckItem
                checked={data.tenantConfirmed}
                onChange={(v) => set({ tenantConfirmed: v })}
                title={
                  unit.tenantName
                    ? `I confirm the tenant is ${unit.tenantName}`
                    : "I confirm this unit is vacant and the work is for the landlord"
                }
                detail="Raising a job against the wrong unit sends a technician to a stranger's door."
              />
            )}

            <Field label="How was it reported?" required>
              <RadioCards
                value={data.reportedVia || "call"}
                onChange={(v) => set({ reportedVia: v })}
                columns={2}
                options={[
                  { value: "call", title: "Phone call", icon: <Phone size={16} /> },
                  { value: "email", title: "Email", icon: <Mail size={16} /> },
                  { value: "portal", title: "Tenant portal", icon: <Globe size={16} /> },
                  { value: "walkin", title: "Walk-in / on site", icon: <User size={16} /> },
                ]}
              />
            </Field>
          </>
        );
      },
    },

    {
      id: "problem",
      title: "What is the problem?",
      hint: "The vendor works from this description — vague text means a wasted visit.",
      problems: (d) => p(d, 1),
      render: ({ data, set }) => (
        <>
          <Field label="Category" required>
            <Select value={data.category} onChange={(e) => set({ category: e.target.value })}>
              <option value="">Select…</option>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>

          <Field
            label="Description of the fault"
            required
            hint={`${data.description.trim().length} of 20 characters minimum.`}
          >
            <Textarea
              value={data.description}
              onChange={(e) => set({ description: e.target.value })}
              placeholder="What is wrong, where exactly in the unit, since when, and anything already tried."
              invalid={data.description.length > 0 && data.description.trim().length < 20}
            />
          </Field>

          <Field label="Priority" required>
            <div className="grid gap-2">
              {(["emergency", "high", "medium", "low"] as const).map((pr) => (
                <button
                  key={pr}
                  type="button"
                  onClick={() => set({ priority: pr })}
                  className={cx(
                    "flex items-start gap-3 rounded-lg border p-3 text-left transition",
                    data.priority === pr
                      ? pr === "emergency"
                        ? "border-red-400 bg-red-50 ring-1 ring-red-400"
                        : "border-brand-500 bg-brand-50/70 ring-1 ring-brand-500"
                      : "border-line bg-white hover:border-brand-300"
                  )}
                >
                  <span
                    className={cx(
                      "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white",
                      pr === "emergency" ? "bg-red-600" : pr === "high" ? "bg-amber-500" : pr === "medium" ? "bg-sky-600" : "bg-slate-400"
                    )}
                  >
                    {SLA_DAYS[pr]}d
                  </span>
                  <span>
                    <span className="block text-[13px] font-medium capitalize text-ink-900">{pr}</span>
                    <span className="block text-[11.5px] leading-snug text-slate-500">{PRIORITY_HELP[pr]}</span>
                  </span>
                </button>
              ))}
            </div>
          </Field>

          <Note tone="info">
            The SLA clock starts the moment you submit. If the job is still open after{" "}
            <b>{SLA_DAYS[data.priority]} day(s)</b> — by {fmtDate(addDays(today(), SLA_DAYS[data.priority]))} —
            it is escalated to the operations manager automatically.
          </Note>
        </>
      ),
    },

    {
      id: "access",
      title: "Access and safety",
      hint: "A technician who cannot get in is a wasted visit and an angry tenant.",
      problems: (d) => p(d, 2),
      render: ({ data, set }) => (
        <>
          <Field label="How will the technician get in?" required>
            <RadioCards
              value={data.accessArrangement || "tenant_present"}
              onChange={(v) => set({ accessArrangement: v })}
              columns={3}
              options={[
                { value: "tenant_present", title: "Tenant will be home", detail: "Agree a time window", icon: <User size={16} /> },
                { value: "key_with_office", title: "Key held at office", detail: "Signed out and back in", icon: <KeyRound size={16} /> },
                { value: "concierge", title: "Building concierge", detail: "Concierge will open up", icon: <Building2 size={16} /> },
              ]}
            />
          </Field>

          <Field
            label={data.accessArrangement === "tenant_present" ? "Agreed time window" : "Access notes"}
            required={data.accessArrangement === "tenant_present"}
            hint="e.g. Sunday 10:00–13:00, call 30 minutes before."
          >
            <Input value={data.accessNotes} onChange={(e) => set({ accessNotes: e.target.value })} />
          </Field>

          <CheckItem
            checked={data.safetyRisk}
            onChange={(v) => set({ safetyRisk: v })}
            title="There is a safety risk at this job"
            detail="Water near electrics, gas smell, structural damage, height work, trapped person."
          />

          {data.safetyRisk && (
            <>
              <Field label="Describe the safety risk" required>
                <Textarea
                  value={data.safetyNotes}
                  onChange={(e) => set({ safetyNotes: e.target.value })}
                  placeholder="What the risk is and what the technician should bring or isolate first."
                />
              </Field>
              <Note tone="danger" title="Safety jobs are treated as emergencies">
                This work order will be flagged in red on every list and the operations manager is
                notified immediately regardless of the priority you chose.
              </Note>
            </>
          )}
        </>
      ),
    },

    {
      id: "assign",
      title: "Assignment and cost",
      hint: `Anything at or above AED ${SPEND_APPROVAL_LIMIT.toLocaleString("en-US")} needs a manager before work starts.`,
      problems: (d) => p(d, 3),
      render: ({ data, set }) => {
        const needsApproval = data.quoteAmount >= SPEND_APPROVAL_LIMIT;
        return (
          <>
            <Row>
              <Field label="Vendor or team" required>
                <Select value={data.vendor} onChange={(e) => set({ vendor: e.target.value })}>
                  <option value="">Select…</option>
                  {VENDORS.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Estimated cost (AED)" hint="Enter 0 if the work is covered by the in-house team.">
                <Input
                  type="number"
                  value={data.quoteAmount || ""}
                  onChange={(e) => set({ quoteAmount: Number(e.target.value) })}
                />
              </Field>
            </Row>

            {needsApproval && (
              <>
                <Note tone="warn" title={`${AED(data.quoteAmount)} is above the ${AED(SPEND_APPROVAL_LIMIT)} limit`}>
                  This job will be created as <b>awaiting approval</b>. The vendor must not start
                  work until the operations manager releases it.
                </Note>
                <CheckItem
                  checked={data.quoteAttached}
                  onChange={(v) => set({ quoteAttached: v })}
                  title="Written quotation from the vendor is attached"
                  detail="The manager will not approve a spend without a quote on file."
                />
              </>
            )}
          </>
        );
      },
    },

    {
      id: "review",
      title: "Review and raise",
      hint: "Check the unit one last time before a technician is dispatched.",
      problems: (d) => p(d, 4),
      render: ({ data, set }) => {
        const unit = byId.get(data.unitId);
        const needsApproval = data.quoteAmount >= SPEND_APPROVAL_LIMIT;
        return (
          <>
            <div className="rounded-xl border border-line p-4">
              <KV label="Unit" value={unit ? `${unit.unitNo} · ${unit.type}` : "—"} strong />
              <KV label="Tenant" value={unit?.tenantName ?? "Vacant"} />
              <KV label="Category" value={data.category} />
              <KV label="Priority" value={<span className="capitalize">{data.priority}</span>} strong />
              <KV label="SLA due" value={fmtDate(addDays(today(), SLA_DAYS[data.priority]))} />
              <KV label="Vendor" value={data.vendor} />
              <KV label="Estimated cost" value={data.quoteAmount ? AED(data.quoteAmount) : "No cost"} />
              <KV label="Access" value={data.accessArrangement.replace(/_/g, " ")} />
              {data.safetyRisk && <KV label="Safety risk" value={<span className="font-semibold text-red-600">Yes</span>} />}
            </div>

            <Field
              label={`Type the unit number ${unit?.unitNo ?? ""} to confirm`}
              required
              error={
                data.confirmUnit && data.confirmUnit.trim().toLowerCase() !== (unit?.unitNo ?? "").toLowerCase()
                  ? "Does not match the unit you selected."
                  : undefined
              }
            >
              <Input
                value={data.confirmUnit}
                onChange={(e) => set({ confirmUnit: e.target.value })}
                placeholder={unit?.unitNo}
                className="tnum tracking-widest"
              />
            </Field>

            <Note tone={needsApproval ? "warn" : "good"}>
              {needsApproval
                ? "The work order will be created as awaiting approval and an approval request will go to the operations manager."
                : "The work order will be assigned immediately with an SLA task on the maintenance supervisor."}
            </Note>
          </>
        );
      },
    },
  ];

  return (
    <Wizard<MaintenanceDraft>
      title="Raise a work order"
      subtitle="Five steps. Access, safety and spend limits are checked before any technician is dispatched."
      steps={steps}
      initial={initial}
      submitLabel="Raise the work order"
      onSubmit={createMaintenanceAction}
      exitHref="/maintenance"
    />
  );
}
