"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";
import { Note } from "@/components/form";
import { celebrate } from "@/components/SuccessCelebration";

/**
 * A single "Retry sync" control, shared by every screen that mirrors to Odoo.
 *
 * `action` is a server action already bound to the record's id, so this stays
 * generic — it does not know or care which entity it is retrying.
 */
export default function RetrySyncButton({
  action,
  label = "Retry sync",
}: {
  action: () => Promise<{ ok: boolean; message?: string }>;
  label?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "info" | "danger"; text: string } | null>(null);

  const run = () =>
    start(async () => {
      const result = await action();
      setMessage({
        tone: result.ok ? "info" : "danger",
        text: result.message ?? (result.ok ? "Synced." : "That did not work."),
      });
      if (result.ok) { celebrate(); router.refresh(); }
    });

  return (
    <div className="space-y-3">
      <Button type="button" variant="outline" onClick={run} disabled={pending}>
        <RefreshCw size={15} className={pending ? "animate-spin" : ""} />
        {pending ? "Syncing…" : label}
      </Button>
      {message ? <Note tone={message.tone === "danger" ? "warn" : "info"}>{message.text}</Note> : null}
    </div>
  );
}
