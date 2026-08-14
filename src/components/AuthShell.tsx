import Link from "next/link";
import { cx } from "@/lib/utils";
import ThemeToggle from "./ThemeToggle";
import { BrandLockup, BrandRow } from "./Brand";

/**
 * The frame every signed-out screen sits in: the brand held on a black panel to
 * the left, and a single column of content to the right with the room to
 * breathe that the dense in-app screens cannot afford.
 */
export function AuthShell({
  children,
  aside,
}: {
  children: React.ReactNode;
  /** Supporting content under the brand lockup on the dark panel. */
  aside?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[0.9fr_1.1fr]">
      {/* brand panel — black in both themes, like the printed identity */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-inverse px-14 py-16 text-inverse-fg lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -left-24 h-[28rem] w-[28rem] rounded-full opacity-20 blur-3xl"
          style={{ background: "radial-gradient(circle, #ffffff, transparent 70%)" }}
        />

        <div className="relative" />

        <BrandLockup size="lg" muted="text-inverse-muted" className="relative" />

        <div className="relative">
          {aside}
          <p className="mt-10 text-[11px] tracking-wide text-inverse-muted/70">
            Internal system · Access is logged
          </p>
        </div>
      </div>

      {/* content panel */}
      <div className="relative flex flex-col bg-canvas">
        <div className="flex items-center justify-between px-6 py-6 lg:px-14">
          <div className="text-fg lg:invisible">
            <BrandRow />
          </div>
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center px-6 pb-16 lg:px-14">
          <div className="w-full max-w-[440px] fade-up">{children}</div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ header */

export function AuthHeading({
  eyebrow,
  title,
  sub,
}: {
  eyebrow?: string;
  title: string;
  sub?: React.ReactNode;
}) {
  return (
    <div className="mb-9">
      {eyebrow && (
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          {eyebrow}
        </p>
      )}
      <h1 className="text-[32px] font-semibold leading-[1.08] tracking-[-0.02em] text-fg sm:text-[36px]">
        {title}
      </h1>
      {sub && <p className="mt-4 text-[15px] leading-relaxed text-muted">{sub}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ fields */

export function AuthField({
  label,
  htmlFor,
  error,
  hint,
  optional,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className="mb-2 flex items-baseline justify-between gap-3 text-[13px] font-medium text-fg"
      >
        {label}
        {optional && <span className="text-[12px] font-normal text-faint">Optional</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-2 text-[12.5px] font-medium text-red-700">{error}</p>
      ) : hint ? (
        <p className="mt-2 text-[12.5px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export const authInputClass =
  "h-14 w-full rounded-2xl border bg-surface px-4 text-[15px] text-fg shadow-xs transition " +
  "placeholder:text-faint focus:outline-none focus-visible:outline-none focus:ring-4 focus:ring-brand-500/15";

export function AuthInput({
  invalid,
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      {...rest}
      aria-invalid={invalid || undefined}
      className={cx(
        authInputClass,
        invalid ? "border-red-300 focus:border-red-300" : "border-line focus:border-fg-soft",
        className
      )}
    />
  );
}

/* ----------------------------------------------------------------- actions */

/** Full-width pill in the brand's black — the single obvious next step. */
export function AuthSubmit({
  pending,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { pending?: boolean }) {
  return (
    <button
      {...rest}
      type="submit"
      disabled={pending || rest.disabled}
      className={cx(
        "inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-full bg-inverse",
        "text-[15px] font-medium text-inverse-fg transition",
        "hover:bg-inverse-2 disabled:cursor-not-allowed disabled:opacity-55"
      )}
    >
      {pending && (
        <span
          aria-hidden
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
        />
      )}
      {children}
    </button>
  );
}

export function AuthAlert({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] font-medium text-red-800"
    >
      {children}
    </p>
  );
}

export function AuthFooterLink({
  question,
  href,
  action,
}: {
  question: string;
  href: string;
  action: string;
}) {
  return (
    <p className="mt-8 border-t border-line-soft pt-6 text-center text-[14px] text-muted">
      {question}{" "}
      <Link
        href={href}
        className="font-medium text-fg underline decoration-line-strong underline-offset-4 transition hover:decoration-fg"
      >
        {action}
      </Link>
    </p>
  );
}
