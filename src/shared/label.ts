import type { SessionLabel } from "./types";

/**
 * Mirror of the Rust parser (`eye-core::label`), used only for the live
 * preview while typing: `<Project> - <Title> - <tag, tag>`, spaces around `-`
 * optional. One section is a bare title, two are project + title, three add
 * comma-separated tags; four or more keep the middle sections as the title.
 * Tags are trimmed and de-duplicated case-insensitively (first spelling wins).
 * Blank input parses to `null`.
 */
export function parseLabel(raw: string): SessionLabel | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  // Like the Rust parser: empty sections (" - title", "a--b") are dropped first.
  const sections = trimmed
    .split("-")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  if (sections.length === 0) return null;
  let project: string | null = null;
  let title: string;
  let tags: string[] = [];

  if (sections.length === 1) {
    title = sections[0];
  } else if (sections.length === 2) {
    [project, title] = sections;
  } else {
    project = sections[0];
    title = sections.slice(1, -1).join(" - ");
    tags = parseTags(sections[sections.length - 1]);
  }

  return { raw: trimmed, project, title, tags };
}

function parseTags(section: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of section.split(",")) {
    const tag = part.trim();
    const key = tag.toLowerCase();
    if (tag === "" || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}
