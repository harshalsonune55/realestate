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
        "rounded-xl border border-line bg-surface shadow-xs",
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
    <div className="mb-4 flex items-start justify-between gap-4">
      <div className="flex min-w-0 gap-3">
        {icon && (
          <span className="mt-px grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-snug text-fg">{title}</h2>
          {sub && <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{sub}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
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
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[26px] font-semibold leading-tight text-fg">{title}</h1>
        {sub && <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/* ----------------------------------------------------------------- badges */

const TONES = {
  neutral: "bg-subtle text-fg-soft ring-line",
  good: "bg-brand-50 text-brand-700 ring-brand-200",
  warn: "bg-amber-50 text-amber-800 ring-amber-200",
  bad: "bg-red-50 text-red-800 ring-red-200",
  info: "bg-sky-50 text-sky-800 ring-sky-200",
  gold: "bg-gold-50 text-gold-700 ring-gold-200",
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
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
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
    "bg-brand-solid text-white shadow-xs hover:bg-brand-solid-hover active:bg-brand-solid-active disabled:bg-line-strong disabled:text-faint disabled:shadow-none",
  dark: "bg-inverse text-white shadow-xs hover:bg-inverse-2 disabled:bg-line-strong disabled:text-faint",
  outline:
    "bg-surface text-fg ring-1 ring-inset ring-line hover:bg-subtle hover:ring-line-strong disabled:text-faint",
  ghost: "text-muted hover:bg-subtle hover:text-fg",
  danger:
    "bg-red-600 text-white shadow-xs hover:bg-red-700 disabled:bg-line-strong disabled:text-faint",
} as const;

const SIZES = {
  sm: "h-8 gap-1.5 rounded-lg px-3 text-[13px]",
  md: "h-10 gap-2 rounded-lg px-4 text-sm",
  lg: "h-11 gap-2 rounded-lg px-5 text-sm",
} as const;

const BTN_BASE =
  "inline-flex select-none items-center justify-center font-medium transition-colors duration-150 disabled:cursor-not-allowed";

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
    <button {...rest} className={cx(BTN_BASE, VARIANTS[variant], SIZES[size], className)}>
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
    <Link href={href} className={cx(BTN_BASE, VARIANTS[variant], SIZES[size], className)}>
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ stats */

const STAT_ACCENT: Record<Tone, string> = {
  neutral: "text-fg",
  good: "text-brand-600",
  warn: "text-amber-700",
  bad: "text-red-700",
  info: "text-sky-700",
  gold: "text-gold-600",
};

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
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
          {label}
        </span>
        {icon && <span className="text-faint">{icon}</span>}
      </div>
      <div className={cx("tnum mt-2 text-[26px] font-semibold leading-none", STAT_ACCENT[tone])}>
        {value}
      </div>
      {sub && <div className="mt-2 text-[12px] leading-snug text-muted">{sub}</div>}
    </>
  );

  const shell = "rounded-xl border border-line bg-surface p-4 shadow-xs";

  return href ? (
    <Link
      href={href}
      className={cx(
        shell,
        "group block transition duration-200 hover:-translate-y-px hover:border-brand-300 hover:shadow-md"
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}

/* ----------------------------------------------------------------- tables */

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cx("scroll-thin -mx-5 overflow-x-auto px-5", className)}>
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
        "border-b border-line pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted",
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
        "border-b border-line-soft py-2.5 pr-4 align-middle text-[13px] text-fg-soft",
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
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-surface-2 py-12 text-center">
      {icon && (
        <span className="mb-1 grid h-10 w-10 place-items-center rounded-full bg-subtle text-faint">
          {icon}
        </span>
      )}
      <p className="text-sm font-medium text-fg-soft">{title}</p>
      {sub && <p className="max-w-sm text-[13px] leading-relaxed text-muted">{sub}</p>}
    </div>
  );
}

/* --------------------------------------------------------------- progress */

const BAR_FILL: Record<Tone, string> = {
  neutral: "bg-faint",
  good: "bg-brand-500",
  warn: "bg-amber-500",
  bad: "bg-red-500",
  info: "bg-sky-500",
  gold: "bg-gold-500",
};

export function Bar({ value, tone = "good" }: { value: number; tone?: Tone }) {
  const pct = Math.min(100, Math.max(0, value * 100));
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-subtle"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cx("h-full rounded-full transition-[width] duration-500", BAR_FILL[tone])}
        style={{ width: `${pct}%` }}
      />
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
  return (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  );
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
  return (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  );
}
