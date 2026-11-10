import { useId, useState, type KeyboardEvent } from "react";
import { parseLabel } from "../shared/label";
import { LabelChips } from "./controls";

export const LABEL_PLACEHOLDER = "PROJECT - what you are doing - tag, tag";

/**
 * Caption of the current/next focus session, committed on Enter or blur.
 * The draft lives here; the parent remounts the field (via `key`) whenever
 * the shell's label changes, so a tick never fights what is being typed.
 */
export function LabelField({
  label,
  disabled,
  onCommit,
}: {
  label: string | null;
  disabled: boolean;
  onCommit: (next: string | null) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(label ?? "");
  const preview = parseLabel(draft);

  const commit = () => {
    const next = draft.trim() || null;
    if (next !== label) onCommit(next);
  };

  const clear = () => {
    setDraft("");
    if (label !== null) onCommit(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      setDraft(label ?? "");
      e.currentTarget.blur();
    }
  };

  return (
    <section className="card label-card">
      <div className="label-head">
        <label className="kicker" htmlFor={id}>
          Working on
        </label>
        <span className="hint">Tells your sessions apart in Statistics</span>
      </div>
      <div className="label-field">
        <input
          id={id}
          className="input label-input"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder={LABEL_PLACEHOLDER}
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
        />
        {(draft !== "" || label !== null) && (
          <button
            type="button"
            className="label-clear"
            aria-label="Clear caption"
            title="Clear"
            disabled={disabled}
            onClick={clear}
          >
            ×
          </button>
        )}
      </div>
      <div className="label-preview">
        {preview ? (
          <LabelChips label={preview} />
        ) : (
          <span className="hint">e.g. CORE - discuss Q3 strategy - sync, strategy</span>
        )}
      </div>
    </section>
  );
}
