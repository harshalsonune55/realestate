"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarX2, Check, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { cx } from "@/lib/utils";

/**
 * The dashboard diary.
 *
 * Every field is pre-rendered on the server — the day a viewing belongs to and
 * the wall-clock times are decided once, in Gulf time, rather than in whatever
 * timezone the browser happens to sit in. The client's only job is choosing
 * which day to show, so the strip reacts instantly and no navigation is needed
 * to look at tomorrow.
 */
export interface AgendaItem {
  id: string;
  visitorName: string;
  unitLabel: string;
  /** `YYYY-MM-DD` in Gulf time — the bucket this viewing belongs to. */
  dayKey: string;
  startLabel: string;
  endLabel: string;
  status: string;
}

const HUES = ["bg-brand-100", "bg-amber-100", "bg-gold-100", "bg-sky-100"];
const DAY_NAMES = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/* Date maths on the key string only. Parsing `YYYY-MM-DD` with `new Date()`
   would re-introduce the browser's timezone through the back door and could
   shift a viewing a day either way. */
function keyToUTC(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
function addDays(key: string, n: number): string {
  return new Date(keyToUTC(key) + n * 86_400_000).toISOString().slice(0, 10);
}
function dayOfMonth(key: string): number {
  return Number(key.slice(8, 10));
}
function monthLabel(key: string): string {
  const dt = new Date(keyToUTC(key));
  return `${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
}
function longDate(key: string): string {
  const dt = new Date(keyToUTC(key));
  return `${DAY_NAMES[(dt.getUTCDay() + 6) % 7]} ${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()].slice(0, 3)}`;
}

export default function AgendaPanel({
  items,
  todayKey,
  weekStartKey,
}: {
  items: AgendaItem[];
  /** Today in Gulf time, decided on the server. */
  todayKey: string;
  /** Monday of the week containing `todayKey`. */
  weekStartKey: string;
}) {
  const [weekStart, setWeekStart] = useState(weekStartKey);
  const [selected, setSelected] = useState(todayKey);

  const byDay = useMemo(() => {
    const m = new Map<string, AgendaItem[]>();
    for (const it of items) {
      const list = m.get(it.dayKey);
      if (list) list.push(it);
      else m.set(it.dayKey, [it]);
    }
    for (const list of m.values()) list.sort((a, b) => a.startLabel.localeCompare(b.startLabel));
    return m;
  }, [items]);

  const week = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const shift = (weeks: number) => {
    const next = addDays(weekStart, weeks * 7);
    setWeekStart(next);
    // Keep the same weekday selected: paging to next week and landing on
    // Monday every time is disorienting when you were looking at Friday.
    const offset = week.indexOf(selected);
    setSelected(addDays(next, offset >= 0 ? offset : 0));
  };

  const today = () => {
    setWeekStart(weekStartKey);
    setSelected(todayKey);
  };

  const day = byDay.get(selected) ?? [];
  const offWeek = weekStart !== weekStartKey;

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[17px] font-bold text-fg">My agenda</h3>
        <Link
          href="/visits"
          className="rounded-full border border-line px-3 py-1.5 text-[12px] font-semibold text-fg-soft transition hover:border-line-strong"
        >
          View all
        </Link>
      </div>

      {/* month + week paging */}
      <div className="mb-1.5 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label="Previous week"
          className="grid h-7 w-7 place-items-center rounded-full text-muted transition hover:bg-subtle hover:text-fg"
        >
          <ChevronLeft size={15} />
        </button>
        <button
          type="button"
          onClick={today}
          className={cx(
            "rounded-full px-2.5 py-1 text-[12px] font-semibold transition",
            offWeek ? "text-brand-700 hover:bg-brand-50" : "text-fg-soft"
          )}
          title={offWeek ? "Back to this week" : undefined}
        >
          {offWeek ? "Back to today" : monthLabel(weekStart)}
        </button>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label="Next week"
          className="grid h-7 w-7 place-items-center rounded-full text-muted transition hover:bg-subtle hover:text-fg"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      {/* week strip */}
      <div className="mb-4 grid grid-cols-7 gap-1 text-center">
        {week.map((key, i) => {
          const isSelected = key === selected;
          const isToday = key === todayKey;
          const count = byDay.get(key)?.length ?? 0;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelected(key)}
              aria-pressed={isSelected}
              aria-label={`${longDate(key)}, ${count} viewing${count === 1 ? "" : "s"}`}
              className={cx(
                "rounded-xl py-1.5 transition",
                isSelected
                  ? "bg-inverse text-inverse-fg"
                  : isToday
                  ? "bg-subtle text-fg"
                  : "text-fg-soft hover:bg-subtle"
              )}
            >
              <div className="text-[11px] font-medium opacity-70">{DAY_NAMES[i]}</div>
              <div className="text-[13px] font-bold">{dayOfMonth(key)}</div>
              {/* a dot means there is something in the diary that day */}
              <div
                className={cx(
                  "mx-auto mt-1 h-1 w-1 rounded-full transition",
                  count === 0
                    ? "bg-transparent"
                    : isSelected
                    ? "bg-inverse-fg"
                    : "bg-brand-500"
                )}
              />
            </button>
          );
        })}
      </div>

      {/* the selected day */}
      <div className="space-y-2.5">
        {day.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface p-5 text-center">
            <CalendarX2 size={20} className="mx-auto text-faint" />
            <p className="mt-2 text-[13px] text-muted">
              Nothing booked for {longDate(selected)}.
            </p>
          </div>
        ) : (
          day.map((v, i) => {
            const done = v.status === "completed";
            return (
              <Link
                key={v.id}
                href={`/visits/${v.id}`}
                className={cx(
                  "flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-xs transition hover:border-line-strong",
                  done && "opacity-70"
                )}
              >
                <span
                  className={cx(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-full text-fg",
                    HUES[i % HUES.length]
                  )}
                >
                  {done ? <Check size={16} /> : <Users size={16} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-fg">{v.visitorName}</p>
                  <p className="text-[12px] text-muted">
                    {v.startLabel}–{v.endLabel}
                    {v.unitLabel ? ` · ${v.unitLabel}` : ""}
                  </p>
                </div>
              </Link>
            );
          })
        )}
      </div>

      <Link
        href={`/visits/new?date=${selected}`}
        className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-line bg-surface py-3.5 text-[13.5px] font-semibold text-fg transition hover:border-line-strong"
      >
        Book a viewing <ArrowUpRight size={15} />
      </Link>
    </>
  );
}
