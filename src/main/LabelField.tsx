import { useState, type FocusEvent, type KeyboardEvent } from "react";
import { draftFrom, labelFromDraft, sameLabel } from "../shared/label";
import type { SessionLabel } from "../shared/types";
import { LabelChips } from "./controls";
import { LabelFields } from "./LabelFields";

/**
 * Caption of the current/next focus session, committed on Enter or when focus
 * leaves the fields. The draft lives here; the parent remounts the card (via
 * `key`) whenever the shell's label changes, so a tick never fights typing.
 */
export function LabelField({
  label,
  disabled,
  onCommit,
}: {
  label: SessionLabel | null;
  disabled: boolean;
  onCommit: (next: SessionLabel | null) => void;
}) {
  const [draft, setDraft] = useState(draftFrom(label));
  const preview = labelFromDraft(draft);

  const commit = () => {
    const next = labelFromDraft(draft);
    if (!sameLabel(next, label)) onCommit(next);
  };

  const clear = () => {
    setDraft(draftFrom(null));
    if (label !== null) onCommit(null);
  };

  // Moving between the three fields is not a commit; leaving the card is.
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget)) commit();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      setDraft(draftFrom(label));
      e.currentTarget.blur();
    }
  };

  return (
    <section className="card label-card" onBlur={onBlur}>
      <div className="label-head">
        <span className="kicker">Working on</span>
        <span className="hint">Tells your sessions apart in Statistics</span>
      </div>
      <LabelFields draft={draft} onChange={setDraft} disabled={disabled} onKeyDown={onKeyDown} />
      <div className="label-foot">
        <div className="label-preview">
          {preview ? (
            <LabelChips label={preview} />
          ) : (
            <span className="hint">e.g. CORE · discuss Q3 strategy · sync, strategy</span>
          )}
        </div>
        {(preview !== null || label !== null) && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-label="Clear caption"
            disabled={disabled}
            onClick={clear}
          >
            Clear
          </button>
        )}
      </div>
    </section>
  );
}
