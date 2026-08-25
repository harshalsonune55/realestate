"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Info } from "lucide-react";
import type { FunnelStage, PipelineMonth } from "@/lib/queries";
import { cx } from "@/lib/utils";

/**
 * The leasing funnel — where viewings turn into tenancies, and where they leak.
 *
 * Two views of one dataset: a month-by-month stack of how each month's viewings
 * ended, and the cumulative funnel across the whole window.
 *
 * The stages are an *ordered* scale, not a set of unrelated categories, so they
 * wear one hue stepped light to dark rather than four different colours — the
 * darkening is the progression. Loss is the exception: it is a status, not a
 * stage, so it keeps the reserved critical red and is drawn below the baseline
 * instead of stacked, because a lost viewing is not part of the same whole.
 */

const STAGES = [
  { key: "viewed", label: "Viewed only", color: "var(--c-stage-1)" },
  { key: "interested", label: "Interested", color: "var(--c-stage-2)" },
  { key: "offered", label: "Offer made", color: "var(--c-stage-3)" },
  { key: "signed", label: "Signed", color: "var(--c-stage-4)" },
] as const;

const LOST = "var(--c-stage-lost)";

const PAD = { top: 14, right: 8, bottom: 26, left: 44 };
const H = 250;
/** How much of the plot is given to the below-baseline losses. */
const LOSS_SHARE = 0.26;

export default function PipelinePanel({
  months,
  stages,
  lost,
}: {
  months: PipelineMonth[];
  stages: FunnelStage[];
  lost: number;
}) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.5fr_1fr]">
      <StackCard months={months} />
      <FunnelCard stages={stages} lost={lost} />
    </div>
  );
}

/* ------------------------------------------------------------------- stack */

function StackCard({ months }: { months: PipelineMonth[] }) {
  const [width, setWidth] = useState(0);
  const [hot, setHot] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const tableId = useId();

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geom = useMemo(() => {
    const innerW = Math.max(0, width - PAD.left - PAD.right);
    const innerH = H - PAD.top - PAD.bottom;
    const lossH = innerH * LOSS_SHARE;
    const upH = innerH - lossH;

    const stackOf = (m: PipelineMonth) =>
      m.viewed + m.interested + m.offered + m.signed;
    const peak = Math.max(1, ...months.map(stackOf));
    const lossPeak = Math.max(1, ...months.map((m) => m.lost));
    const top = niceCeil(peak);

    const band = months.length ? innerW / months.length : innerW;
    // Capped, so a six-column chart does not become six slabs; the leftover
    // band is deliberate air.
    const barW = Math.min(24, band * 0.5);
    const zeroY = PAD.top + upH;

    return {
      innerW,
      band,
      barW,
      zeroY,
      top,
      lossPeak: niceCeil(lossPeak),
      x: (i: number) => PAD.left + band * i + band / 2,
      h: (v: number) => (v / top) * upH,
      lossH: (v: number) => (v / niceCeil(lossPeak)) * (lossH - 6),
      ticks: [0, 0.5, 1].map((f) => f * top),
      upH,
    };
  }, [width, months]);

  const point = hot === null ? null : months[hot];

  return (
    <section className="rounded-3xl border border-line bg-surface p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[15px] font-bold text-fg">Viewings by outcome</h3>
        <div className="flex items-center gap-3">
          {/* Ordered stages, so the legend reads in stage order, lightest first. */}
          <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {STAGES.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-[3px]"
                  style={{ background: s.color }}
                />
                <span className="text-[11.5px] text-fg-soft">{s.label}</span>
              </li>
            ))}
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: LOST }} />
              <span className="text-[11.5px] text-fg-soft">Lost</span>
            </li>
          </ul>
          <button
            type="button"
            onClick={() => setTable((t) => !t)}
            aria-pressed={table}
            aria-controls={tableId}
            className={cx(
              "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
              table ? "border-line-strong bg-subtle text-fg" : "border-line text-fg-soft hover:border-line-strong"
            )}
          >
            Table
          </button>
        </div>
      </div>

      <div ref={boxRef} className="relative mt-3" onPointerLeave={() => setHot(null)}>
        <svg
          width={width || undefined}
          height={H}
          role="img"
          aria-label="Viewings each month by how far they got, with lost viewings below the baseline. The table view has the figures."
          className="block"
        >
          {/* gridlines above the baseline only — the loss band has its own scale */}
          {width > 0 &&
            geom.ticks.map((t) => (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={geom.zeroY - geom.h(t)}
                  y2={geom.zeroY - geom.h(t)}
                  stroke="var(--c-line-soft)"
                  strokeWidth={1}
                />
                <text
                  x={PAD.left - 8}
                  y={geom.zeroY - geom.h(t) + 4}
                  textAnchor="end"
                  className="tnum"
                  fontSize={10}
                  fill="var(--c-faint)"
                >
                  {t}
                </text>
              </g>
            ))}

          {/* the baseline itself, which the stack grows from and losses hang under */}
          {width > 0 && (
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={geom.zeroY}
              y2={geom.zeroY}
              stroke="var(--c-line-strong)"
              strokeWidth={1}
            />
          )}

          {width > 0 &&
            months.map((m, i) => {
              const x = geom.x(i) - geom.barW / 2;
              let cursor = geom.zeroY;
              const dim = hot !== null && hot !== i;
              return (
                <g
                  key={m.month}
                  opacity={dim ? 0.45 : 1}
                  className="transition-opacity"
                  onPointerEnter={() => setHot(i)}
                  onFocus={() => setHot(i)}
                  onBlur={() => setHot(null)}
                  tabIndex={0}
                  role="button"
                  aria-label={`${m.label}: ${m.viewed} viewed only, ${m.interested} interested, ${m.offered} offer made, ${m.signed} signed, ${m.lost} lost`}
                >
                  {/* a hit target that covers the whole band, not just the bar */}
                  <rect
                    x={geom.x(i) - geom.band / 2}
                    y={PAD.top}
                    width={geom.band}
                    height={H - PAD.top - PAD.bottom}
                    fill="transparent"
                  />
                  {STAGES.map((s, si) => {
                    const v = m[s.key];
                    if (v <= 0) return null;
                    const h = geom.h(v);
                    const y = cursor - h;
                    cursor = y;
                    // 2px of surface between segments does the separating —
                    // never a stroke drawn around them.
                    const isTop = si === STAGES.length - 1 || cursor <= PAD.top;
                    return (
                      <rect
                        key={s.key}
                        x={x}
                        y={y + 1}
                        width={geom.barW}
                        height={Math.max(0, h - 2)}
                        rx={isTop ? 4 : 0}
                        fill={s.color}
                      />
                    );
                  })}
                  {m.lost > 0 && (
                    <rect
                      x={x}
                      y={geom.zeroY + 4}
                      width={geom.barW}
                      height={Math.max(3, geom.lossH(m.lost))}
                      rx={4}
                      fill={LOST}
                    />
                  )}
                  <text
                    x={geom.x(i)}
                    y={H - 8}
                    textAnchor="middle"
                    fontSize={10.5}
                    fill={hot === i ? "var(--c-fg)" : "var(--c-faint)"}
                    fontWeight={hot === i ? 700 : 400}
                  >
                    {m.label}
                  </text>
                </g>
              );
            })}
        </svg>

        {/* one tooltip, every band — the pointer never has to find a segment */}
        {point && width > 0 && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-xl bg-inverse px-3 py-2 shadow-md"
            style={{ left: clamp(geom.x(hot!), 92, Math.max(92, width - 92)), top: 0 }}
          >
            <p className="text-[11px] font-semibold text-inverse-muted">{point.label}</p>
            {[...STAGES].reverse().map((s) => (
              <p key={s.key} className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap">
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: s.color }}
                />
                <span className="tnum text-[12.5px] font-bold text-inverse-fg">
                  {point[s.key]}
                </span>
                <span className="text-[11px] text-inverse-muted">{s.label}</span>
              </p>
            ))}
            <p className="mt-1 flex items-center gap-1.5 whitespace-nowrap border-t border-inverse-line pt-1">
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: LOST }} />
              <span className="tnum text-[12.5px] font-bold text-inverse-fg">{point.lost}</span>
              <span className="text-[11px] text-inverse-muted">lost</span>
            </p>
          </div>
        )}
      </div>

      {table && (
        <div id={tableId} className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] text-[12.5px]">
            <thead>
              <tr className="border-b border-line-soft text-left text-[11px] uppercase tracking-[0.06em] text-muted">
                <th scope="col" className="pb-2 font-medium">Month</th>
                {STAGES.map((s) => (
                  <th key={s.key} scope="col" className="pb-2 text-right font-medium">{s.label}</th>
                ))}
                <th scope="col" className="pb-2 text-right font-medium">Lost</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month} className="border-b border-line-soft last:border-0">
                  <th scope="row" className="py-2 text-left font-medium text-fg">{m.label}</th>
                  {STAGES.map((s) => (
                    <td key={s.key} className="tnum py-2 text-right text-fg-soft">{m[s.key]}</td>
                  ))}
                  <td className="tnum py-2 text-right text-fg-soft">{m.lost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ funnel */

function FunnelCard({ stages, lost }: { stages: FunnelStage[]; lost: number }) {
  const top = stages[0]?.value ?? 0;

  return (
    <section className="rounded-3xl border border-line bg-surface p-5 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-bold text-fg">Conversion</h3>
        <span
          className="text-muted"
          title="Each bar is the share of all viewings that reached this stage. The percentage on the right is the share that carried over from the stage above."
        >
          <Info size={15} />
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {stages.map((s, i) => (
          <div key={s.key}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12px] text-muted">{s.label}</span>
              <span className="flex items-baseline gap-1.5">
                <span className="tnum text-[17px] font-bold leading-none text-fg">
                  {s.value.toLocaleString("en-US")}
                </span>
                {s.ofPrevious !== null && (
                  <span className="tnum text-[11.5px] font-semibold text-muted">
                    {Math.round(s.ofPrevious * 100)}% carried
                  </span>
                )}
              </span>
            </div>
            {/* The bar is the funnel: width is the share of the very top, so the
                taper down the card is the drop-off, drawn to scale rather than
                as a decorative cone. */}
            <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-subtle">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.max(s.ofTop * 100, s.value > 0 ? 2 : 0)}%`,
                  background: `var(--c-stage-${i + 1})`,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line-soft pt-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.06em] text-muted">Lost</p>
          <p className="tnum text-[19px] font-bold leading-tight text-fg">{lost}</p>
          <p className="text-[11px] text-muted">cancelled, no-show or declined</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.06em] text-muted">Viewing → signed</p>
          <p className="tnum text-[19px] font-bold leading-tight text-fg">
            {top === 0 ? "—" : `${((stages.at(-1)!.value / top) * 100).toFixed(1)}%`}
          </p>
          <p className="text-[11px] text-muted">across the whole window</p>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- geometry */

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function niceCeil(n: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(1, n))));
  return Math.max(1, Math.ceil(n / mag) * mag);
}
