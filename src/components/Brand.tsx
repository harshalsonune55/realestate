import { cx } from "@/lib/utils";

/**
 * The Aber Group identity, drawn rather than imported as an image so it stays
 * crisp at any size, inherits the surrounding colour, and needs no asset
 * pipeline. The monogram is a serif A and G pulled together with negative
 * tracking so the letters interlock the way they do in the printed mark.
 */

const MONOGRAM_SIZE = {
  sm: "h-7",
  md: "h-10",
  lg: "h-16",
} as const;

export function Monogram({
  size = "md",
  className,
}: {
  size?: keyof typeof MONOGRAM_SIZE;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 128 96"
      role="img"
      aria-label="Aber Group"
      className={cx("w-auto", MONOGRAM_SIZE[size], className)}
    >
      <text
        x="64"
        y="76"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="Georgia, 'Times New Roman', 'Playfair Display', serif"
        fontSize="88"
        letterSpacing="-16"
      >
        AG
      </text>
    </svg>
  );
}

const WORDMARK_SIZE = {
  sm: { name: "text-[11px] tracking-[0.3em]", tag: "text-[7px] tracking-[0.2em]", gap: "mt-1" },
  md: { name: "text-[15px] tracking-[0.34em]", tag: "text-[8.5px] tracking-[0.22em]", gap: "mt-1.5" },
  lg: { name: "text-[22px] tracking-[0.36em]", tag: "text-[10px] tracking-[0.24em]", gap: "mt-2.5" },
} as const;

export function Wordmark({
  size = "md",
  muted,
  className,
}: {
  size?: keyof typeof WORDMARK_SIZE;
  /** Class for the tagline, which sits one step back from the name. */
  muted?: string;
  className?: string;
}) {
  const s = WORDMARK_SIZE[size];
  return (
    <div className={cx("text-center", className)}>
      <p className={cx("font-serif font-medium", s.name)}>ABER GROUP</p>
      <p className={cx(s.gap, s.tag, "font-medium", muted ?? "opacity-55")}>
        INVESTMENT · PROPERTY · LIFESTYLE
      </p>
    </div>
  );
}

/** Monogram above wordmark — the full stacked lockup. */
export function BrandLockup({
  size = "md",
  muted,
  className,
}: {
  size?: keyof typeof WORDMARK_SIZE;
  muted?: string;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col items-center", className)}>
      <Monogram size={size} />
      <Wordmark size={size} muted={muted} className={size === "lg" ? "mt-6" : "mt-3.5"} />
    </div>
  );
}

/** Horizontal lockup for headers and compact bars. */
export function BrandRow({ className }: { className?: string }) {
  return (
    <div className={cx("flex items-center gap-3", className)}>
      <Monogram size="sm" />
      <span className="h-7 w-px bg-current opacity-20" />
      <div>
        <p className="font-serif text-[12.5px] font-medium tracking-[0.3em]">ABER GROUP</p>
        <p className="mt-0.5 text-[7px] font-medium tracking-[0.2em] opacity-55">
          INVESTMENT · PROPERTY · LIFESTYLE
        </p>
      </div>
    </div>
  );
}
