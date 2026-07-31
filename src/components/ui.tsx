import Link from "next/link";
import { cx } from "@/lib/utils";

/* ------------------------------------------------------------------ cards */

export function Card({
  children,
  className,
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={cx(
        "rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,.04)]",
        padded && "p-5",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHead({
  title,
  sub,
  action,
  icon,
}: {
  title: string;
  sub?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div className="flex gap-3">
        {icon && <div className="mt-0.5 text-brand-600">{icon}</div>}
        <div>
          <h2 className="text-[15px] font-semibold text-ink-900">{title}</h2>
          {sub && <p className="text-[13px] text-slate-500 mt-0.5">{sub}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function PageHead({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{title}</h1>
        {sub && <p className="text-sm text-slate-500 mt-1 max-w-2xl">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/* ----------------------------------------------------------------- badges */

const TONES = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  good: "bg-brand-50 text-brand-700 ring-brand-200",
  warn: "bg-amber-50 text-amber-800 ring-amber-200",
  bad: "bg-red-50 text-red-700 ring-red-200",
  info: "bg-sky-50 text-sky-800 ring-sky-200",
  gold: "bg-gold-100 text-gold-500 ring-amber-200",
} as const;

export type Tone = keyof typeof TONES;

export function Badge({
  children,
  tone = "neutral",
  dot,
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap",
        TONES[tone],
        className
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------- buttons */

const VARIANTS = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 shadow-sm disabled:bg-slate-300 disabled:shadow-none",
  dark: "bg-ink-900 text-white hover:bg-ink-800 shadow-sm disabled:bg-slate-300",
  outline: "bg-white text-ink-900 ring-1 ring-inset ring-line hover:bg-slate-50 disabled:text-slate-400",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-ink-900",
  danger: "bg-red-600 text-white hover:bg-red-700 shadow-sm disabled:bg-slate-300",
} as const;

const SIZES = {
  sm: "h-8 px-3 text-[13px] rounded-lg gap-1.5",
  md: "h-10 px-4 text-sm rounded-lg gap-2",
  lg: "h-11 px-5 text-sm rounded-lg gap-2",
} as const;

type BtnProps = {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  className?: string;
  children: React.ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: BtnProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={cx(
        "inline-flex items-center justify-center font-medium transition-colors disabled:cursor-not-allowed",
        VARIANTS[variant],
        SIZES[size],
        className
      )}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
}: BtnProps & { href: string }) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex items-center justify-center font-medium transition-colors",
        VARIANTS[variant],
        SIZES[size],
        className
      )}
    >
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ stats */

export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
  icon,
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
  icon?: React.ReactNode;
  href?: string;
}) {
  const accent = {
    neutral: "text-ink-900",
    good: "text-brand-600",
    warn: "text-amber-600",
    bad: "text-red-600",
    info: "text-sky-700",
    gold: "text-gold-500",
  }[tone];

  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium uppercase tracking-wide text-slate-500">
          {label}
        </span>
        {icon && <span className="text-slate-300">{icon}</span>}
      </div>
      <div className={cx("mt-2 text-[26px] font-semibold tracking-tight tnum", accent)}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[12px] text-slate-500">{sub}</div>}
    </>
  );

  return href ? (
    <Link
      href={href}
      className="rounded-xl border border-line bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,.04)] transition hover:border-brand-200 hover:shadow-md block"
    >
      {body}
    </Link>
  ) : (
    <div className="rounded-xl border border-line bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,.04)]">
      {body}
    </div>
  );
}

/* ----------------------------------------------------------------- tables */

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cx("overflow-x-auto scroll-thin -mx-5 px-5", className)}>
      <table className="w-full min-w-[640px] text-sm">{children}</table>
    </div>
  );
}

export function TH({
  children,
  className,
  align = "left",
}: {
  children?: React.ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      className={cx(
        "border-b border-line pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        className
      )}
    >
      {children}
    </th>
  );
}

export function TD({
  children,
  className,
  align = "left",
}: {
  children?: React.ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
}) {
  return (
    <td
      className={cx(
        "border-b border-slate-100 py-2.5 pr-4 align-middle text-[13px] text-slate-700",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className
      )}
    >
      {children}
    </td>
  );
}

export function Empty({ title, sub, icon }: { title: string; sub?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line py-12 text-center">
      {icon && <div className="text-slate-300">{icon}</div>}
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {sub && <p className="text-[13px] text-slate-400 max-w-sm">{sub}</p>}
    </div>
  );
}

/* --------------------------------------------------------------- progress */

export function Bar({ value, tone = "good" }: { value: number; tone?: Tone }) {
  const bg = {
    neutral: "bg-slate-400",
    good: "bg-brand-500",
    warn: "bg-amber-500",
    bad: "bg-red-500",
    info: "bg-sky-500",
    gold: "bg-gold-500",
  }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={cx("h-full rounded-full transition-all", bg)} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  );
}

/* ----------------------------------------------------------- status chips */

export function ChequeStatusBadge({ status }: { status: string }) {
  const map: Record<string, [Tone, string]> = {
    pending: ["neutral", "Pending"],
    deposited: ["info", "Deposited"],
    cleared: ["good", "Cleared"],
    bounced: ["bad", "Bounced"],
    replaced: ["neutral", "Replaced"],
    cancelled: ["neutral", "Cancelled"],
  };
  const [tone, label] = map[status] ?? ["neutral", status];
  return <Badge tone={tone} dot>{label}</Badge>;
}

export function ContractStatusBadge({ status }: { status: string }) {
  const map: Record<string, [Tone, string]> = {
    draft: ["neutral", "Draft"],
    pending_approval: ["warn", "Awaiting approval"],
    active: ["good", "Active"],
    expiring: ["warn", "Expiring"],
    renewed: ["info", "Renewed"],
    terminated: ["neutral", "Terminated"],
    rejected: ["bad", "Rejected"],
  };
  const [tone, label] = map[status] ?? ["neutral", status];
  return <Badge tone={tone} dot>{label}</Badge>;
}
