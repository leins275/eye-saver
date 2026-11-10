import type { DayStats } from "../shared/types";

/** Geometry of the 7-day focus chart (SVG user units). */
export const CHART = {
  width: 560,
  height: 190,
  padTop: 26,
  padBottom: 26,
  padX: 8,
  gap: 16,
} as const;

export interface Bar {
  x: number;
  y: number;
  width: number;
  height: number;
  /** "Mon" … "Sun" */
  label: string;
  /** Whole minutes, for the value label. */
  minutes: number;
  date: string;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2026-11-09" → "Mon". Parsed as a local date so the weekday never shifts by zone. */
export function weekdayLabel(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return "";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return WEEKDAYS[d.getDay()] ?? "";
}

/** Lays out one bar per day; heights scale to the busiest day, zero days get a hairline. */
export function chartBars(days: DayStats[], geometry: typeof CHART = CHART): Bar[] {
  const n = days.length;
  if (n === 0) return [];
  const { width, height, padTop, padBottom, padX, gap } = geometry;
  const innerW = width - padX * 2 - gap * (n - 1);
  const barW = innerW / n;
  const innerH = height - padTop - padBottom;
  const max = Math.max(1, ...days.map((d) => d.focus_secs));

  return days.map((d, i) => {
    const h = (d.focus_secs / max) * innerH;
    const x = padX + i * (barW + gap);
    return {
      x,
      y: padTop + innerH - h,
      width: barW,
      height: h,
      label: weekdayLabel(d.date),
      minutes: Math.round(d.focus_secs / 60),
      date: d.date,
    };
  });
}
