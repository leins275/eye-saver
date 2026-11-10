import { useState, type KeyboardEvent } from "react";
import { pause, resume, setLabel, setPreset, skip, start, stop } from "../shared/api";
import { formatClock, presetLabel, presetMinutes } from "../shared/format";
import { parseLabel } from "../shared/label";
import { PRESETS, type PresetId, type TimerState } from "../shared/types";
import type { useSettings } from "../shared/useSettings";
import { Toggle } from "./controls";
import { LabelField } from "./LabelField";

type Store = ReturnType<typeof useSettings>;

const PRESET_ORDER: PresetId[] = ["pomodoro", "academic", "deep", "custom"];
const PRESET_DESC: Record<PresetId, string> = {
  pomodoro: "The classic short loop.",
  academic: "One lecture, one breather.",
  deep: "The longest focus block research supports.",
  custom: "Your own rhythm.",
};

export const CUSTOM_LIMITS = { work: { min: 1, max: 240 }, break: { min: 1, max: 120 } };

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function TimerPage({ timer, store }: { timer: TimerState | null; store: Store }) {
  const { settings, commit } = store;
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch {
      /* the next tick reflects whatever the shell did */
    } finally {
      setBusy(false);
    }
  };

  const notStarted =
    timer !== null &&
    !timer.running &&
    timer.phase === "work" &&
    timer.remaining_secs === timer.total_secs;
  const primaryLabel =
    timer === null ? "Start" : timer.running ? "Pause" : notStarted ? "Start" : "Resume";
  const onPrimary = () => {
    if (!timer) return;
    void run(timer.running ? pause : notStarted ? start : resume);
  };

  const phaseText =
    timer === null
      ? "…"
      : !timer.running
        ? notStarted
          ? "Ready"
          : "Paused"
        : timer.phase === "work"
          ? "Focus"
          : "Break";
  const progress =
    timer && timer.total_secs > 0
      ? 1 - Math.min(1, Math.max(0, timer.remaining_secs / timer.total_secs))
      : 0;

  const label = timer?.label ?? null;
  const parsedLabel = label === null ? null : parseLabel(label);
  const labelLine = parsedLabel
    ? [parsedLabel.project, parsedLabel.title, parsedLabel.tags.join(", ")]
        .filter(Boolean)
        .join(" · ")
    : "";

  const presetId = settings?.preset ?? timer?.preset ?? "pomodoro";
  const minutes = settings ? presetMinutes(presetId, settings) : PRESETS.pomodoro;

  const choose = (id: PresetId) => {
    if (!settings || id === settings.preset) return;
    void run(async () => {
      await commit({ preset: id });
      await setPreset(id);
    });
  };

  const commitCustom = (field: "custom_work_min" | "custom_break_min", raw: string) => {
    if (!settings) return;
    const limits = field === "custom_work_min" ? CUSTOM_LIMITS.work : CUSTOM_LIMITS.break;
    const value = clampInt(raw, limits.min, limits.max, settings[field]);
    if (value === settings[field]) return;
    void run(async () => {
      await commit({ [field]: value });
      if (settings.preset === "custom") await setPreset("custom");
    });
  };

  const onCardKey = (e: KeyboardEvent<HTMLDivElement>, id: PresetId) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(id);
    }
  };

  return (
    <>
      <header className="page-head">
        <h1 className="page-title">Timer</h1>
      </header>

      <section className={`card timer-hero phase-${timer?.phase ?? "work"}`} aria-live="polite">
        <p className="kicker timer-phase">{phaseText}</p>
        <div className="timer-clock mono">
          {timer ? formatClock(timer.remaining_secs) : "--:--"}
        </div>
        {labelLine && <p className="timer-label-line">{labelLine}</p>}
        <div className="progress timer-progress" aria-hidden="true">
          <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
        </div>
        <p className="timer-sub muted">
          {presetLabel(presetId)} · {minutes.work_min} / {minutes.break_min} min
        </p>
        <div className="timer-actions">
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={onPrimary}
            disabled={busy || timer === null}
          >
            {primaryLabel}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-lg"
            onClick={() => void run(skip)}
            disabled={busy || timer === null || notStarted}
            title="Skip the current phase"
          >
            {timer?.phase === "break" ? "Skip to focus" : "Skip to break"}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-lg"
            onClick={() => void run(stop)}
            disabled={busy || timer === null || notStarted}
            title="Drop the current session and reset the timer"
          >
            Stop
          </button>
        </div>
        <label className="timer-auto" htmlFor="auto-start-work">
          <Toggle
            id="auto-start-work"
            label="Auto-start focus after a break"
            checked={settings?.auto_start_work ?? true}
            disabled={!settings}
            onChange={(v) => void run(() => commit({ auto_start_work: v }))}
          />
          <span className="timer-auto-text">
            Auto-start next focus
            {settings && (
              <>
                {" "}
                <kbd className="kbd">{settings.toggle_auto_start_hotkey}</kbd>
              </>
            )}
          </span>
        </label>
      </section>

      <LabelField
        key={label ?? ""}
        label={label}
        disabled={timer === null}
        onCommit={(next) => {
          setLabel(next).catch(() => {
            /* the next tick shows what the shell kept */
          });
        }}
      />

      <h2 className="section-title">Rhythm</h2>
      <div className="preset-grid" role="radiogroup" aria-label="Preset">
        {PRESET_ORDER.map((id) => {
          const m = settings ? presetMinutes(id, settings) : id === "custom" ? null : PRESETS[id];
          const selected = presetId === id;
          return (
            <div
              key={id}
              role="radio"
              aria-checked={selected}
              tabIndex={0}
              className="preset"
              onClick={() => choose(id)}
              onKeyDown={(e) => onCardKey(e, id)}
            >
              <span className="preset-name">{presetLabel(id)}</span>
              {id !== "custom" ? (
                <span className="preset-ratio mono">
                  {m?.work_min} <span className="preset-slash">/</span> {m?.break_min}
                </span>
              ) : (
                <span className="preset-custom" onClick={(e) => e.stopPropagation()}>
                  <input
                    key={`w${settings?.custom_work_min ?? 0}`}
                    className="input input-num"
                    type="number"
                    inputMode="numeric"
                    aria-label="Custom work minutes"
                    min={CUSTOM_LIMITS.work.min}
                    max={CUSTOM_LIMITS.work.max}
                    defaultValue={settings?.custom_work_min ?? ""}
                    disabled={!settings}
                    onBlur={(e) => commitCustom("custom_work_min", e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                  />
                  <span className="preset-slash">/</span>
                  <input
                    key={`b${settings?.custom_break_min ?? 0}`}
                    className="input input-num"
                    type="number"
                    inputMode="numeric"
                    aria-label="Custom break minutes"
                    min={CUSTOM_LIMITS.break.min}
                    max={CUSTOM_LIMITS.break.max}
                    defaultValue={settings?.custom_break_min ?? ""}
                    disabled={!settings}
                    onBlur={(e) => commitCustom("custom_break_min", e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                  />
                </span>
              )}
              <span className="preset-desc hint">{PRESET_DESC[id]}</span>
            </div>
          );
        })}
      </div>
      <p className="hint preset-foot">
        Work / break, in minutes. Changing the preset restarts the current phase.
      </p>
    </>
  );
}
