"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { AED, AEDshort } from "@/lib/utils";

/**
 * A figure that counts up to its value the first time it is painted.
 *
 * The server already rendered the final number, so that is what the first
 * render returns — hydration matches, and a reader with JavaScript off or a
 * hydration that never arrives still sees the real figure rather than a zero.
 * The climb is started in a layout effect, which runs before the browser
 * paints, so the settled value is never briefly visible before it rewinds.
 *
 * The digits are re-formatted every frame — counting up to "AED 1,204,000" by
 * animating the string would mean interpolating thousands separators. The
 * formatter is therefore named rather than passed: most call sites are server
 * components, and a function cannot cross that boundary.
 */

const FORMATS = {
  /** "AED 1,204,000" */
  aed: AED,
  /** "AED 1.20M" — for figures that have to fit a narrow column. */
  aedShort: AEDshort,
  /** "1,204" — counts of things, which are never fractional. */
  whole: (n: number) => Math.round(n).toLocaleString("en-US"),
} as const;

export type CountFormat = keyof typeof FORMATS;

export default function CountUp({
  value,
  format = "whole",
  durationMs = 900,
  className,
}: {
  value: number;
  /** Named so this component can be used from a server component. */
  format?: CountFormat;
  durationMs?: number;
  className?: string;
}) {
  const [shown, setShown] = useState(value);

  useIsomorphicLayoutEffect(() => {
    // Respect the OS setting: for a reader who asked for less motion the
    // number simply is its value, with no climb at all.
    const still =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (still || value === 0 || durationMs <= 0) {
      setShown(value);
      return;
    }

    setShown(0);
    let raf = 0;
    let start: number | null = null;

    const tick = (t: number) => {
      start ??= t;
      const p = Math.min(1, (t - start) / durationMs);
      // Ease-out cubic — fast off the mark, settling gently onto the figure,
      // so the last digits are readable rather than a blur that snaps.
      setShown(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setShown(value);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return (
    <span className={className} suppressHydrationWarning>
      {FORMATS[format](shown)}
    </span>
  );
}

/* `useLayoutEffect` warns when a client component is server-rendered, because
   it cannot run there. The effect below is the same one either way; only the
   hook used to schedule it differs. */
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;
