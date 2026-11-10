// The contract between the Rust shell and every window. The Rust side mirrors
// these shapes with serde (snake_case field names, lowercase enum tags); change
// both together.

export type Phase = "work" | "break";

/** 25/5, 45/15, 90/30 and a user-defined pair. */
export type PresetId = "pomodoro" | "academic" | "deep" | "custom";

export const PRESETS: Record<
  Exclude<PresetId, "custom">,
  { work_min: number; break_min: number }
> = {
  pomodoro: { work_min: 25, break_min: 5 },
  academic: { work_min: 45, break_min: 15 },
  deep: { work_min: 90, break_min: 30 },
};

/** Emitted on `timer:tick` (every second) and `timer:phase` (on a phase change). */
export interface TimerState {
  phase: Phase;
  /** false while paused or before the first start. */
  running: boolean;
  remaining_secs: number;
  total_secs: number;
  preset: PresetId;
  /** true during the final `warning_secs` of the phase. */
  warning: boolean;
  /** Raw caption of the current/next focus session, e.g. "CORE-discuss Q3 strategy-sync,strategy". */
  label: string | null;
}

/**
 * A focus-session caption parsed as `<Project> - <Title> - <tag, tag>` (spaces
 * around `-` optional). One section is a bare title, two are project + title,
 * three add comma-separated tags; four or more keep the middle sections as the
 * title. Parsing lives in Rust (`eye-core::label`); this is the result shape.
 */
export interface SessionLabel {
  raw: string;
  project: string | null;
  title: string;
  tags: string[];
}

/** Emitted once on `timer:warning`, `warning_secs` before a phase change. */
export interface WarningEvent {
  next_phase: Phase;
}

/** Emitted on `hud:move-mode` while the move shortcut is held / released. */
export interface MoveModeEvent {
  on: boolean;
}

export interface HudSettings {
  /** Physical pixels; null = default (top-right of the primary monitor). */
  x: number | null;
  y: number | null;
  /** 0.2..1 */
  opacity: number;
  /** 0.75..2, multiplies the HUD font size. */
  scale: number;
  visible: boolean;
}

export interface SoundSettings {
  enabled: boolean;
  /** 0..1 */
  volume: number;
  /** Absolute paths to custom files; null = bundled chime. */
  to_break_path: string | null;
  to_work_path: string | null;
}

export interface Settings {
  preset: PresetId;
  custom_work_min: number;
  custom_break_min: number;
  /** Seconds before a phase change at which the sound + flash fire. */
  warning_secs: number;
  /** Start the next focus phase automatically when a break ends. */
  auto_start_work: boolean;
  /** Caption under the break countdown, e.g. "20-20-20: look 20 feet away for 20 seconds". */
  caption: string;
  /** 0..1 darkness of the veil. */
  veil_opacity: number;
  veil_blocks_input: boolean;
  allow_skip_break: boolean;
  hud: HudSettings;
  /** Tauri shortcut strings, e.g. "Ctrl+Alt+E". */
  toggle_window_hotkey: string;
  move_hud_hotkey: string;
  sound: SoundSettings;
  autostart: boolean;
  start_on_launch: boolean;
}

export interface DayStats {
  /** ISO date, local time zone. */
  date: string;
  focus_secs: number;
  work_sessions: number;
  breaks_completed: number;
  breaks_skipped: number;
}

/** Focus time per project over the 7-day window; `project` null = unlabelled. */
export interface ProjectStats {
  project: string | null;
  focus_secs: number;
  sessions: number;
}

/** One past focus session, for the statistics list. */
export interface SessionView {
  /** RFC 3339, when the session ended. */
  ts: string;
  label: SessionLabel | null;
  actual_secs: number;
  completed: boolean;
}

export interface Stats {
  today: DayStats;
  /** Oldest first, exactly 7 entries ending with today. */
  last_7_days: DayStats[];
  /** Consecutive days (ending today or yesterday) with at least one completed work session. */
  streak_days: number;
  all_time_focus_secs: number;
  /** Sorted by focus_secs descending. */
  by_project_7d: ProjectStats[];
  /** Newest first, at most 30 work sessions. */
  recent: SessionView[];
}

/** Tauri command names, kept in one place so a typo is a compile error in `api.ts`. */
export const COMMANDS = {
  getState: "get_state",
  start: "start",
  pause: "pause",
  resume: "resume",
  skip: "skip",
  stop: "stop", // drop the current phase; wait paused in work with the full duration
  extendBreak: "extend_break", // { secs: number }
  setPreset: "set_preset", // { preset: PresetId }
  setLabel: "set_label", // { label: string | null } caption for the current/next focus session
  getSettings: "get_settings",
  saveSettings: "save_settings", // { settings: Settings }
  resetHudPosition: "reset_hud_position",
  getStats: "get_stats",
  hudReady: "hud_ready", // the HUD page rendered; the shell shows the window
  veilReady: "veil_ready", // { label: string }
  quit: "quit",
} as const;

export const EVENTS = {
  tick: "timer:tick",
  phase: "timer:phase",
  warning: "timer:warning",
  moveMode: "hud:move-mode",
  settingsChanged: "settings:changed",
} as const;
