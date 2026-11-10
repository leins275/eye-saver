import { describe, expect, it } from "vitest";
import {
  formatClock,
  formatMinutes,
  formatSessionTime,
  presetLabel,
  presetMinutes,
} from "./format";

describe("formatClock", () => {
  it("pads minutes and seconds", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(5)).toBe("00:05");
    expect(formatClock(65)).toBe("01:05");
    expect(formatClock(25 * 60)).toBe("25:00");
  });

  it("switches to H:MM:SS at one hour", () => {
    expect(formatClock(3600)).toBe("1:00:00");
    expect(formatClock(3600 + 90)).toBe("1:01:30");
    expect(formatClock(3599)).toBe("59:59");
  });

  it("never goes negative or fractional", () => {
    expect(formatClock(-4)).toBe("00:00");
    expect(formatClock(61.9)).toBe("01:01");
    expect(formatClock(Number.NaN)).toBe("00:00");
  });
});

describe("formatMinutes", () => {
  it("rounds to whole minutes", () => {
    expect(formatMinutes(0)).toBe("0m");
    expect(formatMinutes(25 * 60)).toBe("25m");
    expect(formatMinutes(25 * 60 + 29)).toBe("25m");
    expect(formatMinutes(25 * 60 + 31)).toBe("26m");
  });

  it("splits hours and drops a zero minute part", () => {
    expect(formatMinutes(85 * 60)).toBe("1h 25m");
    expect(formatMinutes(120 * 60)).toBe("2h");
  });
});

describe("presets", () => {
  it("labels every preset", () => {
    expect(presetLabel("pomodoro")).toBe("Pomodoro");
    expect(presetLabel("academic")).toBe("Academic hour");
    expect(presetLabel("deep")).toBe("Deep focus");
    expect(presetLabel("custom")).toBe("Custom");
  });

  it("reads custom minutes from settings", () => {
    const s = { custom_work_min: 50, custom_break_min: 10 };
    expect(presetMinutes("pomodoro", s)).toEqual({ work_min: 25, break_min: 5 });
    expect(presetMinutes("custom", s)).toEqual({ work_min: 50, break_min: 10 });
  });
});

describe("formatSessionTime", () => {
  // Local-time constructor, so the expectations hold in any zone.
  const now = new Date(2026, 10, 10, 15, 0); // Tue 10 Nov 2026, 15:00

  it("says Today with the time for the current day", () => {
    expect(formatSessionTime(new Date(2026, 10, 10, 14, 32).toISOString(), now)).toBe(
      "Today 14:32",
    );
    expect(formatSessionTime(new Date(2026, 10, 10, 0, 5).toISOString(), now)).toBe("Today 00:05");
  });

  it("uses the weekday within the last week", () => {
    expect(formatSessionTime(new Date(2026, 10, 9, 9, 10).toISOString(), now)).toBe("Mon 09:10");
    expect(formatSessionTime(new Date(2026, 10, 4, 23, 59).toISOString(), now)).toBe("Wed 23:59");
  });

  it("falls back to month and day beyond a week", () => {
    expect(formatSessionTime(new Date(2026, 10, 3, 12, 0).toISOString(), now)).toBe("Nov 3");
    expect(formatSessionTime(new Date(2026, 0, 1, 12, 0).toISOString(), now)).toBe("Jan 1");
  });

  it("returns an empty string for garbage", () => {
    expect(formatSessionTime("not a date", now)).toBe("");
  });
});
