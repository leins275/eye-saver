import { describe, expect, it } from "vitest";
import { draftFrom, labelFromDraft, labelLine, parseTags, sameLabel } from "./label";

describe("labelFromDraft", () => {
  it("trims the parts and splits comma tags", () => {
    expect(labelFromDraft({ project: " CORE ", title: " review ", tags: " a , b " })).toEqual({
      project: "CORE",
      title: "review",
      tags: ["a", "b"],
    });
  });

  it("drops an empty project and empty tags", () => {
    expect(labelFromDraft({ project: "  ", title: "t", tags: ", ,x," })).toEqual({
      project: null,
      title: "t",
      tags: ["x"],
    });
  });

  it("de-duplicates tags case-insensitively, keeping the first spelling", () => {
    expect(parseTags("Sync,sync,SYNC,other")).toEqual(["Sync", "other"]);
  });

  it("returns null when every field is blank", () => {
    expect(labelFromDraft({ project: "", title: "  ", tags: " , " })).toBeNull();
    expect(labelFromDraft({ project: "P", title: "", tags: "" })).not.toBeNull();
    expect(labelFromDraft({ project: "", title: "", tags: "x" })).not.toBeNull();
  });

  it("round-trips through a draft", () => {
    const label = { project: "CORE", title: "x", tags: ["a", "b"] };
    expect(labelFromDraft(draftFrom(label))).toEqual(label);
    expect(draftFrom(null)).toEqual({ project: "", title: "", tags: "" });
  });
});

describe("sameLabel / labelLine", () => {
  it("compares structurally", () => {
    const a = { project: "P", title: "t", tags: ["x"] };
    expect(sameLabel(a, { ...a, tags: ["x"] })).toBe(true);
    expect(sameLabel(a, { ...a, tags: ["y"] })).toBe(false);
    expect(sameLabel(a, null)).toBe(false);
    expect(sameLabel(null, null)).toBe(true);
  });

  it("renders the present parts joined by dots", () => {
    expect(labelLine({ project: "CORE", title: "discuss Q3 strategy", tags: ["sync", "x"] })).toBe(
      "CORE · discuss Q3 strategy · sync, x",
    );
    expect(labelLine({ project: null, title: "solo", tags: [] })).toBe("solo");
  });
});
