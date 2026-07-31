"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, Check, CircleAlert, Loader2, Lock, ShieldCheck, X,
} from "lucide-react";
import { cx } from "@/lib/utils";

export interface StepCtx<T> {
  data: T;
  set: (patch: Partial<T>) => void;
  replace: (next: T) => void;
}

export interface StepDef<T> {
  id: string;
  title: string;
  /** One line explaining what this step is for. */
  hint: string;
  /** Blocking problems. Empty array means the employee may continue. */
  problems: (data: T) => string[];
  render: (ctx: StepCtx<T>) => React.ReactNode;
}

export type SubmitResult = { ok: true; href: string; message?: string } | { ok: false; message: string };

export default function Wizard<T>({
  title,
  subtitle,
  steps,
  initial,
  submitLabel,
  submitNote,
  onSubmit,
  exitHref,
}: {
  title: string;
  subtitle: string;
  steps: StepDef<T>[];
  initial: T;
  submitLabel: string;
  submitNote?: string;
  onSubmit: (payload: string) => Promise<SubmitResult>;
  exitHref: string;
}) {
  const [data, setData] = useState<T>(initial);
  const [index, setIndex] = useState(0);
  const [attempted, setAttempted] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const set = (patch: Partial<T>) => setData((d) => ({ ...d, ...patch }));
  const replace = (next: T) => setData(next);

  const allProblems = useMemo(() => steps.map((s) => s.problems(data)), [steps, data]);
  const step = steps[index];
  const problems = allProblems[index];
  const clean = problems.length === 0;
  /** A step is reachable only when every earlier step is complete. */
  const firstBlocked = allProblems.findIndex((p) => p.length > 0);
  const reachable = (i: number) => firstBlocked === -1 || i <= firstBlocked;
  const isLast = index === steps.length - 1;
  const completedCount = allProblems.filter((p) => p.length === 0).length;

  function next() {
    setAttempted((a) => ({ ...a, [index]: true }));
    if (!clean) return;
    if (isLast) return submit();
    setIndex((i) => Math.min(steps.length - 1, i + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function submit() {
    setError(null);
    start(async () => {
      const res = await onSubmit(JSON.stringify(data));
      if (res.ok) router.push(res.href);
      else setError(res.message);
    });
  }

  return (
    <div className="mx-auto max-w-6xl">
      {/* ------------------------------------------------------------ header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600">
            Guided procedure
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">{subtitle}</p>
        </div>
        <Link
          href={exitHref}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-2 text-[13px] text-slate-600 transition hover:text-ink-900"
        >
          <X size={14} />
          Cancel
        </Link>
      </div>

      <div className="mb-5 rounded-xl border border-line bg-white p-3">
        <div className="mb-2 flex items-center justify-between text-[12px]">
          <span className="font-medium text-ink-900">
            Step {index + 1} of {steps.length} — {step.title}
          </span>
          <span className="text-slate-500">
            {completedCount} of {steps.length} steps complete
          </span>
        </div>
        <div className="flex gap-1">
          {steps.map((s, i) => (
            <div
              key={s.id}
              className={cx(
                "h-1.5 flex-1 rounded-full transition-colors",
                allProblems[i].length === 0
                  ? "bg-brand-500"
                  : i === index
                  ? "bg-brand-200"
                  : "bg-slate-200"
              )}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[264px_1fr]">
        {/* --------------------------------------------------------- step rail */}
        <ol className="hidden h-fit rounded-xl border border-line bg-white p-2 lg:sticky lg:top-24 lg:block">
          {steps.map((s, i) => {
            const done = allProblems[i].length === 0;
            const current = i === index;
            const locked = !reachable(i);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => !locked && setIndex(i)}
                  className={cx(
                    "flex w-full items-start gap-3 rounded-lg p-2.5 text-left transition",
                    current
                      ? "bg-brand-50 ring-1 ring-inset ring-brand-200"
                      : locked
                      ? "cursor-not-allowed opacity-45"
                      : "hover:bg-slate-50"
                  )}
                >
                  <span
                    className={cx(
                      "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold transition",
                      done
                        ? "bg-brand-600 text-white"
                        : current
                        ? "bg-ink-900 text-white"
                        : "bg-slate-100 text-slate-500"
                    )}
                  >
                    {done ? <Check size={13} /> : locked ? <Lock size={10} /> : i + 1}
                  </span>
                  <span className="min-w-0 pt-0.5">
                    <span
                      className={cx(
                        "block text-[12.5px] leading-snug",
                        current ? "font-semibold text-ink-900" : done ? "text-ink-900" : "text-slate-600"
                      )}
                    >
                      {s.title}
                    </span>
                    {current && (
                      <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{s.hint}</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
          <li className="mt-2 border-t border-line px-2.5 pb-1 pt-3">
            <p className="flex items-start gap-2 text-[11px] leading-snug text-slate-500">
              <Lock size={11} className="mt-0.5 shrink-0" />
              Later steps stay locked until the current one is complete and valid.
            </p>
          </li>
        </ol>

        {/* ------------------------------------------------------ step content */}
        <div>
          <div className="rounded-xl border border-line bg-white">
            <div className="border-b border-line px-5 py-4 lg:px-6">
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-ink-900 text-[11px] font-semibold text-white lg:hidden">
                  {index + 1}
                </span>
                <h2 className="text-[16px] font-semibold text-ink-900">{step.title}</h2>
              </div>
              <p className="mt-1 text-[13px] text-slate-500">{step.hint}</p>
            </div>

            <div key={step.id} className="fade-up space-y-5 px-5 py-5 lg:px-6">
              {step.render({ data, set, replace })}
            </div>

            {/* live requirement panel */}
            <div className="border-t border-line px-5 py-4 lg:px-6">
              {clean ? (
                <div className="flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2.5 text-[12.5px] font-medium text-brand-700">
                  <ShieldCheck size={15} />
                  This step is complete. You can continue.
                </div>
              ) : (
                <div
                  className={cx(
                    "rounded-lg border px-3 py-2.5",
                    attempted[index] ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"
                  )}
                >
                  <p
                    className={cx(
                      "mb-1.5 flex items-center gap-2 text-[12.5px] font-semibold",
                      attempted[index] ? "text-red-800" : "text-amber-900"
                    )}
                  >
                    <CircleAlert size={14} />
                    {attempted[index]
                      ? "You cannot continue until these are fixed"
                      : `${problems.length} item${problems.length > 1 ? "s" : ""} still required`}
                  </p>
                  <ul className="space-y-1 pl-6">
                    {problems.map((p) => (
                      <li
                        key={p}
                        className={cx(
                          "list-disc text-[12px]",
                          attempted[index] ? "text-red-700" : "text-amber-800"
                        )}
                      >
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12.5px] text-red-800">
              {error}
            </div>
          )}

          {/* ----------------------------------------------------------- footer */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0 || pending}
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-medium text-ink-900 transition hover:bg-slate-50 disabled:opacity-40"
            >
              <ArrowLeft size={15} />
              Back
            </button>

            <button
              type="button"
              onClick={next}
              disabled={pending || (!clean && attempted[index])}
              className={cx(
                "inline-flex h-11 items-center gap-2 rounded-lg px-5 text-sm font-medium text-white transition",
                clean
                  ? isLast
                    ? "bg-ink-900 hover:bg-ink-800"
                    : "bg-brand-600 hover:bg-brand-700"
                  : "bg-slate-300 cursor-not-allowed"
              )}
            >
              {pending && <Loader2 size={15} className="animate-spin" />}
              {isLast ? submitLabel : "Continue"}
              {!pending && <ArrowRight size={15} />}
            </button>

            {isLast && submitNote && (
              <p className="text-[12px] text-slate-500 sm:ml-2 sm:max-w-xs">{submitNote}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
