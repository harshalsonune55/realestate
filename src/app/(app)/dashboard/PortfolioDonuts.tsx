"use client";

import { useId, useState } from "react";
import type { Slice } from "@/lib/queries";
import { AED, AEDshort, cx } from "@/lib/utils";

/**
 * The two part-to-whole rings.
 *
 * A ring is only honest for a share of a whole, so both of these are exactly
 * that: every unit sits in one state, every live cheque's value in one bucket.
 * Neither is a ranking and neither asks the reader to compare two slices of
 * almost the same size by eye — that is what the legend's figures are for.
 *
 * Colour is never the only channel. Each slice is named with its value in the
 * legend beside the ring, and the table toggle prints the same numbers for a
 * reader who cannot use either.
 */

/* The order IS the colourblind-safety mechanism — every adjacent pair, and the
   wrap from the last slice back to the first, clears the CVD and normal-vision
   floors. Re-run the palette validator before changing it. */
const SERIES = [
  "var(--c-series-1)",
  "var(--c-series-2)",
  "var(--c-series-3)",
  "var(--c-series-4)",
];

export default function PortfolioDonuts({
  units,
  cheques,
}: {
  /** Omitted when the reader's dashboard does not carry the unit mix. */
  units?: Slice[];
  cheques?: Slice[];
}) {
  // One ring on its own gets the full width rather than sitting in a
  // two-column grid with a hole where the other card would have been.
  const both = units !== undefined && cheques !== undefined;
  return (
    <div
      className={
        both
          ? "grid grid-cols-1 gap-5 lg:grid-cols-[1.35fr_1fr]"
          : "grid grid-cols-1 gap-5"
      }
    >
      {units !== undefined && (
      <DonutCard
        title="Units by status"
        slices={units}
        centerLabel="units"
        centerValue={units.reduce((s, u) => s + u.value, 0)}
        format={(n) => n.toLocaleString("en-US")}
        legendCols
      />
      )}
      {cheques !== undefined && (
      <DonutCard
        title="Cheques by state"
        slices={cheques}
        centerLabel="on live tenancies"
        centerValue={cheques.reduce((s, c) => s + c.value, 0)}
        format={AEDshort}
        long={AED}
        footer
      />
      )}
    </div>
  );
}

function DonutCard({
  title,
  slices,
  centerLabel,
  centerValue,
  format,
  long,
  legendCols = false,
  footer = false,
}: {
  title: string;
  slices: Slice[];
  centerLabel: string;
  centerValue: number;
  format: (n: number) => string;
  /** Fuller formatting for the tooltip, where there is room for every digit. */
  long?: (n: number) => string;
  legendCols?: boolean;
  footer?: boolean;
}) {
  const [hot, setHot] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const tableId = useId();
  const detail = long ?? format;

  return (
    <section className="rounded-3xl border border-line bg-surface p-5 shadow-xs">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-bold text-fg">{title}</h3>
        <button
          type="button"
          onClick={() => setTable((t) => !t)}
          aria-pressed={table}
          aria-controls={tableId}
          className={cx(
            "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
            table
              ? "border-line-strong bg-subtle text-fg"
              : "border-line text-fg-soft hover:border-line-strong"
          )}
        >
          Table
        </button>
      </div>

      {slices.length === 0 ? (
        <p className="mt-6 text-[13px] text-muted">Nothing to show yet.</p>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-4">
          <Ring
            slices={slices}
            hot={hot}
            setHot={setHot}
            centerLabel={centerLabel}
            centerValue={centerValue}
            format={format}
            detail={detail}
          />

          {/* Legend — always present, and the dependable identity channel. */}
          <ul
            className={cx(
              "min-w-[180px] flex-1 gap-x-6 gap-y-2.5",
              legendCols ? "grid grid-cols-1 sm:grid-cols-2" : "grid grid-cols-1"
            )}
          >
            {slices.map((s, i) => (
              <li
                key={s.key}
                onPointerEnter={() => setHot(i)}
                onPointerLeave={() => setHot(null)}
                className={cx(
                  "flex items-baseline gap-2 rounded-lg px-1 py-0.5 transition",
                  hot === i && "bg-subtle"
                )}
              >
                <span
                  aria-hidden
                  className="mt-1 h-2 w-2 shrink-0 rounded-full"
                  style={{ background: SERIES[i % SERIES.length] }}
                />
                {/* Values wear text tokens, never the slice colour. */}
                <span className="tnum text-[13px] font-bold text-fg">
                  {Math.round(s.share * 100)}%
                </span>
                <span className="min-w-0 flex-1 text-[12.5px] text-fg-soft">{s.label}</span>
                <span className="tnum shrink-0 text-[11.5px] text-muted">
                  {format(s.value)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* the three-up readout, as on the reference card */}
      {footer && slices.length > 0 && (
        <div className="mt-5 grid grid-cols-3 gap-3 border-t border-line-soft pt-4">
          {slices.map((s, i) => (
            <div key={s.key} className="flex gap-2.5">
              <span
                aria-hidden
                className="w-[3px] shrink-0 rounded-full"
                style={{ background: SERIES[i % SERIES.length] }}
              />
              <div className="min-w-0">
                <p className="truncate text-[12px] text-muted">{s.label}</p>
                <p className="text-[19px] font-bold leading-tight text-fg">
                  {Math.round(s.share * 100)}
                  <span className="text-[12px] font-semibold text-muted">%</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {table && (
        <div id={tableId} className="mt-4 overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-line-soft text-left text-[11px] uppercase tracking-[0.06em] text-muted">
                <th scope="col" className="pb-2 font-medium">{title}</th>
                <th scope="col" className="pb-2 text-right font-medium">Share</th>
                <th scope="col" className="pb-2 text-right font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {slices.map((s) => (
                <tr key={s.key} className="border-b border-line-soft last:border-0">
                  <th scope="row" className="py-2 text-left font-medium text-fg">{s.label}</th>
                  <td className="tnum py-2 text-right text-fg-soft">
                    {(s.share * 100).toFixed(1)}%
                  </td>
                  <td className="tnum py-2 text-right text-fg-soft">{detail(s.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------- the ring */

const SIZE = 190;
const R_OUT = 88;
const R_IN = 54;
/** The slice a pointer is on lifts outward rather than changing colour. */
const LIFT = 4;

function Ring({
  slices,
  hot,
  setHot,
  centerLabel,
  centerValue,
  format,
  detail,
}: {
  slices: Slice[];
  hot: number | null;
  setHot: (i: number | null) => void;
  centerLabel: string;
  centerValue: number;
  format: (n: number) => string;
  detail: (n: number) => string;
}) {
  const shown = hot === null ? null : slices[hot];

  // A single slice covering everything has no seam to draw, and two arcs that
  // meet at 0° and 360° would leave a hairline crack across a full ring.
  const whole = slices.length === 1;

  let cursor = -Math.PI / 2;
  const arcs = slices.map((s) => {
    const sweep = s.share * Math.PI * 2;
    const a = { start: cursor, end: cursor + sweep };
    cursor += sweep;
    return a;
  });

  return (
    <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
      <svg
        width={SIZE}
        height={SIZE}
        role="img"
        aria-label={`${centerLabel}: ${slices
          .map((s) => `${s.label} ${Math.round(s.share * 100)}%`)
          .join(", ")}. The table view has the figures.`}
      >
        <g transform={`translate(${SIZE / 2},${SIZE / 2})`}>
          {whole ? (
            <circle
              r={(R_OUT + R_IN) / 2}
              fill="none"
              stroke={SERIES[0]}
              strokeWidth={R_OUT - R_IN}
            />
          ) : (
            arcs.map((a, i) => {
              const on = hot === i;
              // The gap is cut out of the arc itself in surface-coloured space,
              // rather than stroked around it: a border would add ink that is
              // not data. Narrow slices give back less so they stay visible.
              const gap = Math.min(0.028, (a.end - a.start) / 4);
              const mid = (a.start + a.end) / 2;
              return (
                <path
                  key={slices[i].key}
                  d={annulus(a.start + gap / 2, a.end - gap / 2, R_IN, R_OUT)}
                  fill={SERIES[i % SERIES.length]}
                  transform={
                    on ? `translate(${Math.cos(mid) * LIFT},${Math.sin(mid) * LIFT})` : undefined
                  }
                  className="cursor-pointer transition-transform duration-150"
                  tabIndex={0}
                  role="button"
                  aria-label={`${slices[i].label}: ${detail(slices[i].value)}, ${Math.round(
                    slices[i].share * 100
                  )}%`}
                  onPointerEnter={() => setHot(i)}
                  onPointerLeave={() => setHot(null)}
                  onFocus={() => setHot(i)}
                  onBlur={() => setHot(null)}
                />
              );
            })
          )}
        </g>
      </svg>

      {/* The hole carries the total, or whichever slice the reader is on.
          Sized to the hole rather than to the card: the text has 2·R_IN of
          width to live in, and "AED 27.52M" set larger than this spills out
          over the ring it is supposed to sit inside. */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div style={{ maxWidth: R_IN * 1.75 }}>
          <p className="tnum text-[13.5px] font-bold leading-tight tracking-[-0.01em] text-fg">
            {shown ? format(shown.value) : format(centerValue)}
          </p>
          <p className="mt-0.5 text-[10px] leading-tight text-muted">
            {shown ? shown.label : centerLabel}
          </p>
        </div>
      </div>
    </div>
  );
}

/** One ring segment, as a filled path between two radii. */
function annulus(a0: number, a1: number, rIn: number, rOut: number): string {
  const big = a1 - a0 > Math.PI ? 1 : 0;
  const p = (r: number, a: number) => `${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`;
  return (
    `M${p(rOut, a0)}` +
    `A${rOut},${rOut} 0 ${big} 1 ${p(rOut, a1)}` +
    `L${p(rIn, a1)}` +
    `A${rIn},${rIn} 0 ${big} 0 ${p(rIn, a0)}` +
    "Z"
  );
}
