"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, Sparkles, User2 } from "lucide-react";
import { cx } from "@/lib/utils";

interface Turn {
  role: "user" | "assistant";
  content: string;
}

const STARTERS = [
  "What needs my attention today?",
  "How is occupancy across the portfolio?",
  "Which cheques are putting money at risk?",
  "Summarise the rent roll for me.",
];

export default function AssistantChat({ firstName }: { firstName: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, busy]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;

    const next: Turn[] = [...turns, { role: "user", content: question }];
    setTurns(next);
    setDraft("");
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok || !data.reply) {
        setError(data.error ?? "The assistant could not answer that.");
        return;
      }
      setTurns((t) => [...t, { role: "assistant", content: data.reply! }]);
    } catch {
      setError("Could not reach the assistant. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-13rem)] min-h-[26rem] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
      <div className="scroll-thin flex-1 overflow-y-auto px-5 py-5">
        {turns.length === 0 ? (
          <div className="mx-auto flex max-w-lg flex-col items-center py-10 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-brand-50 text-brand-600">
              <Sparkles size={24} />
            </span>
            <h2 className="mt-4 text-[18px] font-semibold text-fg">
              Ask about the portfolio, {firstName}
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              The assistant is briefed on properties, contracts, cheques and
              staff — limited to what your role is allowed to see.
            </p>
            <div className="mt-6 grid w-full gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-left text-[13px] text-fg-soft transition hover:border-brand-300 hover:bg-brand-50/50"
                >
                  {s}
                  <ArrowUp size={13} className="shrink-0 rotate-45 text-faint" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4">
            {turns.map((t, i) => (
              <div
                key={i}
                className={cx("flex gap-3", t.role === "user" && "justify-end")}
              >
                {t.role === "assistant" && (
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
                    <Sparkles size={14} />
                  </span>
                )}
                <div
                  className={cx(
                    "max-w-[80%] whitespace-pre-wrap rounded-xl px-4 py-2.5 text-[13.5px] leading-relaxed",
                    t.role === "user"
                      ? "bg-brand-solid text-white"
                      : "border border-line bg-surface-2 text-fg-soft"
                  )}
                >
                  {t.content}
                </div>
                {t.role === "user" && (
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-subtle text-muted">
                    <User2 size={14} />
                  </span>
                )}
              </div>
            ))}

            {busy && (
              <div className="flex items-center gap-2 text-[12.5px] text-muted">
                <Loader2 size={14} className="animate-spin text-brand-500" />
                Thinking…
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {error && (
        <div className="mx-5 mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[12.5px] text-red-800">
          {error}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="flex items-end gap-2 border-t border-line bg-surface-2 px-4 py-3"
      >
        <textarea
          ref={boxRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter keeps the newline, the convention
            // people already expect from every other chat box.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(draft);
            }
          }}
          rows={1}
          placeholder="Ask about units, tenants, cheques…"
          className="scroll-thin max-h-32 flex-1 resize-none rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[13.5px] text-fg outline-none placeholder:text-faint focus:border-brand-300"
        />
        <button
          type="submit"
          disabled={busy || draft.trim().length === 0}
          aria-label="Send"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-solid text-white transition hover:bg-brand-solid-hover disabled:bg-line-strong disabled:text-faint"
        >
          <ArrowUp size={17} />
        </button>
      </form>
    </div>
  );
}
