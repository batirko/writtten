import { describe, it, expect } from "vitest";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import { BlockId } from "./extensions/BlockId";
import {
  resolveSection,
  resolveSections,
  sectionOwnerMap,
  hasStructuralChange,
  changedSectionIds,
  MAX_SECTION_CHARS,
} from "./section";

const schema = getSchema([StarterKit, BlockId, Table, TableRow, TableHeader, TableCell]);

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
/** A minimal 1×2 table (header row + body row) carrying a blockId. */
const table = (id: string, cells: string[]) =>
  schema.node("table", { blockId: id }, [
    schema.node(
      "tableRow",
      null,
      cells.map((t) => schema.node("tableHeader", null, schema.node("paragraph", null, schema.text(t))))
    ),
    schema.node(
      "tableRow",
      null,
      cells.map((t) =>
        schema.node("tableCell", null, schema.node("paragraph", null, schema.text(`${t}-val`)))
      )
    ),
  ]);
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

  it("marks isHeading per member so the evaluator can spot a bodyless heading (OBS-029)", () => {
    const d = doc(heading("h", "Scope"), para("p", "We will build the alerts."));
    const [section] = resolveSections(d);

    expect(section.members).toEqual([
      { blockId: "h", text: "Scope", isHeading: true, isTable: false },
      { blockId: "p", text: "We will build the alerts.", isHeading: false, isTable: false },
    ]);
    // A trailing heading section has no non-heading member with text.
    const bodyless = doc(para("a", "Intro."), heading("h", "Open questions"));
    const trailing = resolveSections(bodyless)[1];
    expect(trailing.members.some((m) => !m.isHeading && m.text.trim().length > 0)).toBe(false);
  });

  it("keeps a table as a section member but excludes its cell text from combinedText (eval-inert)", () => {
    const d = doc(
      heading("h", "Comparison"),
      table("t", ["Option A", "Option B"]),
      para("p", "We recommend Option A for the initial launch.")
    );
    const [section] = resolveSections(d);

    // Section boundaries are intact — the table is a member, so it can't split
    // the heading from its body or get silently dropped.
    expect(section.members.map((m) => m.blockId)).toEqual(["h", "t", "p"]);
    expect(section.members.find((m) => m.blockId === "t")?.isTable).toBe(true);

    // The table's cell text ("Option A", "Option B", "…-val") never reaches the
    // LLM's view of the section; the surrounding prose does.
    expect(section.combinedText).toBe(
      "Comparison\n\nWe recommend Option A for the initial launch."
    );
    expect(section.combinedText).not.toContain("Option B");
    expect(section.combinedText).not.toContain("-val");
  });

  it("treats a heading + table-only section as bodyless (no prose body to evaluate)", () => {
    const d = doc(heading("h", "Metrics"), table("t", ["Metric", "Target"]));
    const [section] = resolveSections(d);

    // combinedText collapses to just the heading; the OBS-029 body check
    // (which also excludes tables) will see no body and skip the model.
    expect(section.combinedText).toBe("Metrics");
    expect(section.members.some((m) => !m.isHeading && !m.isTable && m.text.trim().length > 0)).toBe(
      false
    );
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

describe("structural-change detection (revert-aware eval, Mechanism 1)", () => {
  // A three-paragraph intro: all owned by "a".
  const intro = doc(para("a", "Para one."), para("b", "Para two."), para("c", "Para three."));
  // "b" toggled to a heading: it opens a new section that steals "c".
  const toggled = doc(para("a", "Para one."), heading("b", "Para two."), para("c", "Para three."));

  it("sectionOwnerMap maps every member to its owning sectionId", () => {
    const owners = sectionOwnerMap(resolveSections(intro));
    expect(owners.get("a")).toBe("a");
    expect(owners.get("b")).toBe("a");
    expect(owners.get("c")).toBe("a");
  });

  it("flags a paragraph→heading toggle as structural (a survivor changed owner)", () => {
    const before = sectionOwnerMap(resolveSections(intro));
    const after = sectionOwnerMap(resolveSections(toggled));
    expect(hasStructuralChange(before, after)).toBe(true);
    // Both the shrunk intro ("a") and the new heading section ("b") are affected.
    expect(changedSectionIds(before, after)).toEqual(new Set(["a", "b"]));
  });

  it("is symmetric: reverting the heading back is also structural", () => {
    const before = sectionOwnerMap(resolveSections(toggled));
    const after = sectionOwnerMap(resolveSections(intro));
    expect(hasStructuralChange(before, after)).toBe(true);
  });

  it("does NOT flag plain text edits within stable membership", () => {
    const edited = doc(
      para("a", "Para one, now longer."),
      para("b", "Para two."),
      para("c", "Para three, edited too.")
    );
    const before = sectionOwnerMap(resolveSections(intro));
    const after = sectionOwnerMap(resolveSections(edited));
    expect(hasStructuralChange(before, after)).toBe(false);
    expect(changedSectionIds(before, after).size).toBe(0);
  });

  it("does NOT flag an Enter-split (a new block joins the same section)", () => {
    // "c" split into "c" + new "d"; existing survivors keep their owner "a".
    const split = doc(
      para("a", "Para one."),
      para("b", "Para two."),
      para("c", "Para three,"),
      para("d", "continued.")
    );
    const before = sectionOwnerMap(resolveSections(intro));
    const after = sectionOwnerMap(resolveSections(split));
    expect(hasStructuralChange(before, after)).toBe(false);
  });

  it("does NOT flag block removal alone (no survivor changes owner)", () => {
    const removed = doc(para("a", "Para one."), para("b", "Para two."));
    const before = sectionOwnerMap(resolveSections(intro));
    const after = sectionOwnerMap(resolveSections(removed));
    expect(hasStructuralChange(before, after)).toBe(false);
  });

  it("empty→populated (first content) is not structural", () => {
    const before = new Map<string, string>();
    const after = sectionOwnerMap(resolveSections(intro));
    expect(hasStructuralChange(before, after)).toBe(false);
  });

  it("flags a mid-doc heading delete as structural (body merges up)", () => {
    // Section H with body; delete H so its body merges into the intro "a".
    const withHeading = doc(
      para("a", "Intro."),
      heading("h", "Section"),
      para("p", "Body under heading.")
    );
    const merged = doc(para("a", "Intro."), para("p", "Body under heading."));
    const before = sectionOwnerMap(resolveSections(withHeading));
    const after = sectionOwnerMap(resolveSections(merged));
    // "p" was owned by "h", now owned by "a" — a surviving block changed owner.
    expect(hasStructuralChange(before, after)).toBe(true);
    expect(changedSectionIds(before, after).has("a")).toBe(true);
  });
});
