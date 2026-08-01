"use client";

import { Building, Landmark, ScanLine } from "lucide-react";
import Wizard, { StepDef } from "@/components/Wizard";
import { CheckItem, Field, Input, KV, Note, RadioCards, Row, Select, Textarea } from "@/components/form";
import { AED, cx, daysFromToday, fmtDate, today } from "@/lib/utils";
import { COMPANY_ACCOUNTS, DepositDraft, depositProblems } from "@/lib/actions/cheque-rules";
import { depositChequeAction } from "@/lib/actions/cheques";

export interface ChequeInfo {
  id: string;
  chequeNo: string;
  bank: string;
  amount: number;
  dueDate: string;
  seq: number;
  ofTotal: number;
  tenantName: string;
  unitLabel: string;
  contractRef: string;
}

export default function DepositWizard({ cheque }: { cheque: ChequeInfo }) {
  const initial: DepositDraft = {
    chequeId: cheque.id,
    retrieved: false,
    detailsMatch: false,
    dateMatch: false,
    bankAccount: "",
    depositSlipNo: "",
    depositDate: today(),
    confirmChequeNo: "",
    method: "counter",
    note: "",
  };

  const p = (d: DepositDraft, i: number) => depositProblems(d, cheque)[i];
  const overdue = daysFromToday(cheque.dueDate) < 0;

  const steps: StepDef<DepositDraft>[] = [
    {
      id: "verify",
      title: "Verify the physical cheque",
      hint: "Take the original cheque out of the safe and check it against the record before you go to the bank.",
      problems: (d) => p(d, 0),
      render: ({ data, set }) => (
        <>
          <div className="rounded-xl border border-line bg-subtle p-4">
            <p className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-muted">
              What the system holds on record
            </p>
            <div className="grid gap-x-8 sm:grid-cols-2">
              <div>
                <KV label="Cheque number" value={<span className="tnum">{cheque.chequeNo}</span>} strong />
                <KV label="Bank" value={cheque.bank} />
                <KV label="Amount" value={<span className="tnum">{AED(cheque.amount)}</span>} strong />
              </div>
              <div>
                <KV label="Due date" value={fmtDate(cheque.dueDate)} />
                <KV label="Tenant" value={cheque.tenantName} />
                <KV label="Unit" value={cheque.unitLabel} />
              </div>
            </div>
          </div>

          {overdue && (
            <Note tone="danger" title={`This cheque is ${-daysFromToday(cheque.dueDate)} days overdue`}>
              It has been flagged to the manager as money at risk. Complete the deposit today.
            </Note>
          )}

          <div className="space-y-2">
            <CheckItem
              checked={data.retrieved}
              onChange={(v) => set({ retrieved: v })}
              title="I have the original cheque in my hand"
              detail="Retrieved from the safe, not a copy or a scan."
            />
            <CheckItem
              checked={data.detailsMatch}
              onChange={(v) => set({ detailsMatch: v })}
              title={`Cheque number, bank and amount match: ${cheque.chequeNo} · ${cheque.bank} · ${AED(cheque.amount)}`}
              detail="If anything differs, stop and raise it with your manager instead of continuing."
            />
            <CheckItem
              checked={data.dateMatch}
              onChange={(v) => set({ dateMatch: v })}
              title={`The date written on the cheque is ${fmtDate(cheque.dueDate)}`}
              detail="A bank will return a cheque presented before the date written on it."
            />
          </div>
        </>
      ),
    },

    {
      id: "bank",
      title: "Record the bank deposit",
      hint: "Fill this in from the deposit slip the bank gave you.",
      problems: (d) => p(d, 1),
      render: ({ data, set }) => (
        <>
          <Field label="Company account the cheque was paid into" required>
            <Select value={data.bankAccount} onChange={(e) => set({ bankAccount: e.target.value })}>
              <option value="">Select the account…</option>
              {COMPANY_ACCOUNTS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </Select>
          </Field>

          <Field label="How was it deposited?" required>
            <RadioCards
              value={data.method}
              onChange={(v) => set({ method: v })}
              columns={3}
              options={[
                { value: "counter", title: "Bank counter", detail: "Teller stamped slip", icon: <Building size={16} /> },
                { value: "atm", title: "Cheque deposit machine", detail: "Machine receipt", icon: <ScanLine size={16} /> },
                { value: "collection", title: "Bank collection", detail: "Picked up from office", icon: <Landmark size={16} /> },
              ]}
            />
          </Field>

          <Row>
            <Field
              label="Deposit slip / reference number"
              required
              hint="Printed on the slip or machine receipt."
            >
              <Input
                value={data.depositSlipNo}
                onChange={(e) => set({ depositSlipNo: e.target.value.toUpperCase() })}
                placeholder="DS-482910"
              />
            </Field>
            <Field label="Date deposited" required hint="Cannot be a future date.">
              <Input
                type="date"
                value={data.depositDate}
                max={today()}
                onChange={(e) => set({ depositDate: e.target.value })}
              />
            </Field>
          </Row>

          <Field label="Note (optional)">
            <Textarea
              value={data.note}
              onChange={(e) => set({ note: e.target.value })}
              placeholder="Anything unusual about this deposit…"
            />
          </Field>
        </>
      ),
    },

    {
      id: "confirm",
      title: "Cross-check",
      hint: "One last check that you are recording the right cheque.",
      problems: (d) => p(d, 2),
      render: ({ data, set }) => (
        <>
          <Note tone="warn" title="Why this step exists">
            Depositing the wrong cheque is the single most common and most expensive mistake in
            rent collection. Typing the number by hand forces you to look at the cheque one more
            time.
          </Note>
          <Field
            label="Type the cheque number exactly as printed on the cheque"
            required
            error={
              data.confirmChequeNo && data.confirmChequeNo.trim() !== cheque.chequeNo
                ? "This does not match the cheque you are depositing."
                : undefined
            }
          >
            <Input
              value={data.confirmChequeNo}
              onChange={(e) => set({ confirmChequeNo: e.target.value.replace(/\D/g, "") })}
              placeholder="######"
              inputMode="numeric"
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

    {
      id: "review",
      title: "Review and record",
      hint: "This writes the deposit to the ledger and creates the clearance follow-up.",
      problems: (d) => p(d, 3),
      render: ({ data }) => (
        <>
          <div className="rounded-xl border border-line p-4">
            <KV label="Cheque" value={<span className="tnum">{cheque.chequeNo} · {cheque.bank}</span>} strong />
            <KV label="Amount" value={<span className="tnum">{AED(cheque.amount)}</span>} strong />
            <KV label="Contract" value={cheque.contractRef} />
            <KV label="Tenant" value={cheque.tenantName} />
            <KV label="Into account" value={data.bankAccount} />
            <KV label="Deposit slip" value={data.depositSlipNo} />
            <KV label="Deposited on" value={fmtDate(data.depositDate)} />
          </div>
          <Note tone="good" title="After you record this">
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              <li>The cheque moves to <b>awaiting clearance</b> and leaves the overdue list.</li>
              <li>Your deposit task is closed automatically.</li>
              <li>A new task appears in three days to confirm the funds actually cleared.</li>
              <li>Your name, the time and every field above go into the audit log.</li>
            </ul>
          </Note>
        </>
      ),
    },
  ];

  return (
    <Wizard<DepositDraft>
      title={`Deposit cheque ${cheque.chequeNo}`}
      subtitle={`${cheque.tenantName} · ${cheque.unitLabel} · ${AED(cheque.amount)} · cheque ${cheque.seq} of ${cheque.ofTotal}`}
      steps={steps}
      initial={initial}
      submitLabel="Record the deposit"
      submitNote="This cannot be undone by you — only a manager can reverse a recorded deposit."
      onSubmit={depositChequeAction}
      exitHref={`/cheques/${cheque.id}`}
    />
  );
}
