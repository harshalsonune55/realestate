"use client";

import { Mail, MessageSquare, Phone, UserCheck } from "lucide-react";
import Wizard, { StepDef } from "@/components/Wizard";
import { CheckItem, Field, Input, KV, Note, RadioCards, Row, Select, Textarea } from "@/components/form";
import { AED, addDays, cx, fmtDate, today } from "@/lib/utils";
import { BOUNCE_REASONS, BounceDraft, bounceProblems } from "@/lib/actions/cheque-rules";
import { reportBounceAction } from "@/lib/actions/cheques";
import type { ChequeInfo } from "../deposit/DepositWizard";

export default function BounceWizard({ cheque }: { cheque: ChequeInfo }) {
  const initial: BounceDraft = {
    chequeId: cheque.id,
    returnDate: today(),
    reason: "",
    bankMemoNo: "",
    bankCharges: 0,
    tenantInformed: false,
    informedVia: "",
    replacementRequired: true,
    replacementDeadline: addDays(today(), 3),
    confirmChequeNo: "",
    note: "",
  };

  const p = (d: BounceDraft, i: number) => bounceProblems(d, cheque)[i];

  const steps: StepDef<BounceDraft>[] = [
    {
      id: "bank",
      title: "What the bank told you",
      hint: "Copy the details straight from the bank return memo.",
      problems: (d) => p(d, 0),
      render: ({ data, set }) => (
        <>
          <div className="rounded-xl border border-line bg-slate-50 p-4">
            <KV label="Cheque" value={<span className="tnum">{cheque.chequeNo} · {cheque.bank}</span>} strong />
            <KV label="Amount" value={<span className="tnum">{AED(cheque.amount)}</span>} strong />
            <KV label="Tenant" value={cheque.tenantName} />
            <KV label="Unit" value={cheque.unitLabel} />
          </div>

          <Row>
            <Field label="Date the bank returned it" required>
              <Input
                type="date"
                max={today()}
                value={data.returnDate}
                onChange={(e) => set({ returnDate: e.target.value })}
              />
            </Field>
            <Field label="Bank return memo reference" required hint="Printed on the return advice.">
              <Input
                value={data.bankMemoNo}
                onChange={(e) => set({ bankMemoNo: e.target.value.toUpperCase() })}
                placeholder="RTN-882314"
              />
            </Field>
          </Row>

          <Field label="Reason given by the bank" required>
            <Select value={data.reason} onChange={(e) => set({ reason: e.target.value })}>
              <option value="">Select the exact reason on the memo…</option>
              {BOUNCE_REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
          </Field>

          {data.reason === "Payment stopped by drawer" && (
            <Note tone="danger" title="Escalate this one">
              A stopped cheque is treated as a deliberate act. This will be escalated to the General
              Manager automatically and legal action may follow under UAE law.
            </Note>
          )}
        </>
      ),
    },

    {
      id: "charges",
      title: "Bank charges",
      hint: "Charges are recoverable from the tenant under the tenancy contract.",
      problems: (d) => p(d, 1),
      render: ({ data, set }) => (
        <>
          <Field label="Bank charges incurred (AED)" hint="Enter 0 if the bank did not charge us.">
            <Input
              type="number"
              value={data.bankCharges || ""}
              onChange={(e) => set({ bankCharges: Number(e.target.value) })}
              placeholder="0"
            />
          </Field>
          <div className="rounded-lg border border-line bg-slate-50 p-4">
            <KV label="Unpaid rent instalment" value={AED(cheque.amount)} />
            <KV label="Bank charges" value={AED(Number(data.bankCharges))} />
            <KV label="Total recoverable from tenant" value={AED(cheque.amount + Number(data.bankCharges))} strong />
          </div>
          <Note tone="info">
            This amount is added to the tenant&apos;s outstanding balance and shown on their record
            until it is settled.
          </Note>
        </>
      ),
    },

    {
      id: "tenant",
      title: "Inform the tenant",
      hint: "The tenant must be told the same day, and the system records how you told them.",
      problems: (d) => p(d, 2),
      render: ({ data, set }) => (
        <>
          <CheckItem
            checked={data.tenantInformed}
            onChange={(v) => set({ tenantInformed: v })}
            title="I have informed the tenant that the cheque was returned"
            detail={`Contact on file for ${cheque.tenantName}. You must do this before continuing.`}
          />

          <Field label="How did you inform them?" required>
            <RadioCards
              value={data.informedVia || "call"}
              onChange={(v) => set({ informedVia: v })}
              columns={2}
              options={[
                { value: "call", title: "Phone call", detail: "Spoke to the tenant directly", icon: <Phone size={16} /> },
                { value: "email", title: "Email", detail: "Formal written notice sent", icon: <Mail size={16} /> },
                { value: "sms", title: "SMS / WhatsApp", detail: "Message delivered", icon: <MessageSquare size={16} /> },
                { value: "visit", title: "In person", detail: "Met at the unit or office", icon: <UserCheck size={16} /> },
              ]}
            />
          </Field>

          <div className="space-y-2">
            <CheckItem
              checked={data.replacementRequired}
              onChange={(v) => set({ replacementRequired: v })}
              title="Request a replacement cheque"
              detail="Raises an approval for the manager and puts a chase task on your list."
            />
            {data.replacementRequired && (
              <Field label="Deadline for the replacement cheque" required hint="Company policy is 3 working days.">
                <Input
                  type="date"
                  value={data.replacementDeadline}
                  onChange={(e) => set({ replacementDeadline: e.target.value })}
                />
              </Field>
            )}
          </div>

          <Field label="Note for the file (optional)">
            <Textarea
              value={data.note}
              onChange={(e) => set({ note: e.target.value })}
              placeholder="What the tenant said, any commitment they made…"
            />
          </Field>
        </>
      ),
    },

    {
      id: "confirm",
      title: "Confirm and record",
      hint: "Recording a return is serious — it changes the tenant's standing and starts a recovery clock.",
      problems: (d) => p(d, 3),
      render: ({ data, set }) => (
        <>
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <KV label="Cheque" value={<span className="tnum">{cheque.chequeNo}</span>} strong />
            <KV label="Returned on" value={fmtDate(data.returnDate)} />
            <KV label="Reason" value={data.reason || "—"} />
            <KV label="Memo reference" value={data.bankMemoNo || "—"} />
            <KV label="Recoverable" value={AED(cheque.amount + Number(data.bankCharges))} strong />
            <KV label="Replacement due by" value={data.replacementRequired ? fmtDate(data.replacementDeadline) : "Not requested"} />
          </div>

          <Field
            label={`Type the cheque number ${cheque.chequeNo} to confirm`}
            required
            error={
              data.confirmChequeNo && data.confirmChequeNo.trim() !== cheque.chequeNo
                ? "Does not match."
                : undefined
            }
          >
            <Input
              value={data.confirmChequeNo}
              onChange={(e) => set({ confirmChequeNo: e.target.value.replace(/\D/g, "") })}
              className={cx(
                "tnum text-center text-lg tracking-[0.3em]",
                data.confirmChequeNo === cheque.chequeNo && "border-brand-500 text-brand-700"
              )}
              invalid={!!data.confirmChequeNo && data.confirmChequeNo.trim() !== cheque.chequeNo}
            />
          </Field>
        </>
      ),
    },
  ];

  return (
    <Wizard<BounceDraft>
      title={`Record bank return — cheque ${cheque.chequeNo}`}
      subtitle={`${cheque.tenantName} · ${cheque.unitLabel} · ${AED(cheque.amount)}`}
      steps={steps}
      initial={initial}
      submitLabel="Record the return"
      submitNote="A chase task and a manager approval are created automatically."
      onSubmit={reportBounceAction}
      exitHref={`/cheques/${cheque.id}`}
    />
  );
}
