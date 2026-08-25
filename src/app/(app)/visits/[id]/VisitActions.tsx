"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { celebrate } from "@/components/SuccessCelebration";
import { Field, Input, Note } from "@/components/form";
import { cancelVisitAction, retryVisitSyncAction } from "@/lib/actions/visits";

/**
 * Cancel and Retry, kept on the client because both need to report what
 * happened without navigating away from the record.
 */
export default function VisitActions({
  visitId,
  canCancel,
  canRetry,
}: {
  visitId: string;
  canCancel: boolean;
  canRetry: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ tone: "info" | "danger"; text: string } | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      const result = await fn();
      setMessage({
        tone: result.ok ? "info" : "danger",
        // A failure that says nothing is worse than no button at all.
        text: result.message ?? (result.ok ? "Done." : "That did not work."),
      });
      if (result.ok) {
        celebrate();
        setAsking(false);
        router.refresh();
      }
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {canRetry ? (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => run(() => retryVisitSyncAction(visitId))}
          >
            {pending ? "Working…" : "Retry sync"}
          </Button>
        ) : null}
        {canCancel ? (
          <Button variant="danger" disabled={pending} onClick={() => setAsking((v) => !v)}>
            Cancel viewing
          </Button>
        ) : null}
      </div>

      {asking ? (
        <div className="flex flex-col gap-2">
          <Field label="Why is it being cancelled?">
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Customer rescheduled"
              autoFocus
            />
          </Field>
          <div className="flex gap-2">
            <Button
              variant="danger"
              disabled={pending}
              onClick={() => run(() => cancelVisitAction(visitId, reason))}
            >
              {pending ? "Cancelling…" : "Confirm cancellation"}
            </Button>
            <Button variant="ghost" onClick={() => setAsking(false)}>
              Keep it
            </Button>
          </div>
        </div>
      ) : null}

      {message ? <Note tone={message.tone}>{message.text}</Note> : null}
    </div>
  );
}
