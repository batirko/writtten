import { describe, it, expect } from "vitest";
import { splitSections } from "./splitSections";

describe("splitSections", () => {
  it("groups each heading with the paragraphs that follow it", () => {
    const md = [
      "# Goals",
      "",
      "Ship a delightful thing.",
      "",
      "It should be fast.",
      "",
      "## Timeline",
      "",
      "We ship in Q2.",
    ].join("\n");

    const sections = splitSections(md);
    expect(sections).toHaveLength(2);
    expect(sections[0].id).toBe("s1-goals");
    expect(sections[0].text).toContain("# Goals");
    expect(sections[0].text).toContain("Ship a delightful thing.");
    expect(sections[0].text).toContain("It should be fast.");
    expect(sections[1].id).toBe("s2-timeline");
    expect(sections[1].text).toContain("We ship in Q2.");
    // Timeline content must NOT bleed into the Goals section.
    expect(sections[0].text).not.toContain("Q2");
  });

  it("puts pre-heading content into an intro section", () => {
    const md = ["A preamble before any heading.", "", "# First", "", "Body."].join("\n");
    const sections = splitSections(md);
    expect(sections[0].id).toBe("s1-intro");
    expect(sections[0].text).toBe("A preamble before any heading.");
    expect(sections[1].id).toBe("s2-first");
  });

  it("falls back to one section per block when there are no headings", () => {
    const md = ["First paragraph.", "", "Second paragraph.", "", "Third."].join("\n");
    const sections = splitSections(md);
    expect(sections).toHaveLength(3);
    expect(sections.map((s) => s.id)).toEqual(["s1-p", "s2-p", "s3-p"]);
  });

  it("gives repeated heading text distinct ids via the order prefix", () => {
    const md = ["## Notes", "", "a", "", "## Notes", "", "b"].join("\n");
    const sections = splitSections(md);
    expect(sections.map((s) => s.id)).toEqual(["s1-notes", "s2-notes"]);
  });

  it("normalises CRLF and drops blank blocks", () => {
    const md = "# H\r\n\r\nLine one.\r\n\r\n\r\nLine two.\r\n";
    const sections = splitSections(md);
    expect(sections).toHaveLength(1);
    expect(sections[0].text).toContain("Line one.");
    expect(sections[0].text).toContain("Line two.");
  });

  it("returns [] for empty/whitespace input", () => {
    expect(splitSections("")).toEqual([]);
    expect(splitSections("   \n\n  \n")).toEqual([]);
  });
});
