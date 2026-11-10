import { convertFileSrc } from "@tauri-apps/api/core";
import toBreakUrl from "../assets/sounds/to-break.wav?url";
import toWorkUrl from "../assets/sounds/to-work.wav?url";
import type { SoundSettings } from "./types";

export type ChimeKind = "to_break" | "to_work";

function bundled(kind: ChimeKind): string {
  return kind === "to_break" ? toBreakUrl : toWorkUrl;
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
}

/**
 * Plays the chime for a phase change. Never throws: a missing custom file
 * falls back to the bundled one, and a refused `play()` (autoplay policy,
 * no audio device) is swallowed -- the HUD flash still happens.
 */
export function playChime(kind: ChimeKind, settings: SoundSettings): void {
  if (!settings.enabled) return;
  const volume = clamp01(settings.volume);
  if (volume === 0) return;

  const customPath = kind === "to_break" ? settings.to_break_path : settings.to_work_path;
  let src = bundled(kind);
  if (customPath) {
    try {
      src = convertFileSrc(customPath);
    } catch {
      src = bundled(kind);
    }
  }

  const play = (url: string, onError: (() => void) | null) => {
    try {
      const audio = new Audio(url);
      audio.volume = volume;
      if (onError) audio.addEventListener("error", onError, { once: true });
      audio.play().catch(() => {
        /* autoplay refused / no device */
      });
    } catch {
      /* Audio not constructible (tests, headless) */
    }
  };

  play(src, src === bundled(kind) ? null : () => play(bundled(kind), null));
}
