"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { advanceMaintenanceAction } from "@/lib/actions/maintenance";
import { Input } from "@/components/form";
import { titleCase } from "@/lib/utils";

export default function AdvanceButton({ id, next }: { id: string; next: string }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const needsNote = next === "completed" || next === "closed";

  return (
    <div className="space-y-2">
      {needsNote && (
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What was done? (required before completing)"
        />
      )}
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await advanceMaintenanceAction(id, note);
            if (res.ok) router.refresh();
            else setError(res.message);
          })
        }
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-[13px] font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
      >
        {pending && <Loader2 size={14} className="animate-spin" />}
        Move to {titleCase(next)}
        <ArrowRight size={14} />
      </button>
      {error && <p className="text-[12px] text-red-600">{error}</p>}
    </div>
  );
}
