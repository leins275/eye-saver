import type { Settings } from "./types";

/**
 * Mirror of the Rust `Settings::default()`. The pages never *use* this as a
 * fallback (settings always come from the shell); it exists for tests and for
 * the "Reset" affordances that need a known baseline.
 */
export const DEFAULT_SETTINGS: Settings = {
  preset: "pomodoro",
  custom_work_min: 50,
  custom_break_min: 10,
  warning_secs: 5,
  caption: "20-20-20: look at something 20 feet away for 20 seconds",
  veil_opacity: 0.92,
  veil_blocks_input: true,
  allow_skip_break: true,
  hud: { x: null, y: null, opacity: 0.85, scale: 1, visible: true },
  toggle_window_hotkey: "Ctrl+Alt+E",
  move_hud_hotkey: "Ctrl+Alt+M",
  sound: { enabled: true, volume: 0.6, to_break_path: null, to_work_path: null },
  autostart: false,
  start_on_launch: true,
};
