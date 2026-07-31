// Small helpers: dates, money, ids. Kept dependency-free on purpose.

export const AED = (n: number) =>
  "AED " + Math.round(n).toLocaleString("en-US");

export const AEDshort = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return "AED " + (n / 1_000_000).toFixed(2) + "M";
  if (Math.abs(n) >= 1_000) return "AED " + Math.round(n / 1000) + "K";
  return "AED " + Math.round(n);
};

/** ISO date (YYYY-MM-DD) for a Date. */
export const iso = (d: Date) => d.toISOString().slice(0, 10);

export const today = () => iso(new Date());

export const parse = (s: string) => new Date(s + "T00:00:00Z");

export function addDays(s: string, n: number) {
  const d = parse(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

export function addMonths(s: string, n: number) {
  const d = parse(s);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return iso(d);
}

export function addYears(s: string, n: number) {
  return addMonths(s, n * 12);
}

/** Whole days from a to b (b - a). Negative means b is in the past. */
export function daysBetween(a: string, b: string) {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);
}

export const daysFromToday = (d: string) => daysBetween(today(), d);

export function fmtDate(s?: string) {
  if (!s) return "—";
  const d = parse(s.slice(0, 10));
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function fmtDateTime(s?: string) {
  if (!s) return "—";
  const d = new Date(s);
  return (
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
    " " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );
}

export function relative(s?: string) {
  if (!s) return "—";
  const diff = daysFromToday(s.slice(0, 10));
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  if (diff > 0) return `in ${diff} days`;
  return `${Math.abs(diff)} days ago`;
}

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/** Deterministic pseudo-random generator so seed data is stable between runs. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const pick = <T,>(r: () => number, arr: readonly T[]): T =>
  arr[Math.floor(r() * arr.length)];

export const int = (r: () => number, min: number, max: number) =>
  Math.floor(r() * (max - min + 1)) + min;

export function titleCase(s: string) {
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
