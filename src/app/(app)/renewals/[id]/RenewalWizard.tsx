"use client";

import { FileSignature, LogOut, MessageSquare, Mail, PenLine, Wand2 } from "lucide-react";
import Wizard, { StepDef } from "@/components/Wizard";
import { CheckItem, Field, Input, KV, Note, RadioCards, Row, Select, Textarea } from "@/components/form";
import { AED, addMonths, cx, fmtDate } from "@/lib/utils";
import { BANKS } from "@/lib/actions/contract-rules";
import {
  MAX_INCREASE_PCT, NON_RENEWAL_REASONS, RENEWAL_DOCS, RenewalChequeLine, RenewalDraft,
  renewalProblems,
} from "@/lib/actions/renewal-rules";
import { submitRenewalAction } from "@/lib/actions/renewals";

export interface RenewalContext {
  contractId: string;
  contractRef: string;
  tenantName: string;
  unitLabel: string;
  currentRent: number;
  startDate: string;
  endDate: string;
  marketRent: number;
  newStartDate: string;
  history: {
    total: number;
    cleared: number;
    bounced: number;
    late: number;
    pending: number;
  };
  openMaintenance: { ref: string; category: string; status: string }[];
}

function buildSchedule(count: number, rent: number, start: string, existing: RenewalChequeLine[]): RenewalChequeLine[] {
  const monthsApart = 12 / count;
  const base = Math.floor(rent / count / 100) * 100;
  return Array.from({ length: count }, (_, i) => ({
    chequeNo: existing[i]?.chequeNo ?? "",
    bank: existing[i]?.bank ?? "",
    amount: i === count - 1 ? rent - base * (count - 1) : base,
    dueDate: addMonths(start, Math.round(i * monthsApart)),
  }));
}

export default function RenewalWizard({ ctx }: { ctx: RenewalContext }) {
  const initial: RenewalDraft = {
    contractId: ctx.contractId,
    reviewedHistory: false,
    reviewedMaintenance: false,
    outcome: "",
    nonRenewalReason: "",
    noticeServed: false,
    newRent: ctx.currentRent,
    rentJustification: "",
    startDate: ctx.newStartDate,
    termMonths: 12,
    chequeCount: 4,
    cheques: [],
    tenantAgreed: false,
    agreedVia: "",
    docs: {},
    confirmRef: "",
    notes: "",
  };

  const p = (d: RenewalDraft, i: number) =>
    renewalProblems(d, { currentRent: ctx.currentRent, contractRef: ctx.contractRef, endDate: ctx.endDate })[i];

  const steps: StepDef<RenewalDraft>[] = [
    {
      id: "review",
      title: "Review the tenancy",
      hint: "Before you offer terms, look at how this tenant has actually paid and what is outstanding on the unit.",
      problems: (d) => p(d, 0),
      render: ({ data, set }) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-line p-4">
              <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
                Current contract
              </p>
              <KV label="Reference" value={ctx.contractRef} strong />
              <KV label="Tenant" value={ctx.tenantName} />
              <KV label="Unit" value={ctx.unitLabel} />
              <KV label="Term" value={`${fmtDate(ctx.startDate)} – ${fmtDate(ctx.endDate)}`} />
              <KV label="Annual rent" value={AED(ctx.currentRent)} strong />
            </div>
            <div className="rounded-xl border border-line p-4">
              <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
                Payment record
              </p>
              <KV label="Cheques on contract" value={String(ctx.history.total)} />
              <KV label="Cleared on time" value={String(ctx.history.cleared)} />
              <KV
                label="Deposited late"
                value={<span className={ctx.history.late ? "font-semibold text-amber-600" : ""}>{ctx.history.late}</span>}
              />
              <KV
                label="Bounced"
                value={<span className={ctx.history.bounced ? "font-semibold text-red-600" : ""}>{ctx.history.bounced}</span>}
              />
              <KV label="Still to be presented" value={String(ctx.history.pending)} />
            </div>
          </div>

          {ctx.history.bounced > 0 && (
            <Note tone="danger" title="This tenant has bounced cheques on record">
              Consider asking for fewer cheques or a larger first payment. Whatever you agree, the
              manager will see this history on the approval screen.
            </Note>
          )}

          {ctx.openMaintenance.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="mb-1.5 text-[12.5px] font-semibold text-amber-900">
                {ctx.openMaintenance.length} open maintenance job(s) on this unit
              </p>
              <ul className="space-y-0.5">
                {ctx.openMaintenance.map((m) => (
                  <li key={m.ref} className="text-[12px] text-amber-800">
                    {m.ref} — {m.category} ({m.status.replace("_", " ")})
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <Note tone="good">No open maintenance jobs on this unit.</Note>
          )}

          <div className="space-y-2">
            <CheckItem
              checked={data.reviewedHistory}
              onChange={(v) => set({ reviewedHistory: v })}
              title="I have reviewed the payment history above"
            />
            <CheckItem
              checked={data.reviewedMaintenance}
              onChange={(v) => set({ reviewedMaintenance: v })}
              title="I have reviewed open maintenance on this unit"
              detail="Outstanding work should be resolved or agreed before the tenant signs again."
            />
          </div>
        </>
      ),
    },

    {
      id: "outcome",
      title: "Renewal decision",
      hint: "Is the tenancy continuing? The rest of the procedure changes based on this answer.",
      problems: (d) => p(d, 1),
      render: ({ data, set }) => (
        <>
          <RadioCards
            value={data.outcome || "renew"}
            onChange={(v) => set({ outcome: v })}
            options={[
              { value: "renew", title: "Renew the tenancy", detail: "Agree new terms and collect new cheques.", icon: <FileSignature size={16} /> },
              { value: "not_renew", title: "Do not renew", detail: "Tenant vacates at the end of the term.", icon: <LogOut size={16} /> },
            ]}
          />

          {data.outcome === "not_renew" && (
            <>
              <Field label="Reason for not renewing" required>
                <Select value={data.nonRenewalReason} onChange={(e) => set({ nonRenewalReason: e.target.value })}>
                  <option value="">Select a reason…</option>
                  {NON_RENEWAL_REASONS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </Select>
              </Field>
              <Note tone="warn" title="Legal notice period">
                UAE law requires 90 days&apos; written notice before the end of the term if the
                landlord does not intend to renew. The system will not accept this without your
                confirmation below.
              </Note>
              <CheckItem
                checked={data.noticeServed}
                onChange={(v) => set({ noticeServed: v })}
                title="A written 90-day non-renewal notice has been served to the tenant"
                detail="By registered post, notary or email with acknowledgement. Attach the proof in step 5."
              />
            </>
          )}

          {data.outcome === "renew" && (
            <Note tone="info">
              You will now set the new rent, generate the new cheque schedule and record the
              tenant&apos;s agreement. None of it takes effect until the manager approves it.
            </Note>
          )}
        </>
      ),
    },

    {
      id: "terms",
      title: "New terms",
      hint: "Rent changes are capped by policy — anything above the cap needs a written reason.",
      problems: (d) => p(d, 2),
      render: ({ data, set }) => {
        if (data.outcome === "not_renew")
          return (
            <Note tone="info" title="Step not required">
              The tenancy is not being renewed, so there are no new terms to agree. Continue to the
              next step.
            </Note>
          );
        const increase = ctx.currentRent ? (data.newRent - ctx.currentRent) / ctx.currentRent : 0;
        const maxRent = Math.round(ctx.currentRent * (1 + MAX_INCREASE_PCT));
        const overCap = increase > MAX_INCREASE_PCT;
        return (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-line bg-slate-50 p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Current rent</p>
                <p className="tnum mt-1 text-[18px] font-semibold text-ink-900">{AED(ctx.currentRent)}</p>
              </div>
              <div className="rounded-lg border border-line bg-slate-50 p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Policy ceiling (+5%)</p>
                <p className="tnum mt-1 text-[18px] font-semibold text-ink-900">{AED(maxRent)}</p>
              </div>
              <div className="rounded-lg border border-line bg-slate-50 p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Market rent</p>
                <p className="tnum mt-1 text-[18px] font-semibold text-ink-900">{AED(ctx.marketRent)}</p>
              </div>
            </div>

            <Row>
              <Field label="New annual rent (AED)" required>
                <Input
                  type="number"
                  value={data.newRent || ""}
                  onChange={(e) => {
                    const rent = Number(e.target.value);
                    set({ newRent: rent, cheques: buildSchedule(data.chequeCount, rent, data.startDate, data.cheques) });
                  }}
                  invalid={overCap}
                />
              </Field>
              <Field label="Change" hint="Calculated automatically.">
                <Input
                  disabled
                  readOnly
                  value={`${increase >= 0 ? "+" : ""}${(increase * 100).toFixed(1)}%  (${
                    increase >= 0 ? "+" : "−"
                  }${AED(Math.abs(data.newRent - ctx.currentRent)).replace("AED ", "")})`}
                  className={cx(overCap && "!text-red-600")}
                />
              </Field>
            </Row>

            {overCap && (
              <>
                <Note tone="warn" title={`This is ${(increase * 100).toFixed(1)}% — above the 5% cap`}>
                  You may still submit it, but you must justify it in writing and the manager will
                  see the cap breach highlighted on the approval screen.
                </Note>
                <Field label="Justification for the increase" required hint="At least 15 characters.">
                  <Textarea
                    value={data.rentJustification}
                    onChange={(e) => set({ rentJustification: e.target.value })}
                    placeholder="e.g. Unit fully refurbished in March; comparable units in the building are let at AED 78,000."
                  />
                </Field>
              </>
            )}

            <Row>
              <Field label="New term start date" required>
                <Input
                  type="date"
                  value={data.startDate}
                  onChange={(e) =>
                    set({
                      startDate: e.target.value,
                      cheques: buildSchedule(data.chequeCount, data.newRent, e.target.value, data.cheques),
                    })
                  }
                />
              </Field>
              <Field label="Term length" required>
                <Select
                  value={String(data.termMonths)}
                  onChange={(e) => set({ termMonths: Number(e.target.value) })}
                >
                  <option value="12">12 months</option>
                  <option value="6">6 months</option>
                  <option value="24">24 months</option>
                </Select>
              </Field>
            </Row>
          </>
        );
      },
    },

    {
      id: "cheques",
      title: "New cheque schedule",
      hint: "Collect the new cheques before submitting. The total must equal the new annual rent.",
      problems: (d) => p(d, 3),
      render: ({ data, set }) => {
        if (data.outcome === "not_renew")
          return <Note tone="info" title="Step not required">No new cheques are collected for a non-renewal.</Note>;
        const total = data.cheques.reduce((s, c) => s + (Number(c.amount) || 0), 0);
        const diff = Number(data.newRent) - total;
        return (
          <>
            <Row>
              <Field label="Number of cheques" required>
                <Select
                  value={String(data.chequeCount)}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    set({ chequeCount: n, cheques: buildSchedule(n, data.newRent, data.startDate, data.cheques) });
                  }}
                >
                  {[1, 2, 3, 4, 6, 12].map((n) => (
                    <option key={n} value={n}>
                      {n} cheque{n > 1 ? "s" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => set({ cheques: buildSchedule(data.chequeCount, data.newRent, data.startDate, data.cheques) })}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-4 text-[13px] font-medium hover:bg-slate-50"
                >
                  <Wand2 size={15} className="text-brand-600" /> Recalculate
                </button>
              </div>
            </Row>

            <div className="overflow-x-auto scroll-thin">
              <table className="w-full min-w-[680px] text-[13px]">
                <thead>
                  <tr className="border-b border-line text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="pb-2 text-left font-semibold">#</th>
                    <th className="pb-2 text-left font-semibold">Cheque no.</th>
                    <th className="pb-2 text-left font-semibold">Bank</th>
                    <th className="pb-2 text-left font-semibold">Due date</th>
                    <th className="pb-2 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cheques.map((c, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-2 pr-2 text-slate-500">{i + 1}</td>
                      <td className="py-2 pr-2">
                        <Input
                          value={c.chequeNo}
                          inputMode="numeric"
                          placeholder="410233"
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
                  ))}
                </tbody>
              </table>
            </div>

            <div
              className={cx(
                "flex items-center justify-between rounded-lg border px-4 py-3",
                diff === 0 && data.cheques.length ? "border-brand-200 bg-brand-50" : "border-amber-200 bg-amber-50"
              )}
            >
              <span className="text-[12.5px] font-medium">
                Total {AED(total)} against new rent {AED(Number(data.newRent))}
              </span>
              <span
                className={cx(
                  "tnum rounded-lg px-3 py-1 text-[12.5px] font-semibold text-white",
                  diff === 0 && data.cheques.length ? "bg-brand-600" : "bg-amber-500"
                )}
              >
                {diff === 0 ? "Balanced" : `${diff > 0 ? "Short" : "Over"} ${AED(Math.abs(diff))}`}
              </span>
            </div>
          </>
        );
      },
    },

    {
      id: "agreement",
      title: "Tenant agreement & documents",
      hint: "Proof that the tenant accepted, plus the paperwork for the new term.",
      problems: (d) => p(d, 4),
      render: ({ data, set }) => (
        <>
          <CheckItem
            checked={data.tenantAgreed}
            onChange={(v) => set({ tenantAgreed: v })}
            title={
              data.outcome === "not_renew"
                ? "The tenant has acknowledged the non-renewal"
                : "The tenant has accepted the new rent and term"
            }
            detail="You must have this in writing before the manager will approve it."
          />

          {data.outcome === "renew" && (
            <Field label="How did the tenant confirm?" required>
              <RadioCards
                value={data.agreedVia || "signed"}
                onChange={(v) => set({ agreedVia: v })}
                columns={3}
                options={[
                  { value: "signed", title: "Signed addendum", detail: "Wet or digital signature", icon: <PenLine size={16} /> },
                  { value: "email", title: "Email confirmation", detail: "Written acceptance", icon: <Mail size={16} /> },
                  { value: "whatsapp", title: "WhatsApp", detail: "Screenshot attached", icon: <MessageSquare size={16} /> },
                ]}
              />
            </Field>
          )}

          {data.outcome === "renew" ? (
            <div className="space-y-2">
              {RENEWAL_DOCS.map((doc) => (
                <CheckItem
                  key={doc.key}
                  checked={!!data.docs[doc.key]}
                  onChange={(v) => set({ docs: { ...data.docs, [doc.key]: v } })}
                  title={doc.label}
                  detail={doc.detail}
                />
              ))}
            </div>
          ) : (
            <CheckItem
              checked={!!data.docs.moveOutBooked}
              onChange={(v) => set({ docs: { ...data.docs, moveOutBooked: v } })}
              title="Move-out inspection booked with the maintenance supervisor"
              detail="Meter readings, keys, unit condition and deposit assessment."
            />
          )}
        </>
      ),
    },

    {
      id: "confirm",
      title: "Review and submit",
      hint: "Nothing is live until a manager approves it.",
      problems: (d) => p(d, 5),
      render: ({ data, set }) => (
        <>
          <div className="rounded-xl border border-line p-4">
            <KV label="Contract" value={ctx.contractRef} strong />
            <KV label="Tenant" value={ctx.tenantName} />
            <KV label="Unit" value={ctx.unitLabel} />
            <KV label="Decision" value={data.outcome === "renew" ? "Renew" : "Do not renew"} strong />
            {data.outcome === "renew" ? (
              <>
                <KV label="New rent" value={`${AED(ctx.currentRent)} → ${AED(Number(data.newRent))}`} strong />
                <KV label="New term" value={`${fmtDate(data.startDate)} · ${data.termMonths} months`} />
                <KV label="Cheques" value={`${data.cheques.length} · ${AED(data.cheques.reduce((s, c) => s + Number(c.amount || 0), 0))}`} />
              </>
            ) : (
              <>
                <KV label="Reason" value={data.nonRenewalReason} />
                <KV label="Vacating on" value={fmtDate(ctx.endDate)} />
              </>
            )}
          </div>

          <Field label="Notes for the manager (optional)">
            <Textarea value={data.notes} onChange={(e) => set({ notes: e.target.value })} />
          </Field>

          <Field
            label={`Type the contract reference ${ctx.contractRef} to confirm`}
            required
            error={
              data.confirmRef && data.confirmRef.trim().toUpperCase() !== ctx.contractRef.toUpperCase()
                ? "Does not match."
                : undefined
            }
          >
            <Input
              value={data.confirmRef}
              onChange={(e) => set({ confirmRef: e.target.value.toUpperCase() })}
              placeholder={ctx.contractRef}
              className="tnum tracking-widest"
            />
          </Field>

          <Note tone="good" title="On submit">
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {data.outcome === "renew" ? (
                <>
                  <li>A new contract is created in <b>awaiting approval</b>.</li>
                  <li>The new cheques are registered with their own reminders.</li>
                  <li>The renewal reminder task on the old contract is closed.</li>
                </>
              ) : (
                <>
                  <li>A non-renewal approval goes to the manager.</li>
                  <li>A move-out inspection task is booked with maintenance.</li>
                </>
              )}
              <li>Everything is written to the audit log with your name.</li>
            </ul>
          </Note>
        </>
      ),
    },
  ];

  return (
    <Wizard<RenewalDraft>
      title="Contract renewal"
      subtitle={`${ctx.contractRef} · ${ctx.tenantName} · ${ctx.unitLabel}`}
      steps={steps}
      initial={initial}
      submitLabel="Submit for manager approval"
      submitNote="Renewals always require a manager decision."
      onSubmit={submitRenewalAction}
      exitHref="/renewals"
    />
  );
}
