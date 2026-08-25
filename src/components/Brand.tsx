import Image from "next/image";
import { cx } from "@/lib/utils";

/**
 * The Aber Group identity, drawn rather than imported as an image so it stays
 * crisp at any size, inherits the surrounding colour, and needs no asset
 * pipeline. The monogram is a serif A and G pulled together with negative
 * tracking so the letters interlock the way they do in the printed mark.
 */

/* The drawn AG. Back at its original steps — this is the mark the app chrome
   has always carried, and it is sized to sit under a wordmark, not to lead. */
const MONOGRAM_SIZE = {
  sm: "h-7",
  md: "h-10",
  lg: "h-16",
} as const;

/* The photographed roundel. Its own scale: it carries a black field of its own,
   so it needs more room than the drawn glyphs to read as a mark. */
const LOGO_SIZE = {
  sm: "h-8",
  md: "h-12",
  lg: "h-28",
} as const;

/**
 * The drawn AG, for the app's own chrome.
 *
 * Letters rather than artwork, so it inherits `currentColor` and sits on any
 * background the sidebar happens to have. Kept alongside [LogoMark] rather
 * than replaced by it: the roundel is the front-door mark, this is the one
 * that lives inside the product.
 */
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

/**
 * The Aber Group roundel — the real artwork.
 *
 * Used on the way in (sign-in, sign-up, the access gate) and nowhere else. It
 * carries its own black field, so unlike [Monogram] it is not tinted by the
 * surrounding text colour.
 */
export function LogoMark({
  size = "md",
  className,
}: {
  size?: keyof typeof LOGO_SIZE;
  className?: string;
}) {
  return (
    <Image
      src="/brand/aber-logo.png"
      alt="Aber Group"
      width={368}
      height={362}
      // Above the fold on every sign-in, so it is not deferred.
      priority
      className={cx("w-auto rounded-full object-contain", LOGO_SIZE[size], className)}
    />
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
      <LogoMark size={size} />
      <Wordmark size={size} muted={muted} className={size === "lg" ? "mt-6" : "mt-3.5"} />
    </div>
  );
}

/** Horizontal lockup for headers and compact bars. */
export function BrandRow({ className }: { className?: string }) {
  return (
    <div className={cx("flex items-center gap-3", className)}>
      <LogoMark size="sm" />
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
