"use client";

import { useEffect } from "react";

/**
 * Tells the server the app is still open, so time in the app can be measured.
 *
 * Only beats while the tab is *visible*. A window left open behind a video call
 * all afternoon is not four hours of work, and counting it as such would make
 * the figure worse than useless — it would reward leaving tabs open. Hiding the
 * tab stops the heartbeat; the span then closes itself at the last beat, and
 * coming back opens a fresh one.
 *
 * Renders nothing. It is mounted once from the app shell.
 */
export default function Presence({ intervalMs = 60_000 }: { intervalMs?: number }) {
  useEffect(() => {
    let stopped = false;

    const beat = () => {
      if (stopped || document.visibilityState !== "visible") return;
      // keepalive so a beat fired as the tab closes still reaches the server;
      // failures are ignored because a missed beat is not worth telling anyone
      // about — the next one, or the idle cutoff, resolves it.
      void fetch("/api/presence", { method: "POST", keepalive: true }).catch(() => {});
    };

    beat();
    const timer = setInterval(beat, intervalMs);
    // Coming back to a hidden tab beats immediately rather than waiting out
    // the rest of the interval, so a short visit is not rounded away.
    document.addEventListener("visibilitychange", beat);

    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [intervalMs]);

  return null;
}
