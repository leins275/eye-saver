import { useCallback, useEffect, useRef, useState } from "react";
import { getSettings, onSettingsChanged, saveSettings } from "./api";
import type { Settings } from "./types";

export type SaveState = "idle" | "saving" | "saved" | "error";

/** Debounce for `update()`; sliders and text fields fire on every keystroke. */
export const SAVE_DEBOUNCE_MS = 300;
/** How long the "Saved" indicator stays visible. */
export const SAVED_LINGER_MS = 1500;

/** Deep-ish merge: one nested level (`hud`, `sound`) is all the contract has. */
export type SettingsPatch = Partial<Omit<Settings, "hud" | "sound">> & {
  hud?: Partial<Settings["hud"]>;
  sound?: Partial<Settings["sound"]>;
};

export function applyPatch(base: Settings, patch: SettingsPatch): Settings {
  return {
    ...base,
    ...patch,
    hud: { ...base.hud, ...(patch.hud ?? {}) },
    sound: { ...base.sound, ...(patch.sound ?? {}) },
  };
}

/**
 * Settings shared with the shell. Loads once, re-syncs on `settings:changed`
 * (from the tray, another window or a hotkey re-registration).
 *
 * `update(patch)` applies locally at once and saves after a short debounce;
 * `commit(patch)` saves immediately and resolves when the shell has it, for
 * callers that must act *after* the save (e.g. re-applying a preset).
 *
 * External `settings:changed` events are ignored while a local edit is still
 * unsaved, so a round-trip of our own previous save cannot clobber what the
 * user is typing right now.
 */
export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const latest = useRef<Settings | null>(null);
  const dirty = useRef(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linger = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const accept = (s: Settings) => {
      if (cancelled || dirty.current) return;
      latest.current = s;
      setSettings(s);
    };
    const sub = onSettingsChanged(accept);
    getSettings()
      .then(accept)
      .catch(() => {});
    return () => {
      cancelled = true;
      sub.then((unlisten) => unlisten()).catch(() => {});
      if (debounce.current) clearTimeout(debounce.current);
      if (linger.current) clearTimeout(linger.current);
    };
  }, []);

  const persist = useCallback(async (): Promise<void> => {
    const snapshot = latest.current;
    if (!snapshot) return;
    setSaveState("saving");
    try {
      await saveSettings(snapshot);
      // Only clear the flag if nothing changed while the save was in flight.
      if (latest.current === snapshot) dirty.current = false;
      setSaveState("saved");
      if (linger.current) clearTimeout(linger.current);
      linger.current = setTimeout(() => setSaveState("idle"), SAVED_LINGER_MS);
    } catch {
      setSaveState("error");
    }
  }, []);

  const applyLocal = useCallback((patch: SettingsPatch): Settings | null => {
    const base = latest.current;
    if (!base) return null;
    const next = applyPatch(base, patch);
    latest.current = next;
    dirty.current = true;
    setSettings(next);
    return next;
  }, []);

  const update = useCallback(
    (patch: SettingsPatch) => {
      if (!applyLocal(patch)) return;
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => {
        debounce.current = null;
        void persist();
      }, SAVE_DEBOUNCE_MS);
    },
    [applyLocal, persist],
  );

  const commit = useCallback(
    async (patch: SettingsPatch): Promise<void> => {
      if (!applyLocal(patch)) return;
      if (debounce.current) {
        clearTimeout(debounce.current);
        debounce.current = null;
      }
      await persist();
    },
    [applyLocal, persist],
  );

  return { settings, saveState, update, commit };
}
