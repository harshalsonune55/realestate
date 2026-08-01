"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Loader2, ShieldAlert, X } from "lucide-react";
import { decideApprovalAction } from "@/lib/actions/approvals";
import { Badge, Tone } from "@/components/ui";
import { Textarea } from "@/components/form";
import { AED, cx, fmtDateTime, relative, titleCase } from "@/lib/utils";

export interface ApprovalView {
  id: string;
  ref: string;
  type: string;
  title: string;
  summary: string;
  amount?: number;
  requestedByName: string;
  requestedAt: string;
  entityType: string;
  entityId: string;
  rule: string;
  ownRequest: boolean;
  waitingDays: number;
}

export default function ApprovalCard({
  approval,
  canDecide,
}: {
  approval: ApprovalView;
  canDecide: boolean;
}) {
  const [mode, setMode] = useState<null | "approve" | "reject">(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const detailHref =
    approval.entityType === "contract"
      ? `/contracts/${approval.entityId}`
      : approval.entityType === "cheque"
      ? `/cheques/${approval.entityId}`
      : approval.entityType === "maintenance"
      ? `/maintenance/${approval.entityId}`
      : "#";

  const tone: Tone = approval.waitingDays > 2 ? "bad" : approval.waitingDays > 1 ? "warn" : "neutral";

  function decide(decision: "approved" | "rejected") {
    setError(null);
    start(async () => {
      const res = await decideApprovalAction(approval.id, decision, note);
      if (res.ok) {
        setMode(null);
        setNote("");
        router.refresh();
      } else setError(res.message);
    });
  }

  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-start gap-3 border-b border-line px-4 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-600">
          <ShieldAlert size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="tnum text-[11.5px] font-semibold text-faint">{approval.ref}</span>
            <Badge tone="info">{titleCase(approval.type)}</Badge>
            <Badge tone={tone} dot>
              waiting {approval.waitingDays === 0 ? "today" : `${approval.waitingDays}d`}
            </Badge>
          </div>
          <p className="mt-1 text-[14px] font-semibold text-fg">{approval.title}</p>
          <p className="text-[12.5px] text-muted">{approval.summary}</p>
        </div>
        {approval.amount ? (
          <div className="text-right">
            <p className="tnum text-[15px] font-semibold text-fg">{AED(approval.amount)}</p>
            <p className="text-[11px] text-faint">value</p>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2.5 text-[11.5px] text-muted">
        <span>
          Raised by <b className="font-medium text-fg">{approval.requestedByName}</b>
        </span>
        <span>{fmtDateTime(approval.requestedAt)} · {relative(approval.requestedAt.slice(0, 10))}</span>
        <Link href={detailHref} className="ml-auto font-medium text-brand-600 hover:underline">
          Open full record →
        </Link>
      </div>

      <div className="border-t border-line bg-subtle/60 px-4 py-2.5 text-[11.5px] text-fg-soft">
        <b className="font-medium text-fg">Why this needs approval:</b> {approval.rule}
      </div>

      {canDecide && (
        <div className="border-t border-line px-4 py-3">
          {approval.ownRequest ? (
            <p className="rounded-lg bg-subtle px-3 py-2 text-[12px] text-fg-soft">
              You raised this request, so you cannot approve it. It must be decided by another
              manager.
            </p>
          ) : mode === null ? (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setMode("approve")}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-solid px-3.5 text-[13px] font-medium text-white transition hover:bg-brand-solid-hover"
              >
                <Check size={15} /> Approve
              </button>
              <button
                onClick={() => setMode("reject")}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 text-[13px] font-medium text-fg-soft transition hover:border-red-300 hover:text-red-700"
              >
                <X size={15} /> Reject
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className={cx("text-[12.5px] font-medium", mode === "reject" ? "text-red-700" : "text-brand-700")}>
                {mode === "reject"
                  ? "Explain why this is rejected — the requester gets this as a task."
                  : "Add a note for the record (optional)."}
              </p>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={mode === "reject" ? "e.g. Rent is 14% below list with no justification…" : "Optional note"}
              />
              {error && <p className="text-[12px] font-medium text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button
                  disabled={pending}
                  onClick={() => decide(mode === "approve" ? "approved" : "rejected")}
                  className={cx(
                    "inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-[13px] font-medium text-white transition disabled:opacity-60",
                    mode === "reject" ? "bg-red-600 hover:bg-red-700" : "bg-brand-solid hover:bg-brand-solid-hover"
                  )}
                >
                  {pending && <Loader2 size={14} className="animate-spin" />}
                  {mode === "reject" ? "Confirm rejection" : "Confirm approval"}
                </button>
                <button
                  disabled={pending}
                  onClick={() => {
                    setMode(null);
                    setError(null);
                  }}
                  className="inline-flex h-9 items-center rounded-lg border border-line px-3.5 text-[13px] text-fg-soft hover:bg-surface"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
