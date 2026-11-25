import type { KeyboardEvent } from "react";
import type { LabelDraft } from "../shared/label";

/**
 * The three caption inputs, two rows: a short project code beside a wide
 * title, then comma-separated tags. Controlled; the owner keeps the draft.
 */
export function LabelFields({
  draft,
  onChange,
  disabled,
  onKeyDown,
  autoFocus,
}: {
  draft: LabelDraft;
  onChange: (next: LabelDraft) => void;
  disabled?: boolean;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  autoFocus?: boolean;
}) {
  const field = (
    key: keyof LabelDraft,
    label: string,
    placeholder: string,
    className: string,
    focus = false,
  ) => (
    <input
      className={`input label-input ${className}`}
      type="text"
      autoComplete="off"
      spellCheck={false}
      aria-label={label}
      placeholder={placeholder}
      value={draft[key]}
      disabled={disabled}
      autoFocus={focus}
      onChange={(e) => onChange({ ...draft, [key]: e.currentTarget.value })}
      onKeyDown={onKeyDown}
    />
  );
  return (
    <div className="label-grid">
      {field("project", "Project", "PROJECT", "label-project", autoFocus)}
      {field("title", "Title", "What you are doing", "label-title-input")}
      {field("tags", "Tags", "Tags, comma separated", "label-tags")}
    </div>
  );
}
