import { useEffect, useRef, useState, type CSSProperties } from "react";
import { hudReady, onMoveMode, onPhase, onWarning } from "../shared/api";
import { playChime } from "../shared/audio";
import { formatClock } from "../shared/format";
import { useSettings } from "../shared/useSettings";
import { useTimer } from "../shared/useTimer";

/** If state never arrives, show the window anyway rather than nothing. */
const READY_FALLBACK_MS = 2000;

/**
 * The always-on-top countdown pill. Transparent window, click-through except
 * while the move shortcut is held, when the whole pill is a drag region.
 */
export function Hud() {
  const state = useTimer();
  const { settings } = useSettings();
  const [flash, setFlash] = useState(false);
  const [moveMode, setMoveMode] = useState(false);
  const readySent = useRef(false);
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Tell the shell we have painted so it can show the window (no white flash).
  const loaded = state !== null && settings !== null;
  useEffect(() => {
    if (readySent.current) return;
    const send = () => {
      if (readySent.current) return;
      readySent.current = true;
      hudReady().catch(() => {});
    };
    if (loaded) {
      send();
      return;
    }
    const handle = setTimeout(send, READY_FALLBACK_MS);
    return () => clearTimeout(handle);
  }, [loaded]);

  // Warning: chime + flash until the phase actually flips (or a safety timeout).
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const subWarn = onWarning(({ next_phase }) => {
      const s = settingsRef.current;
      if (s) playChime(next_phase === "break" ? "to_break" : "to_work", s.sound);
      setFlash(true);
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => setFlash(false), ((s?.warning_secs ?? 5) + 2) * 1000);
    });
    const subPhase = onPhase(() => {
      setFlash(false);
      if (timeout) clearTimeout(timeout);
    });
    return () => {
      if (timeout) clearTimeout(timeout);
      for (const sub of [subWarn, subPhase]) sub.then((u) => u()).catch(() => {});
    };
  }, []);

  useEffect(() => {
    const sub = onMoveMode(({ on }) => setMoveMode(on));
    return () => {
      sub.then((u) => u()).catch(() => {});
    };
  }, []);

  const hud = settings?.hud;
  const scale = hud?.scale ?? 1;
  const opacity = moveMode ? 1 : (hud?.opacity ?? 0.85);
  const warning = flash || state?.warning === true;
  const paused = state !== null && !state.running;
  const phaseLabel =
    state === null ? "" : paused ? "paused" : state.phase === "work" ? "focus" : "break";
  const clock = state ? formatClock(state.remaining_secs) : "--:--";

  // Tauri only starts a drag when the mousedown *target* carries the
  // attribute, so every element inside the pill gets it while moving.
  const drag = moveMode ? { "data-tauri-drag-region": true } : {};

  const classes = ["hud"];
  if (warning) classes.push("is-warning");
  if (paused) classes.push("is-paused");
  if (moveMode) classes.push("is-moving");
  if (state?.phase === "break") classes.push("is-break");

  return (
    <div className="hud-root" style={{ "--hud-scale": scale } as CSSProperties} {...drag}>
      <div className={classes.join(" ")} style={{ opacity }} {...drag}>
        <span className="hud-dot" aria-hidden="true" {...drag} />
        <span className="hud-clock mono" {...drag}>
          {paused && (
            <span className="hud-pause" aria-label="paused" {...drag}>
              ❚❚
            </span>
          )}
          {clock}
        </span>
        <span className="hud-phase" {...drag}>
          {phaseLabel}
        </span>
        {moveMode && (
          <span className="hud-hint" {...drag}>
            drag to move
          </span>
        )}
      </div>
    </div>
  );
}
