import { cx } from "@/lib/utils";

/**
 * The white title card shown while a route's data is in flight.
 *
 * Deliberately CSS-only: a loading screen that waits for a JavaScript bundle
 * before it can animate is a loading screen that arrives after the thing it was
 * meant to cover. Everything here is markup plus keyframes from `globals.css`,
 * so the first paint is already the finished animation.
 */

const WORD = "ABER GROUP";

/** Rotated underneath the wordmark so a slow request still reads as progress. */
const PHRASES = [
  "Preparing your workspace",
  "Gathering the portfolio",
  "Almost there",
];

export default function LoadingScreen({
  /** Announced to screen readers, which get none of the animation. */
  label = "Loading",
  /** `true` covers the viewport — used before the app chrome exists. */
  full = false,
}: {
  label?: string;
  full?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cx(
        "grid place-items-center bg-canvas",
        full ? "fixed inset-0 z-50" : "min-h-[65vh] w-full"
      )}
    >
      <div className="flex flex-col items-center px-6">
        {/* No mark here — the wordmark alone carries the identity while a page
            is in flight, and the roundel is reserved for the sign-in and
            sign-up screens. */}
        <p
          aria-hidden
          className="flex font-serif text-[22px] font-medium tracking-[0.36em] text-fg"
        >
          {Array.from(WORD).map((ch, i) => (
            <span
              key={i}
              className="loading-letter"
              style={{ animationDelay: `${180 + i * 55}ms` }}
            >
              {ch === " " ? "\u00A0" : ch}
            </span>
          ))}
        </p>

        {/* rotating status line */}
        <div className="loading-phrases mt-5 w-[240px] text-[12.5px] text-muted" aria-hidden>
          {PHRASES.map((p, i) => (
            <span
              key={p}
              className="loading-phrase"
              style={{ animationDelay: `${i * 2200}ms` }}
            >
              {p}
            </span>
          ))}
        </div>

        {/* sweeping hairline */}
        <div className="loading-bar mt-5 h-[2px] w-[150px] overflow-hidden rounded-full bg-line-soft">
          <span className="block h-full w-[30%] rounded-full bg-brand-solid" />
        </div>

        <span className="sr-only">{label}</span>
      </div>
    </div>
  );
}
