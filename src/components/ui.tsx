import Link from "next/link";
import { cx } from "@/lib/utils";

/* ============================================================================
   The shared kit, in the dashboard's voice.

   The dashboard set the house style — bold, tightly tracked headings, softly
   rounded cards, pill-shaped controls and pastel stat tiles. Every other page
   is built from the pieces below, so the style lives here rather than being
   re-typed into twenty-five files: change a heading size once and the whole
   app moves with it.

   The scale, for anyone adding to it:
     page title    26px / bold / -0.02em
     section head  19px / bold
     card head     17px / bold
     body          13.5px
     meta          12px, muted
   ========================================================================== */

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
        "rounded-2xl border border-line bg-surface shadow-xs",
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
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-700">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold leading-snug text-fg">{title}</h2>
          {sub && <p className="mt-1 text-[13px] leading-relaxed text-muted">{sub}</p>}
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
        <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em] text-fg">{title}</h1>
        {sub && <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-muted">{sub}</p>}
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
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-semibold ring-1 ring-inset",
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
    "bg-surface text-fg-soft ring-1 ring-inset ring-line hover:text-fg hover:ring-line-strong disabled:text-faint",
  ghost: "text-muted hover:bg-subtle hover:text-fg",
  danger:
    "bg-red-600 text-white shadow-xs hover:bg-red-700 disabled:bg-line-strong disabled:text-faint",
} as const;

/* Pills, like the dashboard's "View all" and "Book a viewing" controls. */
const SIZES = {
  sm: "h-8 gap-1.5 rounded-xl px-3.5 text-[12.5px]",
  md: "h-10 gap-2 rounded-xl px-4 text-[13.5px]",
  lg: "h-11 gap-2 rounded-2xl px-5 text-[14px]",
} as const;

const BTN_BASE =
  "inline-flex select-none items-center justify-center font-semibold transition duration-150 disabled:cursor-not-allowed";

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

/* Tinted chip behind a stat's icon, matching the dashboard's round icon
   wells. Uses the 100/700 steps so the glyph keeps its contrast on the tint. */
const STAT_CHIP: Record<Tone, string> = {
  neutral: "bg-subtle text-muted",
  good: "bg-brand-100 text-brand-700",
  warn: "bg-amber-100 text-amber-800",
  bad: "bg-red-100 text-red-700",
  info: "bg-sky-100 text-sky-800",
  gold: "bg-gold-100 text-gold-700",
};

/* The tile itself, following the dashboard's pastel finance cards.

   Only the tones that mean "look at this" get the wash: a row where every tile
   is tinted says nothing, and a healthy figure tinted like an alarming one is
   worse than saying nothing. Good and neutral keep the plain surface and carry
   their tone in the figure alone. */
const STAT_SURFACE: Record<Tone, string> = {
  neutral: "border-line bg-surface",
  good: "border-line bg-surface",
  info: "border-line bg-surface",
  warn: "border-amber-200 bg-amber-50",
  bad: "border-red-200 bg-red-50",
  gold: "border-gold-200 bg-gold-50",
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
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-semibold text-fg-soft">{label}</span>
        {icon && (
          <span
            className={cx(
              "grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors",
              STAT_CHIP[tone]
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <div
        className={cx(
          "tnum mt-4 text-[30px] font-bold leading-none tracking-[-0.02em]",
          STAT_ACCENT[tone]
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-2 text-[12px] leading-snug text-muted">{sub}</div>}
    </>
  );

  const shell = cx("rounded-2xl border p-5 shadow-xs", STAT_SURFACE[tone]);

  return href ? (
    <Link
      href={href}
      className={cx(
        shell,
        "group block transition duration-200 hover:-translate-y-px hover:border-line-strong hover:shadow-md"
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
        // pr-4 matches TD, so a right-aligned column's heading cannot run
        // into the heading beside it.
        "border-b border-line-soft pb-3 pr-4 pt-1 text-[12px] font-medium uppercase tracking-[0.06em] text-muted",
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
        "border-b border-line-soft py-3.5 pr-4 align-middle text-[13px] text-fg-soft",
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
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-surface-2 py-14 text-center">
      {icon && (
        <span className="mb-1 grid h-12 w-12 place-items-center rounded-full bg-subtle text-faint">
          {icon}
        </span>
      )}
      <p className="text-[15px] font-bold text-fg">{title}</p>
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
