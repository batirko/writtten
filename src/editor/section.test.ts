import { describe, it, expect } from "vitest";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { BlockId } from "./extensions/BlockId";
import { resolveSection, resolveSections, MAX_SECTION_CHARS } from "./section";

const schema = getSchema([StarterKit, BlockId]);

const para = (id: string, text: string) =>
  schema.node("paragraph", { blockId: id }, text ? schema.text(text) : undefined);
const heading = (id: string, text: string) =>
  schema.node("heading", { blockId: id, level: 2 }, schema.text(text));
const bullets = (id: string, items: string[]) =>
  schema.node(
    "bulletList",
    { blockId: id },
    items.map((t) => schema.node("listItem", null, schema.node("paragraph", null, schema.text(t))))
  );
const doc = (...nodes: ReturnType<typeof schema.node>[]) => schema.node("doc", null, nodes);

describe("resolveSections", () => {
  it("treats an intro (no heading) as one section keyed by the first block id", () => {
    const d = doc(para("a", "Intro paragraph one."), para("b", "Intro paragraph two."));
    const sections = resolveSections(d);

    expect(sections).toHaveLength(1);
    expect(sections[0].sectionId).toBe("a");
    expect(sections[0].headingText).toBe("");
    expect(sections[0].members.map((m) => m.blockId)).toEqual(["a", "b"]);
    expect(sections[0].combinedText).toBe("Intro paragraph one.\n\nIntro paragraph two.");
  });

  it("groups a heading with its following body, keyed by the heading id", () => {
    const d = doc(heading("h", "Scope — what's in"), para("p", "We will build the alerts."));
    const sections = resolveSections(d);

    expect(sections).toHaveLength(1);
    expect(sections[0].sectionId).toBe("h");
    expect(sections[0].headingText).toBe("Scope — what's in");
    expect(sections[0].members.map((m) => m.blockId)).toEqual(["h", "p"]);
    // Heading text is always present in the combined view — "section is empty"
    // becomes structurally impossible.
    expect(sections[0].combinedText).toBe("Scope — what's in\n\nWe will build the alerts.");
  });

  it("includes multi-paragraph + bullet-list bodies in one section", () => {
    const d = doc(
      heading("h", "Background"),
      para("p1", "First para of background."),
      bullets("ul", ["Bullet one", "Bullet two"])
    );
    const sections = resolveSections(d);

    expect(sections).toHaveLength(1);
    expect(sections[0].members.map((m) => m.blockId)).toEqual(["h", "p1", "ul"]);
    expect(sections[0].combinedText).toContain("Background");
    expect(sections[0].combinedText).toContain("First para of background.");
    expect(sections[0].combinedText).toContain("Bullet one");
  });

  it("opens a new section at every heading (consecutive headings are flat)", () => {
    const d = doc(
      heading("h1", "Goal"),
      heading("h2", "Success metrics"),
      para("p", "Three metrics here.")
    );
    const sections = resolveSections(d);

    expect(sections.map((s) => s.sectionId)).toEqual(["h1", "h2"]);
    expect(sections[0].members.map((m) => m.blockId)).toEqual(["h1"]);
    expect(sections[1].members.map((m) => m.blockId)).toEqual(["h2", "p"]);
  });

  it("handles a trailing heading with no body", () => {
    const d = doc(para("a", "Intro."), heading("h", "Open questions"));
    const sections = resolveSections(d);

    expect(sections).toHaveLength(2);
    expect(sections[1].sectionId).toBe("h");
    expect(sections[1].members.map((m) => m.blockId)).toEqual(["h"]);
    expect(sections[1].combinedText).toBe("Open questions");
  });

  it("truncates combined text beyond MAX_SECTION_CHARS", () => {
    const huge = "x".repeat(MAX_SECTION_CHARS + 500);
    const d = doc(heading("h", "Big"), para("p", huge));
    const sections = resolveSections(d);

    expect(sections[0].combinedText.length).toBe(MAX_SECTION_CHARS);
  });
});

describe("resolveSection", () => {
  it("resolves the owning section from any member block id", () => {
    const d = doc(heading("h", "Background"), para("p1", "Body one."), para("p2", "Body two."));

    expect(resolveSection(d, "h")?.sectionId).toBe("h");
    expect(resolveSection(d, "p1")?.sectionId).toBe("h");
    expect(resolveSection(d, "p2")?.sectionId).toBe("h");
  });

  it("returns null for an unknown block id", () => {
    const d = doc(para("a", "Only paragraph."));
    expect(resolveSection(d, "missing")).toBeNull();
  });
});
