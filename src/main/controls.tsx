import { useId, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import type { SessionLabel } from "../shared/types";
import { comboFromKeyboardEvent, isValidCombo } from "./hotkey";

/** A settings row: label + hint on the left, the control on the right. */
export function Row({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="row">
      <div className="row-text">
        <label className="row-label" htmlFor={htmlFor}>
          {label}
        </label>
        {hint && <p className="hint">{hint}</p>}
      </div>
      <div className="row-control">{children}</div>
    </div>
  );
}

export function Toggle({
  id,
  checked,
  onChange,
  disabled,
  label,
}: {
  id?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <span className="switch">
      <input
        id={id}
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
      <span className="switch-track" aria-hidden="true" />
    </span>
  );
}

export function Slider({
  id,
  value,
  min,
  max,
  step,
  onChange,
  format,
  label,
}: {
  id?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
  format: (v: number) => string;
  label: string;
}) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <span className="slider">
      <input
        id={id}
        type="range"
        className="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ "--pct": `${pct}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
      />
      <span className="slider-value mono">{format(value)}</span>
    </span>
  );
}

/**
 * A read-only text field that records the next key combination pressed
 * while it is focused. Escape cancels the capture.
 */
export function HotkeyField({
  id,
  value,
  onChange,
  label,
  conflict,
}: {
  id?: string;
  value: string;
  onChange: (combo: string) => void;
  label: string;
  conflict?: boolean;
}) {
  const [capturing, setCapturing] = useState(false);
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const valid = isValidCombo(value);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
      e.currentTarget.blur();
      return;
    }
    const combo = comboFromKeyboardEvent(e);
    if (combo === null) return;
    onChange(combo);
    e.currentTarget.blur();
  };

  return (
    <span className="hotkey">
      <input
        id={inputId}
        className="input hotkey-input mono"
        type="text"
        readOnly
        aria-label={label}
        aria-invalid={!valid || conflict ? "true" : undefined}
        value={capturing ? "" : value}
        placeholder={capturing ? "Press a key combination…" : ""}
        onFocus={() => setCapturing(true)}
        onBlur={() => setCapturing(false)}
        onKeyDown={onKeyDown}
      />
      {!valid && <span className="hotkey-error hint">Needs a key besides modifiers.</span>}
      {valid && conflict && <span className="hotkey-error hint">Same as another shortcut.</span>}
    </span>
  );
}

/** A parsed session caption as chips: project (accent), title, tags (muted). */
export function LabelChips({ label }: { label: SessionLabel }) {
  return (
    <span className="label-chips">
      {label.project && <span className="chip chip-accent">{label.project}</span>}
      {label.title && <span className="label-title">{label.title}</span>}
      {label.tags.map((tag) => (
        <span key={tag} className="chip chip-muted">
          {tag}
        </span>
      ))}
    </span>
  );
}
