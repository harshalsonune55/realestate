"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { cx } from "@/lib/utils";

/**
 * The dashboard's right-hand column, behind a toggle.
 *
 * On a wide screen it is a column that can be folded away when somebody wants
 * the charts to have the full width; below `xl` it was already stacking
 * underneath the main content, where it pushed the agenda a long scroll down,
 * so there it opens as a sheet over the page instead.
 *
 * The open/closed choice is remembered per browser. Folding a panel away and
 * finding it back on the next navigation is the kind of small betrayal that
 * makes people stop using the control at all.
 */

const KEY = "pms.dashboard.side";

export default function SidePanel({ children }: { children: React.ReactNode }) {
  // Open is the default, and the first render must match the server's, so the
  // stored preference is applied after mount rather than read during render.
  const [open, setOpen] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // The documented "subscribe to an external system" case: one read of
    // localStorage at mount, which cannot happen during render because the
    // server has no such thing and the markup would not match.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(window.localStorage.getItem(KEY) !== "closed");
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) window.localStorage.setItem(KEY, open ? "open" : "closed");
  }, [ready, open]);

  // Escape closes the sheet, the convention any overlay is expected to follow.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* The handle. Sticky on wide screens so it stays reachable however far
          down the charts the reader has scrolled. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Hide the side panel" : "Show the side panel"}
        className={cx(
          "z-30 grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-surface text-fg-soft shadow-xs transition hover:border-line-strong hover:text-fg",
          // Below xl it floats over the page; at xl it sits in the flow beside
          // the column it controls.
          open ? "fixed right-4 top-20 xl:static xl:mt-0" : "fixed right-4 top-20 xl:static"
        )}
      >
        {open ? <X size={17} /> : <Menu size={17} />}
      </button>

      {/* Scrim, narrow screens only — where the panel is an overlay. */}
      {open && (
        <div
          aria-hidden
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-20 bg-black/30 backdrop-blur-[1px] xl:hidden"
        />
      )}

      <aside
        className={cx(
          "w-full shrink-0 xl:w-[340px]",
          open
            ? "fixed right-0 top-0 z-30 h-dvh w-[min(22rem,90vw)] overflow-y-auto bg-canvas p-4 shadow-lg xl:static xl:h-auto xl:w-[340px] xl:overflow-visible xl:bg-transparent xl:p-0 xl:shadow-none"
            : "hidden"
        )}
      >
        {children}
      </aside>
    </>
  );
}
