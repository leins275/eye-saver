import { describe, expect, it } from "vitest";
import type { DayStats } from "../shared/types";
import { CHART, chartBars, weekdayLabel } from "./chart";

function day(date: string, focus_secs: number): DayStats {
  return { date, focus_secs, work_sessions: 0, breaks_completed: 0, breaks_skipped: 0 };
}

describe("weekdayLabel", () => {
  it("names weekdays from a local ISO date", () => {
    expect(weekdayLabel("2026-11-09")).toBe("Mon");
    expect(weekdayLabel("2026-11-15")).toBe("Sun");
    expect(weekdayLabel("garbage")).toBe("");
  });
});

describe("chartBars", () => {
  const week = [
    day("2026-11-09", 0),
    day("2026-11-10", 30 * 60),
    day("2026-11-11", 60 * 60),
    day("2026-11-12", 0),
    day("2026-11-13", 15 * 60),
    day("2026-11-14", 0),
    day("2026-11-15", 120 * 60),
  ];

  it("produces one labelled bar per day, Mon…Sun", () => {
    const bars = chartBars(week);
    expect(bars.map((b) => b.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(bars.map((b) => b.minutes)).toEqual([0, 30, 60, 0, 15, 0, 120]);
  });

  it("scales heights to the busiest day and keeps bars inside the plot", () => {
    const bars = chartBars(week);
    const innerH = CHART.height - CHART.padTop - CHART.padBottom;
    expect(bars[6].height).toBeCloseTo(innerH);
    expect(bars[1].height).toBeCloseTo(innerH / 4);
    expect(bars[0].height).toBe(0);
    for (const b of bars) {
      expect(b.x).toBeGreaterThanOrEqual(CHART.padX);
      expect(b.x + b.width).toBeLessThanOrEqual(CHART.width - CHART.padX + 1e-6);
      expect(b.y + b.height).toBeCloseTo(CHART.height - CHART.padBottom);
    }
  });

  it("does not divide by zero on an empty week", () => {
    const bars = chartBars(week.map((d) => ({ ...d, focus_secs: 0 })));
    expect(bars.every((b) => b.height === 0)).toBe(true);
    expect(chartBars([])).toEqual([]);
  });
});
