import { useState, type CSSProperties, type ReactNode } from "react";
import { pickAudioFile, quit, resetHudPosition } from "../shared/api";
import { playChime } from "../shared/audio";
import type { Settings } from "../shared/types";
import type { SaveState, useSettings } from "../shared/useSettings";
import { HotkeyField, Row, Slider, Toggle } from "./controls";
import { CUSTOM_LIMITS } from "./TimerPage";

type Store = ReturnType<typeof useSettings>;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-section">
      <h2 className="section-title">{title}</h2>
      <div className="card settings-card">{children}</div>
    </section>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const text =
    state === "saving"
      ? "Saving…"
      : state === "saved"
        ? "Saved"
        : state === "error"
          ? "Could not save"
          : "";
  return (
    <span className={`save-indicator is-${state}`} role="status" aria-live="polite">
      {text}
    </span>
  );
}

function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const times = (v: number) => `${v.toFixed(2).replace(/\.?0+$/, "")}×`;

export function SettingsPage({ store }: { store: Store }) {
  const { settings, saveState, update } = store;
  const [resetDone, setResetDone] = useState(false);

  if (!settings) {
    return (
      <>
        <header className="page-head">
          <h1 className="page-title">Settings</h1>
        </header>
        <p className="hint">Loading…</p>
      </>
    );
  }

  const s: Settings = settings;
  const hotkeys = [s.toggle_window_hotkey, s.move_hud_hotkey, s.toggle_auto_start_hotkey].map((h) =>
    h.trim().toLowerCase(),
  );
  const hotkeyConflict = (combo: string) =>
    hotkeys.filter((h) => h === combo.trim().toLowerCase()).length > 1;

  const clampInt = (raw: string, min: number, max: number, fallback: number) => {
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };

  const pickSound = async (field: "to_break_path" | "to_work_path") => {
    try {
      const path = await pickAudioFile();
      if (path) update({ sound: { [field]: path } });
    } catch {
      /* dialog unavailable */
    }
  };

  const soundRow = (label: string, field: "to_break_path" | "to_work_path") => {
    const path = s.sound[field];
    return (
      <Row label={label} hint={path ? <span title={path}>{basename(path)}</span> : "Bundled chime"}>
        <span className="btn-group">
          <button type="button" className="btn btn-sm" onClick={() => void pickSound(field)}>
            Choose…
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={!path}
            onClick={() => update({ sound: { [field]: null } })}
          >
            Clear
          </button>
        </span>
      </Row>
    );
  };

  return (
    <>
      <header className="page-head">
        <h1 className="page-title">Settings</h1>
        <SaveIndicator state={saveState} />
      </header>

      <Section title="Rhythm">
        <Row
          label="Custom preset"
          hint={`Work / break in minutes. Pick "Custom" on the Timer page to use it.`}
        >
          <span className="btn-group">
            <input
              key={`w${s.custom_work_min}`}
              className="input input-num"
              type="number"
              aria-label="Custom work minutes"
              min={CUSTOM_LIMITS.work.min}
              max={CUSTOM_LIMITS.work.max}
              defaultValue={s.custom_work_min}
              onBlur={(e) =>
                update({
                  custom_work_min: clampInt(
                    e.currentTarget.value,
                    CUSTOM_LIMITS.work.min,
                    CUSTOM_LIMITS.work.max,
                    s.custom_work_min,
                  ),
                })
              }
            />
            <span className="muted">/</span>
            <input
              key={`b${s.custom_break_min}`}
              className="input input-num"
              type="number"
              aria-label="Custom break minutes"
              min={CUSTOM_LIMITS.break.min}
              max={CUSTOM_LIMITS.break.max}
              defaultValue={s.custom_break_min}
              onBlur={(e) =>
                update({
                  custom_break_min: clampInt(
                    e.currentTarget.value,
                    CUSTOM_LIMITS.break.min,
                    CUSTOM_LIMITS.break.max,
                    s.custom_break_min,
                  ),
                })
              }
            />
          </span>
        </Row>
        <Row
          label="Warning before a change"
          hint="Seconds of chime and HUD flash before the phase flips."
          htmlFor="warning-secs"
        >
          <Slider
            id="warning-secs"
            label="Warning seconds"
            min={0}
            max={30}
            step={1}
            value={s.warning_secs}
            format={(v) => `${v} s`}
            onChange={(v) => update({ warning_secs: v })}
          />
        </Row>
      </Section>

      <Section title="Break veil">
        <Row label="Caption" hint="Shown under the break countdown." htmlFor="caption">
          <input
            id="caption"
            className="input input-wide"
            type="text"
            maxLength={160}
            value={s.caption}
            onChange={(e) => update({ caption: e.currentTarget.value })}
          />
        </Row>
        <Row label="Darkness" hint="How much of the screen the veil hides." htmlFor="veil-opacity">
          <span className="btn-group">
            <span
              className="veil-swatch"
              aria-hidden="true"
              style={{ "--swatch-opacity": s.veil_opacity } as CSSProperties}
            >
              <span className="veil-swatch-layer" />
              <span className="veil-swatch-text mono">04:50</span>
            </span>
            <Slider
              id="veil-opacity"
              label="Veil darkness"
              min={0.3}
              max={1}
              step={0.01}
              value={s.veil_opacity}
              format={pct}
              onChange={(v) => update({ veil_opacity: v })}
            />
          </span>
        </Row>
        <Row
          label="Veil blocks mouse and keyboard"
          hint="Nothing underneath can be clicked until the break ends."
          htmlFor="veil-blocks"
        >
          <Toggle
            id="veil-blocks"
            label="Veil blocks mouse and keyboard"
            checked={s.veil_blocks_input}
            onChange={(v) => update({ veil_blocks_input: v })}
          />
        </Row>
        <Row
          label="Allow skipping breaks"
          hint="Shows a Skip button (and Esc) on the veil."
          htmlFor="allow-skip"
        >
          <Toggle
            id="allow-skip"
            label="Allow skipping breaks"
            checked={s.allow_skip_break}
            onChange={(v) => update({ allow_skip_break: v })}
          />
        </Row>
      </Section>

      <Section title="HUD">
        <Row
          label="Show the countdown"
          hint="A small always-on-top pill during focus."
          htmlFor="hud-visible"
        >
          <Toggle
            id="hud-visible"
            label="Show the HUD"
            checked={s.hud.visible}
            onChange={(v) => update({ hud: { visible: v } })}
          />
        </Row>
        <Row label="Opacity" htmlFor="hud-opacity">
          <Slider
            id="hud-opacity"
            label="HUD opacity"
            min={0.2}
            max={1}
            step={0.01}
            value={s.hud.opacity}
            format={pct}
            onChange={(v) => update({ hud: { opacity: v } })}
          />
        </Row>
        <Row label="Size" htmlFor="hud-scale">
          <Slider
            id="hud-scale"
            label="HUD size"
            min={0.75}
            max={2}
            step={0.05}
            value={s.hud.scale}
            format={times}
            onChange={(v) => update({ hud: { scale: v } })}
          />
        </Row>
        <Row
          label="Position"
          hint={
            <>
              Hold <kbd className="kbd">{s.move_hud_hotkey}</kbd> and drag the HUD to move it.
            </>
          }
        >
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              resetHudPosition()
                .then(() => setResetDone(true))
                .catch(() => {});
            }}
          >
            {resetDone ? "Position reset" : "Reset position"}
          </button>
        </Row>
      </Section>

      <Section title="Hotkeys">
        <Row
          label="Show / hide this window"
          hint="Click the field, then press the combination."
          htmlFor="hotkey-toggle"
        >
          <HotkeyField
            id="hotkey-toggle"
            label="Toggle window hotkey"
            value={s.toggle_window_hotkey}
            conflict={hotkeyConflict(s.toggle_window_hotkey)}
            onChange={(combo) => update({ toggle_window_hotkey: combo })}
          />
        </Row>
        <Row
          label="Move the HUD (hold)"
          hint="While held, the HUD can be dragged."
          htmlFor="hotkey-move"
        >
          <HotkeyField
            id="hotkey-move"
            label="Move HUD hotkey"
            value={s.move_hud_hotkey}
            conflict={hotkeyConflict(s.move_hud_hotkey)}
            onChange={(combo) => update({ move_hud_hotkey: combo })}
          />
        </Row>
        <Row
          label="Toggle auto-start of the next focus"
          hint="Flips the switch on the Timer page without opening the window; the HUD tag shows the state."
          htmlFor="hotkey-auto-start"
        >
          <HotkeyField
            id="hotkey-auto-start"
            label="Toggle auto-start hotkey"
            value={s.toggle_auto_start_hotkey}
            conflict={hotkeyConflict(s.toggle_auto_start_hotkey)}
            onChange={(combo) => update({ toggle_auto_start_hotkey: combo })}
          />
        </Row>
      </Section>

      <Section title="Sound">
        <Row label="Chime before a phase change" htmlFor="sound-enabled">
          <Toggle
            id="sound-enabled"
            label="Sound enabled"
            checked={s.sound.enabled}
            onChange={(v) => update({ sound: { enabled: v } })}
          />
        </Row>
        <Row label="Volume" htmlFor="sound-volume">
          <span className="btn-group">
            <Slider
              id="sound-volume"
              label="Volume"
              min={0}
              max={1}
              step={0.01}
              value={s.sound.volume}
              format={pct}
              onChange={(v) => update({ sound: { volume: v } })}
            />
            <button
              type="button"
              className="btn btn-sm"
              disabled={!s.sound.enabled}
              onClick={() => playChime("to_break", s.sound)}
            >
              Test
            </button>
          </span>
        </Row>
        {soundRow("Focus → break chime", "to_break_path")}
        {soundRow("Break → focus chime", "to_work_path")}
      </Section>

      <Section title="System">
        <Row label="Start the timer when the app opens" htmlFor="start-on-launch">
          <Toggle
            id="start-on-launch"
            label="Start timer on launch"
            checked={s.start_on_launch}
            onChange={(v) => update({ start_on_launch: v })}
          />
        </Row>
        <Row
          label="Launch at login"
          hint="Eye Saver starts hidden in the tray."
          htmlFor="autostart"
        >
          <Toggle
            id="autostart"
            label="Launch at login"
            checked={s.autostart}
            onChange={(v) => update({ autostart: v })}
          />
        </Row>
        <Row
          label="Quit Eye Saver"
          hint="Closing this window only hides it; the timer keeps running in the tray."
        >
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={() => void quit().catch(() => {})}
          >
            Quit
          </button>
        </Row>
      </Section>
    </>
  );
}
