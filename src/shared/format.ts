import { PRESETS, type PresetId, type Settings } from "./types";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "MM:SS", or "H:MM:SS" once the remaining time reaches an hour. */
export function formatClock(secs: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(secs) ? secs : 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

/** Human duration in whole minutes: "25m", "1h 25m", "2h". */
export function formatMinutes(secs: number): string {
  const minutes = Math.max(0, Math.round((Number.isFinite(secs) ? secs : 0) / 60));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function presetLabel(id: PresetId): string {
  switch (id) {
    case "pomodoro":
      return "Pomodoro";
    case "academic":
      return "Academic hour";
    case "deep":
      return "Deep focus";
    case "custom":
      return "Custom";
  }
}

/** Work/break minutes for a preset, reading the custom pair from settings. */
export function presetMinutes(
  id: PresetId,
  settings: Pick<Settings, "custom_work_min" | "custom_break_min">,
): { work_min: number; break_min: number } {
  if (id === "custom") {
    return { work_min: settings.custom_work_min, break_min: settings.custom_break_min };
  }
  return PRESETS[id];
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function localMidnight(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * When a session happened, relative to `now`, in local time: "Today 14:32"
 * for the current day, "Mon 09:10" within the last week, "Nov 3" beyond that.
 * Unparseable input yields "".
 */
export function formatSessionTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const daysAgo = Math.round((localMidnight(now) - localMidnight(d)) / 86_400_000);
  if (daysAgo === 0) return `Today ${time}`;
  if (daysAgo > 0 && daysAgo < 7) return `${WEEKDAYS[d.getDay()]} ${time}`;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
