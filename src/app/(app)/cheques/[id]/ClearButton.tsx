"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { markClearedAction } from "@/lib/actions/cheques";
import { Button } from "@/components/ui";

export default function ClearButton({ chequeId }: { chequeId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  if (!confirming) {
    return (
      <Button onClick={() => setConfirming(true)}>
        <CheckCircle2 size={15} /> Confirm bank clearance
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
        Only confirm this after seeing the credit on the bank statement.
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await markClearedAction(chequeId);
              if (res.ok) router.push(res.href);
              else setError(res.message);
            })
          }
        >
          {pending && <Loader2 size={14} className="animate-spin" />}
          Yes, it has cleared
        </Button>
      </div>
      {error && <p className="text-[12px] text-red-600">{error}</p>}
    </div>
  );
}
