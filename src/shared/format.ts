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
