"use client";

import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Building2, CornerDownLeft, DoorOpen, FileSignature, Landmark, Loader2, Search, Users, X,
} from "lucide-react";
import { cx } from "@/lib/utils";
import { searchAction, type SearchHit, type SearchKind } from "@/lib/actions/search";

export interface PageTarget {
  href: string;
  label: string;
  group: string;
}

type Row =
  | { type: "page"; href: string; title: string; sub: string }
  | { type: "hit"; href: string; title: string; sub: string; kind: SearchKind };

const KIND_META: Record<SearchKind | "page", { label: string; icon: typeof Search }> = {
  page: { label: "Pages", icon: CornerDownLeft },
  property: { label: "Properties", icon: Building2 },
  unit: { label: "Units", icon: DoorOpen },
  tenant: { label: "Tenants", icon: Users },
  contract: { label: "Contracts", icon: FileSignature },
  cheque: { label: "Cheques", icon: Landmark },
};

const ORDER: (SearchKind | "page")[] = [
  "page", "unit", "tenant", "contract", "cheque", "property",
];

const DEBOUNCE_MS = 160;

export default function CommandPalette({ pages }: { pages: PageTarget[] }) {
  const router = useRouter();
  const listId = useId();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [pending, startTransition] = useTransition();

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** Guards against a slow early request overwriting a newer one's results. */
  const seq = useRef(0);

  /* ------------------------------------------------------------ open/close */

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setHits([]);
    setActive(0);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  /* Locks background scrolling while the dialog is up. */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  /* -------------------------------------------------------------- querying */

  /* Typing resets the highlight and drops stale results straight away, so the
     list never shows matches for a query the box no longer contains. */
  const onChange = (value: string) => {
    setQuery(value);
    setActive(0);
    if (value.trim().length < 2) {
      seq.current += 1;
      setHits([]);
    }
  };

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const mine = ++seq.current;
    const t = setTimeout(() => {
      startTransition(async () => {
        const res = await searchAction(q);
        // A newer keystroke already fired; its results win.
        if (seq.current === mine) {
          setHits(res);
          setActive(0);
        }
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  /* Page matches are filtered on the client — the nav list is already here and
     is small enough that a round trip would only add latency. */
  const q = query.trim().toLowerCase();
  const pageRows: Row[] =
    q.length === 0
      ? []
      : pages
          .filter((p) => p.label.toLowerCase().includes(q) || p.group.toLowerCase().includes(q))
          .slice(0, 5)
          .map((p) => ({ type: "page", href: p.href, title: p.label, sub: p.group }));

  const hitRows: Row[] = hits.map((h) => ({
    type: "hit",
    href: h.href,
    title: h.title,
    sub: h.sub,
    kind: h.kind,
  }));

  const grouped = ORDER.map((kind) => ({
    kind,
    rows:
      kind === "page"
        ? pageRows
        : hitRows.filter((r) => r.type === "hit" && r.kind === kind),
  })).filter((g) => g.rows.length > 0);

  /* Flat order drives arrow-key movement across group boundaries. */
  const flat = grouped.flatMap((g) => g.rows);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router]
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (flat.length === 0) return;
      setActive((i) => {
        const next = e.key === "ArrowDown" ? i + 1 : i - 1;
        return (next + flat.length) % flat.length;
      });
      return;
    }
    if (e.key === "Enter" && flat[active]) {
      e.preventDefault();
      go(flat[active].href);
    }
  };

  /* Keeps the highlighted row inside the scroll box during arrow-key runs. */
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  /* ------------------------------------------------------------------ view */

  let idx = -1;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        aria-keyshortcuts="Meta+K Control+K"
        className="hidden items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2 text-[13px] text-faint transition hover:border-line-strong hover:text-muted md:flex"
      >
        <Search size={14} />
        <span>Search unit, tenant, cheque…</span>
        <kbd className="ml-2 rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] text-faint">
          ⌘K
        </kbd>
      </button>

      {/* Compact trigger for the mobile header, where the full bar has no room. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-surface text-muted transition hover:border-line-strong hover:text-fg md:hidden"
      >
        <Search size={16} />
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[10vh]">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={close}
            aria-hidden
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            className="fade-up relative flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-lg"
          >
            <div className="flex shrink-0 items-center gap-3 border-b border-line px-4">
              {pending ? (
                <Loader2 size={16} className="shrink-0 animate-spin text-brand-500" />
              ) : (
                <Search size={16} className="shrink-0 text-faint" />
              )}
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search units, tenants, contracts, cheques…"
                aria-controls={listId}
                aria-autocomplete="list"
                className="h-14 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-faint"
              />
              <button
                type="button"
                onClick={close}
                aria-label="Close search"
                className="shrink-0 rounded-md p-1 text-faint transition hover:bg-subtle hover:text-fg"
              >
                <X size={15} />
              </button>
            </div>

            <div ref={listRef} id={listId} className="scroll-thin flex-1 overflow-y-auto p-2">
              {q.length < 2 ? (
                <p className="px-3 py-8 text-center text-[13px] text-muted">
                  Type at least two characters — unit number, tenant name, cheque number, Ejari or
                  contract reference.
                </p>
              ) : flat.length === 0 ? (
                <p className="px-3 py-8 text-center text-[13px] text-muted">
                  {pending ? "Searching…" : <>No matches for &ldquo;{query.trim()}&rdquo;.</>}
                </p>
              ) : (
                grouped.map((g) => {
                  const meta = KIND_META[g.kind];
                  return (
                    <div key={g.kind} className="mb-1">
                      <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-faint">
                        {meta.label}
                      </p>
                      {g.rows.map((r) => {
                        idx += 1;
                        const i = idx;
                        return (
                          <button
                            key={`${r.href}-${i}`}
                            data-idx={i}
                            type="button"
                            onClick={() => go(r.href)}
                            onMouseMove={() => setActive(i)}
                            className={cx(
                              "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                              i === active ? "bg-brand-50" : "hover:bg-subtle"
                            )}
                          >
                            <span
                              className={cx(
                                "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
                                i === active
                                  ? "bg-brand-solid text-white"
                                  : "bg-subtle text-muted"
                              )}
                            >
                              <meta.icon size={15} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13.5px] font-medium text-fg">
                                {r.title}
                              </span>
                              <span className="block truncate text-[11.5px] text-muted">
                                {r.sub}
                              </span>
                            </span>
                            {i === active && (
                              <CornerDownLeft size={13} className="shrink-0 text-brand-600" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex shrink-0 items-center gap-4 border-t border-line bg-surface-2 px-4 py-2 text-[11px] text-faint">
              <span className="flex items-center gap-1">
                <Key>↑</Key>
                <Key>↓</Key>
                move
              </span>
              <span className="flex items-center gap-1">
                <Key>↵</Key>
                open
              </span>
              <span className="flex items-center gap-1">
                <Key>esc</Key>
                close
              </span>
              <span className="ml-auto">Results respect your role.</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-surface px-1 py-0.5 text-[10px] leading-none text-muted">
      {children}
    </kbd>
  );
}
