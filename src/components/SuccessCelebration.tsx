"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * A brief celebratory burst — an animated checkmark ringed by confetti — shown
 * whenever an action completes successfully. Mounted once in the app shell.
 *
 * It fires two ways:
 *   1. Redirect flows (deposit, clearance, a submitted contract, …) land on a
 *      page with a `?deposited=1`-style flag; this reads it, celebrates, then
 *      strips the flag so a refresh does not replay it.
 *   2. In-place actions (closing a task, a retry) dispatch a `pms:success`
 *      window event.
 */

const SUCCESS_FLAGS = [
  "deposited", "cleared", "bounced", "submitted", "created", "nonrenewal", "approved", "booked",
];

/** Dispatch from any client component after an action returns ok. */
export function celebrate(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("pms:success"));
  }
}

/** 12 confetti particles at even angles, coloured for a festive burst. */
const PARTICLES = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2;
  const dist = 46 + (i % 3) * 10;
  const colors = ["#1a73e8", "#16a34a", "#f59e0b", "#ec4899", "#8b5cf6"];
  return {
    dx: `${Math.round(Math.cos(angle) * dist)}px`,
    dy: `${Math.round(Math.sin(angle) * dist)}px`,
    color: colors[i % colors.length],
    delay: (i % 4) * 0.03,
  };
});

export default function SuccessCelebration() {
  const [shown, setShown] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const play = useCallback(() => {
    setShown(true);
    window.setTimeout(() => setShown(false), 1500);
  }, []);

  // 1. window event from in-place actions
  useEffect(() => {
    const onSuccess = () => play();
    window.addEventListener("pms:success", onSuccess);
    return () => window.removeEventListener("pms:success", onSuccess);
  }, [play]);

  // 2. success flag in the URL after a redirect
  useEffect(() => {
    const hit = SUCCESS_FLAGS.find((f) => params.get(f) === "1");
    if (!hit) return;
    play();
    const next = new URLSearchParams(params.toString());
    next.delete(hit);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router, play]);

  if (!shown) return null;

  return (
    <div className="success-backdrop pointer-events-none fixed inset-0 z-[100] grid place-items-center">
      <div className="absolute inset-0 bg-black/10" />
      <div className="relative grid place-items-center">
        {/* expanding ring */}
        <span className="success-ring absolute h-24 w-24 rounded-full bg-[#16a34a]/25" />
        {/* confetti */}
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="success-particle absolute h-2 w-2 rounded-[2px]"
            style={
              {
                background: p.color,
                ["--dx" as string]: p.dx,
                ["--dy" as string]: p.dy,
                animationDelay: `${p.delay}s`,
              } as React.CSSProperties
            }
          />
        ))}
        {/* checkmark disc */}
        <div className="success-pop relative grid h-20 w-20 place-items-center rounded-full bg-[#16a34a] shadow-lg">
          <svg width="40" height="40" viewBox="0 0 32 32" fill="none">
            <path
              className="success-check"
              d="M9 16.5l4.5 4.5L23 11"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
