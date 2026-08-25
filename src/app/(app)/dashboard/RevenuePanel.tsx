"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Table2, TrendingDown, TrendingUp } from "lucide-react";
import type { RevenueMonth, RevenueWindow } from "@/lib/queries";
import { AED, AEDshort, cx } from "@/lib/utils";
import CountUp from "@/components/CountUp";

/**
 * Revenue — a strip of windowed totals over a twelve-month series.
 *
 * Both series are money in AED and share the single y-axis. Colour carries
 * identity only as a second channel: the legend is always on screen and each
 * line is labelled at its own endpoint, so the chart still reads when the two
 * hues do not separate for the reader.
 *
 * Every value the hover layer shows is also reachable without hovering, from
 * the table view behind the toggle — the tooltip enhances, it never gates.
 */

const SERIES = [
  { key: "collected", label: "Collected", color: "var(--c-brand-600)" },
  { key: "outstanding", label: "Outstanding", color: "var(--c-gold-500)" },
] as const;

const PAD = { top: 18, right: 16, bottom: 30, left: 52 };
const PLOT_H = 230;

export default function RevenuePanel({
  windows,
  months,
}: {
  windows: RevenueWindow[];
  months: RevenueMonth[];
}) {
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const tableId = useId();

  // The plot is drawn at real pixel width rather than scaled from a viewBox,
  // so a 2px stroke is 2px at every container size and the pointer's x maps
  // straight onto a month with no coordinate transform in between.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geom = useMemo(() => {
    const innerW = Math.max(0, width - PAD.left - PAD.right);
    const peak = Math.max(
      1,
      ...months.map((m) => Math.max(m.collected, m.outstanding))
    );
    const top = niceCeil(peak);
    const x = (i: number) =>
      PAD.left + (months.length < 2 ? innerW / 2 : (innerW * i) / (months.length - 1));
    const y = (v: number) => PAD.top + (PLOT_H - PAD.top - PAD.bottom) * (1 - v / top);
    return { innerW, top, x, y, ticks: [0, 0.25, 0.5, 0.75, 1].map((f) => f * top) };
  }, [width, months]);

  const active = hover ?? months.length - 1;
  const point = months[active];

  /** Pointer or key lands on a month, never on a 2px line. */
  const pick = (clientX: number) => {
    const el = boxRef.current;
    if (!el || months.length === 0) return;
    const rel = clientX - el.getBoundingClientRect().left - PAD.left;
    const step = geom.innerW / Math.max(1, months.length - 1);
    setHover(clamp(Math.round(rel / step), 0, months.length - 1));
  };

  const cumulative = months
    .slice(0, active + 1)
    .reduce((s, m) => s + m.collected, 0);

  return (
    <section className="rounded-3xl border border-line bg-surface p-5 shadow-xs">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[19px] font-bold text-fg">Revenue</h2>
        <button
          type="button"
          onClick={() => setTable((t) => !t)}
          aria-pressed={table}
          aria-controls={tableId}
          className={cx(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition",
            table
              ? "border-line-strong bg-subtle text-fg"
              : "border-line text-fg-soft hover:border-line-strong"
          )}
        >
          <Table2 size={13} /> Table
        </button>
      </div>

      {/* windowed totals */}
      <div className="mt-4 grid grid-cols-2 gap-y-4 rounded-2xl border border-line px-4 py-3.5 sm:grid-cols-3 lg:grid-cols-5">
        {windows.map((w, i) => (
          <div
            key={w.label}
            className={cx(
              "min-w-0 px-1",
              i > 0 && "lg:border-l lg:border-line-soft lg:pl-4"
            )}
          >
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
              {w.label}
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
              <CountUp
                value={w.amount}
                format="aedShort"
                className="text-[21px] font-bold leading-none tracking-[-0.02em] text-fg"
              />
              <Delta value={w.delta} />
            </div>
          </div>
        ))}
      </div>

      {/* chart */}
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-[13.5px] font-semibold text-fg-soft">By month</h3>
          {/* Two series, so a legend is always present — identity is never
              left to colour alone. */}
          <ul className="flex flex-wrap items-center gap-4">
            {SERIES.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-[2px] w-3.5 rounded-full"
                  style={{ background: s.color }}
                />
                <span className="text-[12px] text-fg-soft">{s.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div
          ref={boxRef}
          className="relative touch-pan-y"
          onPointerMove={(e) => pick(e.clientX)}
          onPointerLeave={() => setHover(null)}
        >
          <svg
            width={width || undefined}
            height={PLOT_H}
            role="img"
            aria-label={`Rent collected against outstanding cheques, ${months[0]?.label ?? ""} to ${months.at(-1)?.label ?? ""}. The table view has the figures.`}
            className="block overflow-visible"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              setHover((h) =>
                clamp((h ?? months.length - 1) + (e.key === "ArrowRight" ? 1 : -1), 0, months.length - 1)
              );
            }}
            onFocus={() => setHover((h) => h ?? months.length - 1)}
            onBlur={() => setHover(null)}
          >
            {/* gridlines — solid hairlines, one shade off the surface */}
            {geom.ticks.map((t) => (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={geom.y(t)}
                  y2={geom.y(t)}
                  stroke="var(--c-line-soft)"
                  strokeWidth={1}
                />
                <text
                  x={PAD.left - 10}
                  y={geom.y(t) + 4}
                  textAnchor="end"
                  className="tnum"
                  fontSize={10.5}
                  fill="var(--c-faint)"
                >
                  {t === 0 ? "0" : AEDshort(t).replace("AED ", "")}
                </text>
              </g>
            ))}

            {/* month labels */}
            {months.map((m, i) => (
              <text
                key={m.month}
                x={geom.x(i)}
                y={PLOT_H - 8}
                textAnchor="middle"
                fontSize={10.5}
                fill={i === active ? "var(--c-fg)" : "var(--c-faint)"}
                fontWeight={i === active ? 700 : 400}
              >
                {m.label}
              </text>
            ))}

            {/* crosshair, under the marks so it never cuts across them */}
            {hover !== null && width > 0 && (
              <line
                x1={geom.x(active)}
                x2={geom.x(active)}
                y1={PAD.top}
                y2={PLOT_H - PAD.bottom}
                stroke="var(--c-line-strong)"
                strokeWidth={1}
              />
            )}

            {width > 0 &&
              SERIES.map((s) => (
                <path
                  key={s.key}
                  d={smoothPath(months.map((m, i) => [geom.x(i), geom.y(m[s.key])]))}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}

            {/* the hovered month, ringed in the surface colour so an overlap
                still reads as two separate points */}
            {width > 0 &&
              hover !== null &&
              SERIES.map((s) => (
                <circle
                  key={s.key}
                  cx={geom.x(active)}
                  cy={geom.y(months[active][s.key])}
                  r={4.5}
                  fill={s.color}
                  stroke="var(--c-surface)"
                  strokeWidth={2}
                />
              ))}

            {/* selective direct labels: each series named at its own endpoint */}
            {width > 0 &&
              hover === null &&
              SERIES.map((s) => {
                const last = months.at(-1);
                if (!last) return null;
                return (
                  <circle
                    key={s.key}
                    cx={geom.x(months.length - 1)}
                    cy={geom.y(last[s.key])}
                    r={4}
                    fill={s.color}
                    stroke="var(--c-surface)"
                    strokeWidth={2}
                  />
                );
              })}
          </svg>

          {/* tooltip — value leads, series name follows */}
          {hover !== null && width > 0 && point && (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-xl bg-inverse px-3 py-2 shadow-md"
              style={{
                left: clamp(geom.x(active), 78, Math.max(78, width - 78)),
                top: 0,
              }}
            >
              <p className="text-[11px] font-semibold text-inverse-muted">{point.label}</p>
              {SERIES.map((s) => (
                <p key={s.key} className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap">
                  <span
                    aria-hidden
                    className="h-[2px] w-3 shrink-0 rounded-full"
                    style={{ background: s.color }}
                  />
                  <span className="tnum text-[12.5px] font-bold text-inverse-fg">
                    {AED(point[s.key])}
                  </span>
                  <span className="text-[11px] text-inverse-muted">{s.label}</span>
                </p>
              ))}
              <p className="mt-1 border-t border-inverse-line pt-1 text-[11px] text-inverse-muted">
                <span className="tnum font-semibold text-inverse-fg">{AED(cumulative)}</span>{" "}
                collected to date
              </p>
            </div>
          )}
        </div>
      </div>

      {/* the table twin — every plotted figure, reachable without a pointer */}
      {table && (
        <div id={tableId} className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] text-[12.5px]">
            <caption className="sr-only">Rent collected and outstanding by month</caption>
            <thead>
              <tr className="border-b border-line-soft text-left text-[11px] uppercase tracking-[0.06em] text-muted">
                <th scope="col" className="pb-2 font-medium">Month</th>
                {SERIES.map((s) => (
                  <th key={s.key} scope="col" className="pb-2 text-right font-medium">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month} className="border-b border-line-soft last:border-0">
                  <th scope="row" className="py-2 text-left font-medium text-fg">{m.label}</th>
                  <td className="tnum py-2 text-right text-fg-soft">{AED(m.collected)}</td>
                  <td className="tnum py-2 text-right text-fg-soft">{AED(m.outstanding)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Movement against the preceding window of equal length. */
function Delta({ value }: { value: number | null }) {
  if (value === null) return null;
  const up = value >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    // Arrow plus sign, never colour alone.
    <span
      className={cx(
        "inline-flex items-center gap-0.5 text-[11.5px] font-semibold",
        up ? "text-emerald-600" : "text-red-600"
      )}
    >
      <Icon size={11} aria-hidden />
      {up ? "+" : "−"}
      {Math.abs(value * 100).toFixed(Math.abs(value) < 0.1 ? 2 : 1)}%
    </span>
  );
}

/* --------------------------------------------------------------- geometry */

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** A round number at or above the peak, so the top gridline reads cleanly. */
function niceCeil(n: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(n)));
  return Math.ceil(n / mag) * mag;
}

/**
 * Monotone cubic through the points.
 *
 * Deliberately not Catmull-Rom: that overshoots around a spike, and a revenue
 * line dipping below zero between two positive months would be the curve
 * inventing money that was never owed. Monotone interpolation cannot overshoot.
 */
function smoothPath(pts: [number, number][]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`;

  const n = pts.length;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    slope.push((pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0]));
  }

  const m: number[] = new Array(n);
  m[0] = slope[0];
  m[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    // A sign change is a turning point: flattening there is what keeps the
    // curve inside the two values it joins.
    m[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / slope[i];
    const b = m[i + 1] / slope[i];
    const h = Math.hypot(a, b);
    if (h > 3) {
      m[i] = ((3 / h) * a) * slope[i];
      m[i + 1] = ((3 / h) * b) * slope[i];
    }
  }

  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const c1x = pts[i][0] + dx[i] / 3;
    const c1y = pts[i][1] + (m[i] * dx[i]) / 3;
    const c2x = pts[i + 1][0] - dx[i] / 3;
    const c2y = pts[i + 1][1] - (m[i + 1] * dx[i]) / 3;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
}
