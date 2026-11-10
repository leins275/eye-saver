import { describe, expect, it } from "vitest";
import { parseLabel } from "./label";

describe("parseLabel", () => {
  it("splits project and title", () => {
    expect(parseLabel("TBOT-testing with Artur")).toEqual({
      raw: "TBOT-testing with Artur",
      project: "TBOT",
      title: "testing with Artur",
      tags: [],
    });
  });

  it("splits project, title and comma tags", () => {
    expect(parseLabel("CORE-discuss Q3 strategy-sync,strategy")).toEqual({
      raw: "CORE-discuss Q3 strategy-sync,strategy",
      project: "CORE",
      title: "discuss Q3 strategy",
      tags: ["sync", "strategy"],
    });
  });

  it("treats a single section as a bare title", () => {
    expect(parseLabel("just a title")).toEqual({
      raw: "just a title",
      project: null,
      title: "just a title",
      tags: [],
    });
  });

  it("keeps middle sections as the title when there are four or more", () => {
    expect(parseLabel("A - B - C - D - x,y")).toEqual({
      raw: "A - B - C - D - x,y",
      project: "A",
      title: "B - C - D",
      tags: ["x", "y"],
    });
  });

  it("trims whitespace around sections and tags", () => {
    expect(parseLabel("  CORE -  review  -  a , b ,  ")).toEqual({
      raw: "CORE -  review  -  a , b ,",
      project: "CORE",
      title: "review",
      tags: ["a", "b"],
    });
  });

  it("de-duplicates tags case-insensitively, keeping the first spelling", () => {
    expect(parseLabel("P-t-Sync,sync,SYNC,other")?.tags).toEqual(["Sync", "other"]);
  });

  it("returns null for blank input", () => {
    expect(parseLabel("")).toBeNull();
    expect(parseLabel("   ")).toBeNull();
  });
});
