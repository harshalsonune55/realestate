"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { cx } from "@/lib/utils";

export const THEME_KEY = "am-theme";

/**
 * Inlined into <head> so the stored theme is applied while the HTML is still
 * parsing — before first paint, so there is no light-to-dark flash. Kept in
 * sync with `getSnapshot` below: both treat the <html> attribute as the
 * single source of truth.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_KEY
)});if(!t)t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

type Theme = "light" | "dark";

/* The theme lives on the <html> element rather than in React state, because the
   head script sets it before React exists. useSyncExternalStore lets us read
   that external value without a setState-in-effect cascade, and it renders the
   server snapshot during hydration so there is no mismatch. */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function getSnapshot(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function getServerSnapshot(): Theme {
  return "light";
}

function setTheme(next: Theme) {
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // Private browsing or storage disabled — the toggle still works for this
    // page view, it just will not be remembered.
  }
  listeners.forEach((l) => l());
}

export default function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";

  return (
    <button
      type="button"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      title={label}
      aria-label={label}
      className={cx(
        "grid h-9 w-9 place-items-center rounded-lg border border-line bg-surface text-muted transition hover:border-line-strong hover:text-fg",
        className
      )}
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
