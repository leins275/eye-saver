/**
 * The only module that talks to the Tauri runtime. Every page goes through
 * these wrappers, so tests mock this one module (`vi.mock("../shared/api")`)
 * and never need a webview.
 */
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import {
  COMMANDS,
  EVENTS,
  type MoveModeEvent,
  type PresetId,
  type Settings,
  type Stats,
  type TimerState,
  type WarningEvent,
} from "./types";

// ---- commands --------------------------------------------------------------

export function getState(): Promise<TimerState> {
  return invoke<TimerState>(COMMANDS.getState);
}

export function start(): Promise<void> {
  return invoke(COMMANDS.start);
}

export function pause(): Promise<void> {
  return invoke(COMMANDS.pause);
}

export function resume(): Promise<void> {
  return invoke(COMMANDS.resume);
}

export function skip(): Promise<void> {
  return invoke(COMMANDS.skip);
}

export function extendBreak(secs: number): Promise<void> {
  return invoke(COMMANDS.extendBreak, { secs });
}

export function setPreset(preset: PresetId): Promise<void> {
  return invoke(COMMANDS.setPreset, { preset });
}

export function getSettings(): Promise<Settings> {
  return invoke<Settings>(COMMANDS.getSettings);
}

export function saveSettings(settings: Settings): Promise<void> {
  return invoke(COMMANDS.saveSettings, { settings });
}

export function resetHudPosition(): Promise<void> {
  return invoke(COMMANDS.resetHudPosition);
}

export function getStats(): Promise<Stats> {
  return invoke<Stats>(COMMANDS.getStats);
}

/** The HUD page rendered; the shell shows the (until now hidden) window. */
export function hudReady(): Promise<void> {
  return invoke(COMMANDS.hudReady);
}

/** A veil page rendered; the shell may show that window at break start. */
export function veilReady(label: string): Promise<void> {
  return invoke(COMMANDS.veilReady, { label });
}

export function quit(): Promise<void> {
  return invoke(COMMANDS.quit);
}

// ---- events ----------------------------------------------------------------

type Handler<T> = (payload: T) => void;

function on<T>(event: string, cb: Handler<T>): Promise<UnlistenFn> {
  return listen<T>(event, (e) => cb(e.payload));
}

export function onTick(cb: Handler<TimerState>): Promise<UnlistenFn> {
  return on(EVENTS.tick, cb);
}

export function onPhase(cb: Handler<TimerState>): Promise<UnlistenFn> {
  return on(EVENTS.phase, cb);
}

export function onWarning(cb: Handler<WarningEvent>): Promise<UnlistenFn> {
  return on(EVENTS.warning, cb);
}

export function onMoveMode(cb: Handler<MoveModeEvent>): Promise<UnlistenFn> {
  return on(EVENTS.moveMode, cb);
}

export function onSettingsChanged(cb: Handler<Settings>): Promise<UnlistenFn> {
  return on(EVENTS.settingsChanged, cb);
}

// ---- window / app ----------------------------------------------------------

/** Label of the window this page runs in, e.g. `veil-1`. */
export function currentWindowLabel(): string {
  return getCurrentWindow().label;
}

/** The installed app's own version, from the Tauri config baked into this build. */
export function appVersion(): Promise<string> {
  return getVersion();
}

/** Native file picker for a custom chime; `null` when cancelled. */
export async function pickAudioFile(): Promise<string | null> {
  const picked = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Audio", extensions: ["wav", "mp3", "ogg"] }],
  });
  return typeof picked === "string" ? picked : null;
}

// ---- updater ---------------------------------------------------------------

export type PendingUpdate = Update;

/** Asks the updater endpoint; `null` when already current. Rejects when offline. */
export function checkForUpdate(): Promise<PendingUpdate | null> {
  return check();
}

/** Restarts the app so an installed update takes effect. */
export function relaunchApp(): Promise<void> {
  return relaunch();
}
