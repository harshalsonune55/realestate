"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp, Check, Copy, FileText, ImageIcon, Loader2, MessageSquarePlus,
  Paperclip, Pencil, Sparkles, Trash2, User2, X,
} from "lucide-react";
import { cx } from "@/lib/utils";
import Markdown from "@/components/Markdown";
import {
  load, newId, save, titleFrom, when,
  type Conversation, type Turn,
} from "./conversations";

interface Picked {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp,image/gif";
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_FILES = 5;

/** Reads a file as a data URL, which is what the route expects. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

const STARTERS = [
  "What needs my attention today?",
  "How is occupancy across the portfolio?",
  "Which cheques are putting money at risk?",
  "Summarise the rent roll for me.",
];

/** Copies an answer, and says so for a moment rather than silently succeeding. */
function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1600);
    return () => clearTimeout(t);
  }, [done]);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
        } catch {
          // Clipboard access can be refused outright; better to do nothing
          // visible than to claim a copy that never happened.
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[11.5px] text-faint transition hover:bg-subtle hover:text-fg-soft"
    >
      {done ? <Check size={12} /> : <Copy size={12} />}
      {done ? "Copied" : "Copy"}
    </button>
  );
}

export default function AssistantChat({
  firstName,
  userId,
}: {
  firstName: string;
  userId: string;
}) {
  const [chats, setChats] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  /** Id of the chat whose name is being edited in the rail. */
  const [editing, setEditing] = useState<string | null>(null);

  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<Picked[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Memoised so the scroll effect below does not see a fresh array identity on
  // every render and scroll on keystrokes that changed nothing.
  const turns: Turn[] = useMemo(
    () => chats.find((c) => c.id === activeId)?.turns ?? [],
    [chats, activeId]
  );

  /* Storage is read after mount, never during render: the server has no
     `localStorage`, and reading it in the first render would make the markup
     disagree with what the browser then paints.

     This is the documented exception to the no-setState-in-an-effect rule —
     the "subscribe to an external system" case. It runs once per user id, and
     the cascade the rule guards against is a single extra render at mount. */
  useEffect(() => {
    const saved = load(userId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChats(saved);
     
    setActiveId(saved[0]?.id ?? null);
     
    setReady(true);
  }, [userId]);

  useEffect(() => {
    if (ready) save(userId, chats);
  }, [ready, userId, chats]);

  /** Writes turns into the active chat, creating one on the first message. */
  function commit(id: string, next: Turn[], title?: string) {
    setChats((prev) => {
      const found = prev.find((c) => c.id === id);
      const updated: Conversation = found
        ? { ...found, turns: next, updatedAt: Date.now(), title: title ?? found.title }
        : { id, title: title ?? "New chat", turns: next, updatedAt: Date.now() };
      return [updated, ...prev.filter((c) => c.id !== id)];
    });
  }

  const endRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, busy]);

  async function send(text: string) {
    const question = text.trim();
    // A file on its own is a fair question — "what is this?" — so an empty box
    // is only empty when nothing is attached either.
    if ((!question && files.length === 0) || busy) return;

    const sending = files;
    const userTurn: Turn = {
      role: "user",
      content: question || "(see the attached file)",
      files: sending.length > 0 ? sending.map((f) => f.name) : undefined,
    };
    const next: Turn[] = [...turns, userTurn];

    // The first message names the chat, and starts one if none is open.
    const id = activeId ?? newId();
    if (!activeId) setActiveId(id);
    commit(id, next, turns.length === 0 ? titleFrom(userTurn.content) : undefined);

    setDraft("");
    setFiles([]);
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // The transcript keeps filenames; the bytes go up only with the
          // message they were attached to.
          messages: next.map(({ role, content }) => ({ role, content })),
          attachments: sending.map((f) => ({
            name: f.name,
            type: f.type,
            dataUrl: f.dataUrl,
          })),
        }),
      });
      const data = (await res.json()) as {
        reply?: string;
        error?: string;
        problems?: string[];
      };
      if (!res.ok || !data.reply) {
        setError(data.error ?? "The assistant could not answer that.");
        return;
      }
      // A file that could not be read is said out loud, not swallowed.
      if (data.problems?.length) setError(data.problems.join(" "));
      commit(id, [...next, { role: "assistant", content: data.reply! }]);
    } catch {
      setError("Could not reach the assistant. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  async function pick(list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(null);
    const room = MAX_FILES - files.length;
    const chosen = Array.from(list).slice(0, room);
    const rejected: string[] = [];

    const read = await Promise.all(
      chosen.map(async (f) => {
        if (f.size > MAX_BYTES) {
          rejected.push(`${f.name} is larger than 8 MB.`);
          return null;
        }
        try {
          return { name: f.name, type: f.type, size: f.size, dataUrl: await readAsDataUrl(f) };
        } catch {
          rejected.push(`${f.name} could not be read.`);
          return null;
        }
      })
    );

    if (list.length > room) rejected.push(`Only ${MAX_FILES} files can go with one message.`);
    if (rejected.length > 0) setError(rejected.join(" "));
    setFiles((prev) => [...prev, ...read.filter((f): f is Picked => f !== null)]);
  }

  function startNew() {
    setActiveId(null);
    setDraft("");
    setFiles([]);
    setError(null);
  }

  function rename(id: string, title: string) {
    const clean = title.replace(/\s+/g, " ").trim();
    // An empty box means "leave it alone", not "call this chat nothing".
    if (clean.length === 0) return;
    setChats((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: clean.slice(0, 60) } : c))
    );
  }

  function remove(id: string) {
    setChats((prev) => prev.filter((c) => c.id !== id));
    // Dropping the open chat lands on the next most recent, not on nothing.
    if (id === activeId) {
      const rest = chats.filter((c) => c.id !== id);
      setActiveId(rest[0]?.id ?? null);
    }
  }

  return (
    <div className="flex h-[calc(100vh-13rem)] min-h-[26rem] gap-4">
      {/* conversation rail */}
      <aside className="hidden w-60 shrink-0 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-xs md:flex">
        <div className="border-b border-line p-2.5">
          <button
            type="button"
            onClick={startNew}
            className="flex w-full items-center gap-2 rounded-lg border border-line px-3 py-2 text-[12.5px] font-semibold text-fg transition hover:border-line-strong hover:bg-subtle"
          >
            <MessageSquarePlus size={15} /> New chat
          </button>
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto p-2">
          {chats.length === 0 ? (
            <p className="px-2 py-3 text-[12px] leading-relaxed text-faint">
              Saved chats appear here. They stay on this computer.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {chats.map((c) =>
                editing === c.id ? (
                  <li key={c.id} className="px-1 py-1">
                    <input
                      autoFocus
                      defaultValue={c.title}
                      onBlur={(e) => {
                        rename(c.id, e.target.value);
                        setEditing(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                        // Escape abandons the edit; blurring would save it.
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setEditing(null);
                        }
                      }}
                      className="w-full rounded-lg border border-brand-300 bg-surface px-2 py-1.5 text-[12.5px] text-fg outline-none"
                      aria-label="Chat name"
                    />
                  </li>
                ) : (
                  <li key={c.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => setActiveId(c.id)}
                      onDoubleClick={() => setEditing(c.id)}
                      className={cx(
                        "w-full rounded-lg px-2.5 py-2 pr-14 text-left transition",
                        c.id === activeId ? "bg-subtle" : "hover:bg-subtle/60"
                      )}
                    >
                      <span className="block truncate text-[12.5px] font-medium text-fg">
                        {c.title}
                      </span>
                      <span className="block text-[11px] text-faint">{when(c.updatedAt)}</span>
                    </button>
                    <div className="absolute right-1 top-1/2 flex -translate-y-1/2 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => setEditing(c.id)}
                        aria-label={`Rename "${c.title}"`}
                        className="rounded-md p-1.5 text-faint transition hover:bg-surface hover:text-fg"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(c.id)}
                        aria-label={`Delete "${c.title}"`}
                        className="rounded-md p-1.5 text-faint transition hover:bg-surface hover:text-red-600"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </li>
                )
              )}
            </ul>
          )}
        </div>
      </aside>

    <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
      <div className="scroll-thin flex-1 overflow-y-auto px-5 py-5">
        {turns.length === 0 ? (
          <div className="mx-auto flex max-w-lg flex-col items-center py-10 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-brand-50 text-brand-600">
              <Sparkles size={24} />
            </span>
            <h2 className="mt-4 text-[19px] font-bold text-fg">
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
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-left text-[13px] text-fg-soft transition hover:border-brand-300 hover:bg-brand-50/50"
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
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                    <Sparkles size={14} />
                  </span>
                )}
                <div
                  className={cx(
                    "text-[13.5px] leading-relaxed",
                    t.role === "user"
                      // The question keeps a bubble; the answer does not. An
                      // answer is the page's content, and boxing prose that
                      // runs to tables and code blocks only narrows it.
                      ? "max-w-[80%] whitespace-pre-wrap rounded-2xl bg-brand-solid px-4 py-2.5 text-white"
                      : "min-w-0 flex-1 space-y-3 pt-0.5 text-fg-soft"
                  )}
                >
                  {/* The reply is rendered; what the person typed is not — their
                      own asterisks are theirs, and should come back verbatim. */}
                  {t.role === "assistant" ? (
                    <>
                      <Markdown text={t.content} />
                      <CopyButton text={t.content} />
                    </>
                  ) : (
                    t.content
                  )}
                  {t.files && t.files.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 border-t border-white/25 pt-1.5">
                      {t.files.map((n) => (
                        <li key={n} className="flex items-center gap-1.5 text-[11.5px] opacity-90">
                          <Paperclip size={11} className="shrink-0" />
                          <span className="truncate">{n}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {t.role === "user" && (
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-subtle text-muted">
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
        <div className="mx-5 mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[12.5px] text-red-800">
          {error}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="border-t border-line bg-surface-2 px-4 py-3"
      >
        {files.length > 0 && (
          <ul className="mb-2 flex flex-wrap gap-2">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1 text-[11.5px] text-fg-soft"
              >
                {f.type.startsWith("image/") ? (
                  <ImageIcon size={12} className="shrink-0 text-muted" />
                ) : (
                  <FileText size={12} className="shrink-0 text-muted" />
                )}
                <span className="max-w-[160px] truncate">{f.name}</span>
                <span className="tnum text-faint">{Math.max(1, Math.round(f.size / 1024))}KB</span>
                <button
                  type="button"
                  onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
                  aria-label={`Remove ${f.name}`}
                  className="ml-0.5 text-faint transition hover:text-fg"
                >
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-end gap-2">
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            void pick(e.target.files);
            // Cleared so picking the same file twice still fires a change.
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy || files.length >= MAX_FILES}
          aria-label="Attach a PDF or image"
          title="Attach a PDF or image"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-surface text-fg-soft transition hover:border-line-strong disabled:text-faint"
        >
          <Paperclip size={16} />
        </button>
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
          placeholder="Ask about units, tenants, cheques — or attach a PDF or image…"
          className="scroll-thin max-h-32 flex-1 resize-none rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13.5px] text-fg outline-none placeholder:text-faint focus:border-brand-300"
        />
        <button
          type="submit"
          disabled={busy || (draft.trim().length === 0 && files.length === 0)}
          aria-label="Send"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-solid text-white transition hover:bg-brand-solid-hover disabled:bg-line-strong disabled:text-faint"
        >
          <ArrowUp size={17} />
        </button>
        </div>
      </form>
    </div>
    </div>
  );
}
