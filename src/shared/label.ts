import type { SessionLabel } from "./types";

/** What the three caption fields hold while being edited; tags as typed. */
export interface LabelDraft {
  project: string;
  title: string;
  tags: string;
}

export function draftFrom(label: SessionLabel | null): LabelDraft {
  return {
    project: label?.project ?? "",
    title: label?.title ?? "",
    tags: label?.tags.join(", ") ?? "",
  };
}

/**
 * Mirror of the Rust normalization (`eye-core::label`): trims every part,
 * drops an empty project and empty tags, de-duplicates tags
 * case-insensitively (first spelling wins); `null` when nothing is left.
 */
export function labelFromDraft(draft: LabelDraft): SessionLabel | null {
  const project = draft.project.trim() || null;
  const title = draft.title.trim();
  const tags = parseTags(draft.tags);
  if (project === null && title === "" && tags.length === 0) return null;
  return { project, title, tags };
}

/** Comma-separated tags, trimmed, non-empty, de-duplicated case-insensitively. */
export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of text.split(",")) {
    const tag = part.trim();
    const key = tag.toLowerCase();
    if (tag === "" || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

export function sameLabel(a: SessionLabel | null, b: SessionLabel | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.project === b.project &&
    a.title === b.title &&
    a.tags.length === b.tags.length &&
    a.tags.every((t, i) => t === b.tags[i])
  );
}

/** One-line rendering: `CORE · discuss Q3 strategy · sync, strategy`. */
export function labelLine(label: SessionLabel): string {
  return [label.project, label.title, label.tags.join(", ")].filter(Boolean).join(" · ");
}
