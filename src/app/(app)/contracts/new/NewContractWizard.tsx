"use client";

import { useMemo } from "react";
import {
  Building2, User, Briefcase, Wand2, AlertTriangle, CheckCircle2, FileText,
} from "lucide-react";
import Wizard, { StepDef } from "@/components/Wizard";
import { CheckItem, Field, Input, KV, Note, RadioCards, Row, Select, Textarea } from "@/components/form";
import { AED, addMonths, cx, fmtDate, today } from "@/lib/utils";
import {
  BANKS, COMPLIANCE_CHECKS, ChequeLine, ContractDraft, NATIONALITIES, REQUIRED_DOCS, TERMS,
  chequeTotal, stepProblems, validChequeNo, validEid, validEmail, validPhone,
} from "@/lib/actions/contract-rules";
import { createContractAction } from "@/lib/actions/contracts";

export interface UnitOption {
  id: string;
  unitNo: string;
  propertyId: string;
  type: string;
  floor: number;
  sizeSqft: number;
  marketRent: number;
  parkingSlots: number;
}
export interface PropertyOption {
  id: string;
  name: string;
  area: string;
  vacant: number;
}
export interface TenantOption {
  id: string;
  name: string;
  emiratesId: string;
  phone: string;
}

const CHEQUE_OPTIONS = [1, 2, 3, 4, 6, 12];

function buildSchedule(count: number, annualRent: number, start: string, existing: ChequeLine[]): ChequeLine[] {
  const monthsApart = 12 / count;
  const base = Math.floor(annualRent / count / 100) * 100;
  return Array.from({ length: count }, (_, i) => ({
    chequeNo: existing[i]?.chequeNo ?? "",
    bank: existing[i]?.bank ?? "",
    amount: i === count - 1 ? annualRent - base * (count - 1) : base,
    dueDate: addMonths(start, Math.round(i * monthsApart)),
  }));
}

export default function NewContractWizard({
  properties,
  units,
  tenants,
}: {
  properties: PropertyOption[];
  units: UnitOption[];
  tenants: TenantOption[];
}) {
  const initial: ContractDraft = {
    propertyId: "",
    unitId: "",
    tenantMode: "new",
    existingTenantId: "",
    tenantKind: "individual",
    tenantName: "",
    emiratesId: "",
    passportNo: "",
    nationality: "",
    phone: "+971",
    email: "",
    tradeLicense: "",
    startDate: today(),
    termMonths: 12,
    annualRent: 0,
    chequeCount: 4,
    cheques: [],
    securityDeposit: 0,
    commission: 0,
    ejariNo: "",
    docs: {},
    checks: {},
    notes: "",
    confirmName: "",
    confirmTargetName: "",
  };

  const unitById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const propById = useMemo(() => new Map(properties.map((p) => [p.id, p])), [properties]);
  const tenantById = useMemo(() => new Map(tenants.map((t) => [t.id, t])), [tenants]);

  const problemsFor = (d: ContractDraft, i: number) => stepProblems(d)[i];

  const steps: StepDef<ContractDraft>[] = [
    /* ------------------------------------------------------------ 1. unit */
    {
      id: "unit",
      title: "Choose the unit",
      hint: "Only vacant units appear here. Occupied and reserved units are hidden so they cannot be double-let.",
      problems: (d) => problemsFor(d, 0),
      render: ({ data, set }) => {
        const list = units.filter((u) => u.propertyId === data.propertyId);
        const chosen = data.unitId ? unitById.get(data.unitId) : null;
        return (
          <>
            <Field label="Building" required>
              <Select
                value={data.propertyId}
                onChange={(e) => set({ propertyId: e.target.value, unitId: "", annualRent: 0 })}
              >
                <option value="">Select a building…</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id} disabled={p.vacant === 0}>
                    {p.name} — {p.area} ({p.vacant} vacant)
                  </option>
                ))}
              </Select>
            </Field>

            {data.propertyId && (
              <div>
                <p className="mb-2 text-[12.5px] font-medium text-fg">
                  Vacant units <span className="text-red-500">*</span>
                </p>
                {list.length === 0 ? (
                  <Note tone="warn">This building has no vacant units right now.</Note>
                ) : (
                  <div className="grid max-h-80 gap-2 overflow-y-auto scroll-thin sm:grid-cols-2 lg:grid-cols-3">
                    {list.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() =>
                          set({
                            unitId: u.id,
                            annualRent: u.marketRent,
                            securityDeposit: Math.round(u.marketRent * 0.05),
                            commission: Math.round(u.marketRent * 0.05),
                            cheques: buildSchedule(data.chequeCount, u.marketRent, data.startDate, []),
                          })
                        }
                        className={cx(
                          "rounded-lg border p-3 text-left transition",
                          data.unitId === u.id
                            ? "border-brand-500 bg-brand-50/70 ring-1 ring-brand-500"
                            : "border-line bg-surface hover:border-brand-300"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[14px] font-semibold text-fg">{u.unitNo}</span>
                          <span className="rounded bg-subtle px-1.5 py-0.5 text-[10.5px] font-medium text-fg-soft">
                            {u.type}
                          </span>
                        </div>
                        <p className="mt-1 text-[11.5px] text-muted">
                          Floor {u.floor} · {u.sizeSqft} sqft · {u.parkingSlots} parking
                        </p>
                        <p className="mt-1.5 text-[12px] font-medium tnum text-brand-700">
                          {AED(u.marketRent)}/yr list
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {chosen && (
              <Note tone="good" title={`Unit ${chosen.unitNo} will be held for this application`}>
                As soon as you submit, this unit is marked <b>reserved</b> so no other employee can
                lease it. It only becomes <b>occupied</b> once a manager approves the contract.
              </Note>
            )}
          </>
        );
      },
    },

    /* ---------------------------------------------------------- 2. tenant */
    {
      id: "tenant",
      title: "Tenant details",
      hint: "Identity is captured once and reused everywhere. Formats are checked as you type.",
      problems: (d) => problemsFor(d, 1),
      render: ({ data, set }) => (
        <>
          <Field label="Is this tenant already in the system?" required>
            <RadioCards
              value={data.tenantMode}
              onChange={(v) =>
                set({
                  tenantMode: v,
                  confirmTargetName:
                    v === "existing" ? tenantById.get(data.existingTenantId)?.name ?? "" : data.tenantName,
                })
              }
              options={[
                { value: "new", title: "New tenant", detail: "Create a fresh tenant record.", icon: <User size={16} /> },
                { value: "existing", title: "Existing tenant", detail: "Reuse a record already on file.", icon: <FileText size={16} /> },
              ]}
            />
          </Field>

          {data.tenantMode === "existing" ? (
            <Field label="Select the tenant" required>
              <Select
                value={data.existingTenantId}
                onChange={(e) =>
                  set({
                    existingTenantId: e.target.value,
                    confirmTargetName: tenantById.get(e.target.value)?.name ?? "",
                  })
                }
              >
                <option value="">Search tenant records…</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {t.emiratesId}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <>
              <Field label="Tenant type" required>
                <RadioCards
                  value={data.tenantKind}
                  onChange={(v) => set({ tenantKind: v })}
                  options={[
                    { value: "individual", title: "Individual", detail: "Residential tenancy.", icon: <User size={16} /> },
                    { value: "company", title: "Company", detail: "Trade licence required.", icon: <Briefcase size={16} /> },
                  ]}
                />
              </Field>

              <Row>
                <Field
                  label={data.tenantKind === "company" ? "Company legal name" : "Full name (as on Emirates ID)"}
                  required
                  error={data.tenantName && data.tenantName.trim().length < 3 ? "Too short." : undefined}
                >
                  <Input
                    value={data.tenantName}
                    onChange={(e) => set({ tenantName: e.target.value, confirmTargetName: e.target.value })}
                    placeholder="e.g. Mohammed Al Suwaidi"
                    invalid={!!data.tenantName && data.tenantName.trim().length < 3}
                  />
                </Field>
                <Field
                  label="Emirates ID number"
                  required
                  hint="Format 784-YYYY-NNNNNNN-N"
                  error={data.emiratesId && !validEid(data.emiratesId) ? "Does not match the Emirates ID format." : undefined}
                >
                  <Input
                    value={data.emiratesId}
                    onChange={(e) => set({ emiratesId: e.target.value })}
                    placeholder="784-1990-1234567-1"
                    inputMode="numeric"
                    invalid={!!data.emiratesId && !validEid(data.emiratesId)}
                  />
                </Field>
              </Row>

              <Row>
                <Field label="Passport number" required>
                  <Input value={data.passportNo} onChange={(e) => set({ passportNo: e.target.value })} placeholder="P1234567" />
                </Field>
                <Field label="Nationality" required>
                  <Select value={data.nationality} onChange={(e) => set({ nationality: e.target.value })}>
                    <option value="">Select…</option>
                    {NATIONALITIES.map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </Select>
                </Field>
              </Row>

              <Row>
                <Field
                  label="Mobile number"
                  required
                  hint="UAE mobile, e.g. +971501234567"
                  error={data.phone.length > 4 && !validPhone(data.phone) ? "Not a valid UAE mobile number." : undefined}
                >
                  <Input
                    value={data.phone}
                    onChange={(e) => set({ phone: e.target.value })}
                    invalid={data.phone.length > 4 && !validPhone(data.phone)}
                  />
                </Field>
                <Field
                  label="Email address"
                  required
                  hint="Reminders and receipts are sent here."
                  error={data.email && !validEmail(data.email) ? "Not a valid email address." : undefined}
                >
                  <Input
                    type="email"
                    value={data.email}
                    onChange={(e) => set({ email: e.target.value })}
                    invalid={!!data.email && !validEmail(data.email)}
                  />
                </Field>
              </Row>

              {data.tenantKind === "company" && (
                <Field label="Trade licence number" required>
                  <Input value={data.tradeLicense} onChange={(e) => set({ tradeLicense: e.target.value })} placeholder="CN-1234567" />
                </Field>
              )}
            </>
          )}
        </>
      ),
    },

    /* ----------------------------------------------------------- 3. terms */
    {
      id: "terms",
      title: "Lease terms",
      hint: "Rent, dates and registration. The system flags anything outside company policy.",
      problems: (d) => problemsFor(d, 2),
      render: ({ data, set }) => {
        const unit = unitById.get(data.unitId);
        const variance = unit && data.annualRent ? (data.annualRent - unit.marketRent) / unit.marketRent : 0;
        const bigDiscount = variance < -0.1;
        const endDate =
          data.startDate && data.termMonths
            ? addMonths(data.startDate, data.termMonths)
            : "";
        return (
          <>
            <Field label="Contract term" required>
              <RadioCards
                value={String(data.termMonths)}
                onChange={(v) => {
                  const months = Number(v);
                  set({
                    termMonths: months,
                    cheques: buildSchedule(data.chequeCount, data.annualRent, data.startDate, data.cheques),
                  });
                }}
                columns={3}
                options={TERMS.map((t) => ({ value: String(t.value), title: t.label, detail: t.detail }))}
              />
            </Field>

            <Row>
              <Field label="Start date" required hint="The day the tenant takes possession.">
                <Input
                  type="date"
                  value={data.startDate}
                  onChange={(e) =>
                    set({
                      startDate: e.target.value,
                      cheques: buildSchedule(data.chequeCount, data.annualRent, e.target.value, data.cheques),
                    })
                  }
                />
              </Field>
              <Field label="End date" hint="Calculated automatically — cannot be edited.">
                <Input value={endDate ? fmtDate(endDate) : ""} disabled readOnly />
              </Field>
            </Row>

            <Row>
              <Field
                label="Annual rent (AED)"
                required
                hint={unit ? `List rent for this unit is ${AED(unit.marketRent)}.` : undefined}
              >
                <Input
                  type="number"
                  value={data.annualRent || ""}
                  onChange={(e) => {
                    const rent = Number(e.target.value);
                    set({
                      annualRent: rent,
                      securityDeposit: Math.round(rent * 0.05),
                      commission: Math.round(rent * 0.05),
                      cheques: buildSchedule(data.chequeCount, rent, data.startDate, data.cheques),
                    });
                  }}
                />
              </Field>
              <Field
                label="Ejari / Tawtheeq registration number"
                required
                hint="Register the tenancy first, then enter the number here."
              >
                <Input
                  value={data.ejariNo}
                  onChange={(e) => set({ ejariNo: e.target.value.replace(/\D/g, "") })}
                  placeholder="123456789012"
                  inputMode="numeric"
                />
              </Field>
            </Row>

            {bigDiscount && (
              <Note tone="warn" title="This rent is more than 10% below the list price">
                The contract will still go to the manager, and the discount of{" "}
                <b>{(variance * -100).toFixed(1)}%</b> will be shown clearly on the approval screen.
                Add the reason in the notes on the last step.
              </Note>
            )}
            {data.termMonths === 6 && (
              <Note tone="warn">
                Six-month tenancies are outside standard policy. The approval will be routed to the
                General Manager rather than the Operations Manager.
              </Note>
            )}
          </>
        );
      },
    },

    /* -------------------------------------------------- 4. cheque schedule */
    {
      id: "cheques",
      title: "Cheque schedule",
      hint: "Enter every cheque you physically hold. The total must equal the annual rent exactly.",
      problems: (d) => problemsFor(d, 3),
      render: ({ data, set }) => {
        const total = chequeTotal(data.cheques);
        const diff = Number(data.annualRent) - total;
        const balanced = diff === 0 && data.cheques.length > 0;
        return (
          <>
            <Row>
              <Field label="Number of cheques" required hint="Most tenants pay in 4.">
                <Select
                  value={String(data.chequeCount)}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    set({
                      chequeCount: n,
                      cheques: buildSchedule(n, data.annualRent, data.startDate, data.cheques),
                    });
                  }}
                >
                  {CHEQUE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n} cheque{n > 1 ? "s" : ""} — every {12 / n} month{12 / n > 1 ? "s" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() =>
                    set({ cheques: buildSchedule(data.chequeCount, data.annualRent, data.startDate, data.cheques) })
                  }
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-[13px] font-medium text-fg hover:bg-subtle"
                >
                  <Wand2 size={15} className="text-brand-600" />
                  Recalculate dates and amounts
                </button>
              </div>
            </Row>

            <div className="overflow-x-auto scroll-thin">
              <table className="w-full min-w-[720px] text-[13px]">
                <thead>
                  <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
                    <th className="pb-2 text-left font-semibold">#</th>
                    <th className="pb-2 text-left font-semibold">Cheque number</th>
                    <th className="pb-2 text-left font-semibold">Bank</th>
                    <th className="pb-2 text-left font-semibold">Due date</th>
                    <th className="pb-2 text-right font-semibold">Amount (AED)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cheques.map((c, i) => {
                    const bad = !validChequeNo(c.chequeNo) && c.chequeNo.length > 0;
                    return (
                      <tr key={i} className="border-b border-line-soft">
                        <td className="py-2 pr-2">
                          <span className="grid h-6 w-6 place-items-center rounded-full bg-subtle text-[11px] font-semibold text-fg-soft">
                            {i + 1}
                          </span>
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            value={c.chequeNo}
                            placeholder="e.g. 410233"
                            inputMode="numeric"
                            invalid={bad}
                            onChange={(e) => {
                              const next = [...data.cheques];
                              next[i] = { ...c, chequeNo: e.target.value.replace(/\D/g, "") };
                              set({ cheques: next });
                            }}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <Select
                            value={c.bank}
                            onChange={(e) => {
                              const next = [...data.cheques];
                              next[i] = { ...c, bank: e.target.value };
                              set({ cheques: next });
                            }}
                          >
                            <option value="">Select…</option>
                            {BANKS.map((b) => (
                              <option key={b}>{b}</option>
                            ))}
                          </Select>
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            type="date"
                            value={c.dueDate}
                            onChange={(e) => {
                              const next = [...data.cheques];
                              next[i] = { ...c, dueDate: e.target.value };
                              set({ cheques: next });
                            }}
                          />
                        </td>
                        <td className="py-2">
                          <Input
                            type="number"
                            className="text-right tnum"
                            value={c.amount || ""}
                            onChange={(e) => {
                              const next = [...data.cheques];
                              next[i] = { ...c, amount: Number(e.target.value) };
                              set({ cheques: next });
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div
              className={cx(
                "flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3",
                balanced ? "border-brand-200 bg-brand-50" : "border-amber-200 bg-amber-50"
              )}
            >
              <div className="flex items-center gap-2.5">
                {balanced ? (
                  <CheckCircle2 size={18} className="text-brand-600" />
                ) : (
                  <AlertTriangle size={18} className="text-amber-600" />
                )}
                <div>
                  <p className={cx("text-[13px] font-semibold", balanced ? "text-brand-800" : "text-amber-900")}>
                    {balanced ? "Schedule balances with the annual rent" : "Schedule does not balance yet"}
                  </p>
                  <p className={cx("text-[11.5px]", balanced ? "text-brand-700" : "text-amber-800")}>
                    {data.cheques.length} cheques · total {AED(total)} · rent {AED(Number(data.annualRent))}
                  </p>
                </div>
              </div>
              <span
                className={cx(
                  "tnum rounded-lg px-3 py-1.5 text-[13px] font-semibold",
                  balanced ? "bg-brand-solid text-white" : "bg-amber-500 text-white"
                )}
              >
                {diff === 0 ? "Balanced" : `${diff > 0 ? "Short" : "Over"} by ${AED(Math.abs(diff))}`}
              </span>
            </div>

            <Note tone="info">
              Each cheque here becomes a tracked item with its own reminder and its own task. Seven
              days before a due date the accountant is notified; if the due date passes without a
              deposit, the cheque turns red on the dashboard and the manager is alerted.
            </Note>
          </>
        );
      },
    },

    /* ------------------------------------------------------- 5. deposit &c */
    {
      id: "money",
      title: "Deposit, commission and fees",
      hint: "Amounts collected outside the rent cheques.",
      problems: (d) => problemsFor(d, 4),
      render: ({ data, set }) => {
        const min = Math.round(Number(data.annualRent) * 0.05);
        return (
          <>
            <Row>
              <Field
                label="Security deposit (AED)"
                required
                hint={`Company minimum is 5% of annual rent — ${AED(min)}.`}
                error={
                  data.securityDeposit > 0 && data.securityDeposit < Number(data.annualRent) * 0.04
                    ? "Below the company minimum."
                    : undefined
                }
              >
                <Input
                  type="number"
                  value={data.securityDeposit || ""}
                  onChange={(e) => set({ securityDeposit: Number(e.target.value) })}
                  invalid={data.securityDeposit > 0 && data.securityDeposit < Number(data.annualRent) * 0.04}
                />
              </Field>
              <Field label="Agency commission (AED)" hint="Normally 5% of annual rent.">
                <Input
                  type="number"
                  value={data.commission || ""}
                  onChange={(e) => set({ commission: Number(e.target.value) })}
                />
              </Field>
            </Row>

            <div className="rounded-lg border border-line bg-subtle p-4">
              <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">
                Total due from tenant on move-in
              </p>
              <KV label="First cheque" value={AED(data.cheques[0]?.amount ?? 0)} />
              <KV label="Security deposit" value={AED(Number(data.securityDeposit))} />
              <KV label="Agency commission" value={AED(Number(data.commission))} />
              <KV
                label="Total"
                strong
                value={AED((data.cheques[0]?.amount ?? 0) + Number(data.securityDeposit) + Number(data.commission))}
              />
            </div>

            <Note tone="info">
              The deposit is held against the unit and is only released through the guided move-out
              procedure, which itself requires manager approval.
            </Note>
          </>
        );
      },
    },

    /* ------------------------------------------------------- 6. documents */
    {
      id: "docs",
      title: "Documents",
      hint: "Every document below is mandatory. You cannot continue with a missing file.",
      problems: (d) => problemsFor(d, 5),
      render: ({ data, set }) => {
        const done = REQUIRED_DOCS.filter((d2) => data.docs[d2.key]).length;
        return (
          <>
            <div className="flex items-center justify-between rounded-lg bg-subtle px-4 py-2.5">
              <span className="text-[12.5px] text-fg-soft">Attached</span>
              <span className="tnum text-[13px] font-semibold text-fg">
                {done} of {REQUIRED_DOCS.length}
              </span>
            </div>
            <div className="space-y-2">
              {REQUIRED_DOCS.map((doc) => (
                <CheckItem
                  key={doc.key}
                  checked={!!data.docs[doc.key]}
                  onChange={(v) => set({ docs: { ...data.docs, [doc.key]: v } })}
                  title={doc.label}
                  detail={doc.detail}
                />
              ))}
            </div>
            <Note tone="info">
              In the live system each row opens a file upload and stores the scan against the
              contract. In this prototype ticking the row stands in for the upload.
            </Note>
          </>
        );
      },
    },

    /* ------------------------------------------------------ 7. compliance */
    {
      id: "compliance",
      title: "Compliance confirmations",
      hint: "You are personally confirming each of these. Your name and the time are recorded against every tick.",
      problems: (d) => problemsFor(d, 6),
      render: ({ data, set }) => (
        <>
          <Note tone="warn" title="Read before ticking">
            These confirmations are stored in the audit log with your name. If any of them turn out
            to be untrue, the audit log shows exactly who confirmed it and when.
          </Note>
          <div className="space-y-2">
            {COMPLIANCE_CHECKS.map((c) => (
              <CheckItem
                key={c.key}
                checked={!!data.checks[c.key]}
                onChange={(v) => set({ checks: { ...data.checks, [c.key]: v } })}
                title={c.label}
                detail={c.detail}
              />
            ))}
          </div>
        </>
      ),
    },

    /* ---------------------------------------------------------- 8. review */
    {
      id: "review",
      title: "Review and submit for approval",
      hint: "Check every line. Nothing here takes effect until a manager approves it.",
      problems: (d) => problemsFor(d, 7),
      render: ({ data, set }) => {
        const unit = unitById.get(data.unitId);
        const prop = unit ? propById.get(unit.propertyId) : null;
        const tenantName =
          data.tenantMode === "new" ? data.tenantName : tenantById.get(data.existingTenantId)?.name ?? "";
        return (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-line p-4">
                <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted">
                  <Building2 size={13} /> Unit
                </p>
                <KV label="Building" value={prop?.name ?? "—"} />
                <KV label="Unit" value={unit ? `${unit.unitNo} · ${unit.type}` : "—"} strong />
                <KV label="Size" value={unit ? `${unit.sizeSqft} sqft` : "—"} />
              </div>
              <div className="rounded-lg border border-line p-4">
                <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted">
                  <User size={13} /> Tenant
                </p>
                <KV label="Name" value={tenantName || "—"} strong />
                <KV
                  label="Emirates ID"
                  value={data.tenantMode === "new" ? data.emiratesId : tenantById.get(data.existingTenantId)?.emiratesId ?? "—"}
                />
                <KV
                  label="Mobile"
                  value={data.tenantMode === "new" ? data.phone : tenantById.get(data.existingTenantId)?.phone ?? "—"}
                />
              </div>
              <div className="rounded-lg border border-line p-4">
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">Terms</p>
                <KV label="Start" value={fmtDate(data.startDate)} />
                <KV label="Term" value={`${data.termMonths} months`} />
                <KV label="Annual rent" value={AED(Number(data.annualRent))} strong />
                <KV label="Ejari / Tawtheeq" value={data.ejariNo} />
              </div>
              <div className="rounded-lg border border-line p-4">
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">Money</p>
                <KV label="Cheques" value={`${data.cheques.length} · total ${AED(chequeTotal(data.cheques))}`} />
                <KV label="Security deposit" value={AED(Number(data.securityDeposit))} />
                <KV label="Commission" value={AED(Number(data.commission))} />
                <KV label="Documents" value={`${REQUIRED_DOCS.length} of ${REQUIRED_DOCS.length} attached`} />
              </div>
            </div>

            <div className="rounded-lg border border-line">
              <p className="border-b border-line px-4 py-2.5 text-[12px] font-semibold uppercase tracking-wide text-muted">
                Cheque schedule
              </p>
              <div className="divide-y divide-line-soft">
                {data.cheques.map((c, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2 text-[12.5px]">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-subtle text-[10px] font-semibold text-fg-soft">
                      {i + 1}
                    </span>
                    <span className="tnum w-20 font-medium text-fg">{c.chequeNo}</span>
                    <span className="w-32 truncate text-fg-soft">{c.bank}</span>
                    <span className="text-fg-soft">{fmtDate(c.dueDate)}</span>
                    <span className="tnum ml-auto font-medium text-fg">{AED(c.amount)}</span>
                  </div>
                ))}
              </div>
            </div>

            <Field label="Notes for the approving manager (optional)">
              <Textarea
                value={data.notes}
                onChange={(e) => set({ notes: e.target.value })}
                placeholder="Anything the manager should know — negotiated discount, special conditions, phased handover…"
              />
            </Field>

            <div className="rounded-lg border border-inverse/15 bg-inverse/[0.03] p-4">
              <p className="mb-2 text-[13px] font-semibold text-fg">Final confirmation</p>
              <p className="mb-3 text-[12.5px] text-fg-soft">
                Type the tenant&apos;s name exactly as it appears above to confirm you have checked
                every detail on this contract.
              </p>
              <Input
                value={data.confirmName}
                onChange={(e) => set({ confirmName: e.target.value })}
                placeholder={tenantName}
                invalid={!!data.confirmName && data.confirmName.trim().toLowerCase() !== tenantName.trim().toLowerCase()}
              />
            </div>

            <Note tone="warn" title="What happens when you submit">
              The contract is saved as <b>awaiting approval</b>, the unit is <b>reserved</b>, the
              cheques are registered with reminders, and an approval task is sent to the manager.
              The tenancy is not active until the manager approves it.
            </Note>
          </>
        );
      },
    },
  ];

  return (
    <Wizard<ContractDraft>
      title="New tenancy contract"
      subtitle="Eight steps. Each one is checked before you can move on, and nothing is saved until the final step."
      steps={steps}
      initial={initial}
      submitLabel="Submit for manager approval"
      submitNote="You cannot activate a contract yourself — this always goes to a manager."
      onSubmit={createContractAction}
      exitHref="/contracts"
    />
  );
}
