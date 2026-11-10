import { useCallback, useEffect, useRef, type CSSProperties } from "react";
import { currentWindowLabel, extendBreak, skip, veilReady } from "../shared/api";
import { formatClock } from "../shared/format";
import { useSettings } from "../shared/useSettings";
import { useTimer } from "../shared/useTimer";

const READY_FALLBACK_MS = 1500;

/** Which monitor this veil covers (`veil.html?monitor=N`); informational. */
export function monitorIndex(search: string = window.location.search): number {
  const raw = new URLSearchParams(search).get("monitor");
  const n = raw === null ? Number.NaN : Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Full-monitor break overlay: a dark veil, a huge countdown, the user's
 * caption, a thin progress bar and the two escape hatches.
 */
export function Veil() {
  const state = useTimer();
  const { settings } = useSettings();
  const readySent = useRef(false);

  const loaded = state !== null && settings !== null;
  useEffect(() => {
    if (readySent.current) return;
    const send = () => {
      if (readySent.current) return;
      readySent.current = true;
      let label = "veil-0";
      try {
        label = currentWindowLabel();
      } catch {
        /* outside Tauri (tests) */
      }
      veilReady(label).catch(() => {});
    };
    if (loaded) {
      send();
      return;
    }
    const handle = setTimeout(send, READY_FALLBACK_MS);
    return () => clearTimeout(handle);
  }, [loaded]);

  const allowSkip = settings?.allow_skip_break ?? false;

  const onSkip = useCallback(() => {
    skip().catch(() => {});
  }, []);

  const onExtend = useCallback(() => {
    extendBreak(60).catch(() => {});
  }, []);

  useEffect(() => {
    if (!allowSkip) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onSkip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [allowSkip, onSkip]);

  const opacity = settings?.veil_opacity ?? 0.92;
  const remaining = state?.remaining_secs ?? 0;
  const total = state?.total_secs ?? 1;
  const progress = total > 0 ? Math.min(1, Math.max(0, 1 - remaining / total)) : 0;
  const caption = settings?.caption ?? "";

  return (
    <div
      className="veil"
      data-monitor={monitorIndex()}
      style={{ "--veil-opacity": opacity } as CSSProperties}
    >
      <div className="veil-content">
        <p className="kicker veil-kicker">Break</p>
        <div className="veil-clock mono" role="timer" aria-live="off">
          {state ? formatClock(remaining) : " "}
        </div>
        <div className="veil-progress" aria-hidden="true">
          <div className="veil-progress-fill" style={{ width: `${progress * 100}%` }} />
        </div>
        {caption && <p className="veil-caption">{caption}</p>}
        <div className="veil-actions">
          <button type="button" className="btn btn-ghost veil-btn" onClick={onExtend}>
            +1 min
          </button>
          {allowSkip && (
            <button type="button" className="btn btn-ghost veil-btn" onClick={onSkip}>
              Skip break
              <kbd className="veil-kbd">Esc</kbd>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
