"use client";

import { Check, ChevronDown, Info, Lock } from "lucide-react";
import { cx } from "@/lib/utils";

export function Field({
  label,
  hint,
  required,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-medium text-fg">
        {label}
        {required && <span className="text-red-500">*</span>}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-[11.5px] font-medium text-red-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[11.5px] text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

const baseInput =
  "w-full rounded-lg border bg-surface px-3 py-2 text-[13.5px] text-fg shadow-xs transition " +
  "placeholder:text-faint focus:outline-none focus-visible:outline-none " +
  "focus:ring-[3px] focus:ring-brand-500/20";

export function Input({
  invalid,
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      {...rest}
      className={cx(
        baseInput,
        invalid ? "border-red-300 focus:border-red-400" : "border-line focus:border-brand-500",
        rest.disabled && "cursor-not-allowed bg-subtle text-faint",
        className
      )}
    />
  );
}

export function Textarea({
  invalid,
  className,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      {...rest}
      className={cx(
        baseInput,
        "min-h-[84px] resize-y",
        invalid ? "border-red-300" : "border-line focus:border-brand-500",
        className
      )}
    />
  );
}

export function Select({
  invalid,
  className,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <div className="relative">
      <select
        {...rest}
        className={cx(
          baseInput,
          "appearance-none pr-9",
          invalid ? "border-red-300" : "border-line focus:border-brand-500",
          rest.disabled && "cursor-not-allowed bg-subtle text-faint",
          className
        )}
      >
        {children}
      </select>
      <ChevronDown
        size={15}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint"
      />
    </div>
  );
}

/** A required checklist row the employee must actively tick. */
export function CheckItem({
  checked,
  onChange,
  title,
  detail,
  disabled,
  locked,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  detail?: string;
  disabled?: boolean;
  locked?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled || !!locked}
      onClick={() => onChange(!checked)}
      className={cx(
        "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition",
        locked
          ? "cursor-not-allowed border-line bg-subtle"
          : checked
          ? "border-brand-400 bg-brand-50/60"
          : "border-line bg-surface hover:border-brand-300 hover:bg-subtle"
      )}
    >
      <span
        className={cx(
          "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border transition",
          checked ? "border-brand-solid bg-brand-solid text-white" : "border-line-strong bg-surface"
        )}
      >
        {locked ? <Lock size={11} className="text-faint" /> : checked ? <Check size={13} /> : null}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-fg">{title}</span>
        {detail && <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">{detail}</span>}
        {locked && <span className="mt-1 block text-[11.5px] font-medium text-amber-700">{locked}</span>}
      </span>
    </button>
  );
}

/** Big selectable cards — used for choices that change the rest of the flow. */
export function RadioCards<T extends string>({
  value,
  onChange,
  options,
  columns = 2,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; title: string; detail?: string; icon?: React.ReactNode }[];
  columns?: number;
}) {
  return (
    <div className={cx("grid gap-2.5", columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            "flex items-start gap-3 rounded-xl border p-3.5 text-left transition",
            value === o.value
              ? "border-brand-500 bg-brand-50/70 ring-1 ring-brand-500"
              : "border-line bg-surface hover:border-brand-300"
          )}
        >
          {o.icon && (
            <span
              className={cx(
                "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
                value === o.value ? "bg-brand-solid text-white" : "bg-subtle text-muted"
              )}
            >
              {o.icon}
            </span>
          )}
          <span className="min-w-0">
            <span className="block text-[13.5px] font-medium text-fg">{o.title}</span>
            {o.detail && (
              <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">{o.detail}</span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

export function Note({
  tone = "info",
  children,
  title,
}: {
  tone?: "info" | "warn" | "danger" | "good";
  title?: string;
  children: React.ReactNode;
}) {
  const styles = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    danger: "border-red-200 bg-red-50 text-red-900",
    good: "border-brand-200 bg-brand-50 text-brand-900",
  }[tone];
  return (
    <div className={cx("flex gap-2.5 rounded-lg border p-3 text-[12.5px] leading-relaxed", styles)}>
      <Info size={15} className="mt-0.5 shrink-0 opacity-70" />
      <div>
        {title && <p className="mb-0.5 font-semibold">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}

export function Row({ children, cols = 2 }: { children: React.ReactNode; cols?: 1 | 2 | 3 }) {
  return (
    <div
      className={cx(
        "grid gap-4",
        cols === 1 ? "" : cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"
      )}
    >
      {children}
    </div>
  );
}

export function KV({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line-soft py-2 last:border-0">
      <span className="shrink-0 text-[12px] text-muted">{label}</span>
      <span className={cx("text-right text-[12.5px]", strong ? "font-semibold text-fg" : "text-fg")}>
        {value}
      </span>
    </div>
  );
}
