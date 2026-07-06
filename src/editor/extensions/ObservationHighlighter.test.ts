/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { Editor, getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import { BlockId } from "./BlockId";
import { ObservationHighlighter, charOffsetToPmPos, reanchorOffset } from "./ObservationHighlighter";
import type { Observation } from "../../store/db";

const schema = getSchema([StarterKit, BlockId, Table, TableRow, TableHeader, TableCell]);

const para = (id: string, text: string) =>
  schema.node("paragraph", { blockId: id }, text ? schema.text(text) : undefined);

const bullets = (id: string, items: string[]) =>
  schema.node(
    "bulletList",
    { blockId: id },
    items.map((t) => schema.node("listItem", null, schema.node("paragraph", null, schema.text(t))))
  );

const table = (id: string, cells: string[]) =>
  schema.node("table", { blockId: id }, [
    schema.node(
      "tableRow",
      null,
      cells.map((t) => schema.node("tableHeader", null, schema.node("paragraph", null, schema.text(t))))
    ),
  ]);

function blockPosOf(docNode: ReturnType<typeof schema.node>, blockId: string): number {
  let found = -1;
  docNode.descendants((node, pos) => {
    if (node.attrs?.blockId === blockId) {
      found = pos;
      return false;
    }
  });
  return found;
}

describe("charOffsetToPmPos", () => {
  describe("simple paragraph — must match old flat-offset behaviour", () => {
    it("maps offset 0 to start of text", () => {
      const d = schema.node("doc", null, [para("p", "Hello world")]);
      const bp = blockPosOf(d, "p");
      expect(charOffsetToPmPos(d.nodeAt(bp)!, bp, 0, false)).toBe(bp + 1);
    });

    it("maps offset 5 within text", () => {
      const d = schema.node("doc", null, [para("p", "Hello world")]);
      const bp = blockPosOf(d, "p");
      expect(charOffsetToPmPos(d.nodeAt(bp)!, bp, 5, false)).toBe(bp + 1 + 5);
    });

    it("maps end offset == text length to end of text", () => {
      const d = schema.node("doc", null, [para("p", "Hello")]);
      const bp = blockPosOf(d, "p");
      expect(charOffsetToPmPos(d.nodeAt(bp)!, bp, 5, true)).toBe(bp + 1 + 5);
    });

    it("stays anchored in a paragraph that follows a table (offset mapping is block-relative)", () => {
      // A table before the paragraph shifts the paragraph's absolute position;
      // charOffsetToPmPos must map relative to the resolved block pos, so the
      // highlight lands on the intended word regardless of the preceding table.
      const d = schema.node("doc", null, [
        table("t", ["Option", "Cost"]),
        para("p", "We recommend Option A."),
      ]);
      const bp = blockPosOf(d, "p");
      // "We recommend " is 13 chars; offset 13 → start of "Option".
      const pos = charOffsetToPmPos(d.nodeAt(bp)!, bp, 13, false);
      expect(d.textBetween(pos, pos + 6)).toBe("Option");
    });
  });

  describe("bullet list with two items — the OBS-007/017 scenario", () => {
    // bulletList { listItem { para "Foo bar." } listItem { para "Zero increase" } }
    // flat textContent = "Foo bar.Zero increase"
    const s1 = "Foo bar."; // length 8 — first bullet
    const s2 = "Zero increase"; // length 13 — second bullet

    function makeDoc() {
      const d = schema.node("doc", null, [bullets("ul", [s1, s2])]);
      const bp = blockPosOf(d, "ul");
      const node = d.nodeAt(bp)!;
      return { d, bp, node };
    }

    it("maps offset 0 (start of item 1) to 'F'", () => {
      const { d, bp, node } = makeDoc();
      const pos = charOffsetToPmPos(node, bp, 0, false);
      expect(d.textBetween(pos, pos + 1)).toBe("F");
    });

    it("maps offset 7 (last char of item 1) to '.'", () => {
      const { d, bp, node } = makeDoc();
      const pos = charOffsetToPmPos(node, bp, 7, false);
      expect(d.textBetween(pos, pos + 1)).toBe(".");
    });

    it("start offset at boundary (len(s1)) resolves to first char of item 2 ('Z')", () => {
      const { d, bp, node } = makeDoc();
      const pos = charOffsetToPmPos(node, bp, s1.length, false);
      expect(d.textBetween(pos, pos + 1)).toBe("Z");
    });

    it("end offset at boundary (len(s1)) resolves to position after last char of item 1", () => {
      const { d, bp, node } = makeDoc();
      const endPos = charOffsetToPmPos(node, bp, s1.length, true);
      // Char before endPos should be '.' (last char of "Foo bar.")
      expect(d.textBetween(endPos - 1, endPos)).toBe(".");
      // endPos must be strictly less than the start of item 2
      const item2Start = charOffsetToPmPos(node, bp, s1.length, false);
      expect(endPos).toBeLessThan(item2Start);
    });

    it("highlights full item 2 with no leading period and no truncation", () => {
      const { d, bp, node } = makeDoc();
      const start = charOffsetToPmPos(node, bp, s1.length, false);
      const end = charOffsetToPmPos(node, bp, s1.length + s2.length, true);
      expect(d.textBetween(start, end)).toBe(s2);
    });

    it("highlights full item 1", () => {
      const { d, bp, node } = makeDoc();
      const start = charOffsetToPmPos(node, bp, 0, false);
      const end = charOffsetToPmPos(node, bp, s1.length, true);
      expect(d.textBetween(start, end)).toBe(s1);
    });

    it("highlights a substring within item 2", () => {
      const { d, bp, node } = makeDoc();
      // "increase" starts at offset s1.length + 5 within flat text
      const sub = "increase";
      const subOffset = (s1 + s2).indexOf(sub);
      const start = charOffsetToPmPos(node, bp, subOffset, false);
      const end = charOffsetToPmPos(node, bp, subOffset + sub.length, true);
      expect(d.textBetween(start, end)).toBe(sub);
    });
  });
});

describe("auto-close on span deletion (collapse detection)", () => {
  const activeSpanObs = (over: Partial<Observation> = {}): Observation => ({
    id: "obs-1",
    docId: "doc-1",
    type: "clarity",
    scope: "span",
    kind: "problem",
    severity: "low",
    confidence: "medium",
    priority: 0.75,
    text: "Vague phrase",
    status: "active",
    blockId: "b1",
    startOffset: 6,
    endOffset: 11,
    anchorText: "world",
    ...over,
  });

  /** Build an editor whose first paragraph carries blockId "b1". */
  function makeEditor(onObservationCollapsed: (id: string) => void) {
    return new Editor({
      extensions: [StarterKit, BlockId, ObservationHighlighter.configure({ onObservationCollapsed })],
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: { blockId: "b1" },
            content: [{ type: "text", text: "Hello world this is text" }],
          },
        ],
      },
    });
  }

  it("fires onObservationCollapsed when the highlighted span is deleted", () => {
    const onCollapsed = vi.fn();
    const editor = makeEditor(onCollapsed);
    try {
      // Register the observation → builds the decoration over "world" (chars 6–11).
      editor.view.dispatch(editor.state.tr.setMeta("setObservations", [activeSpanObs()]));
      // Setting observations must not be mistaken for a collapse.
      expect(onCollapsed).not.toHaveBeenCalled();

      // "world" sits at char offsets 6–11; in this single paragraph that maps to
      // PM positions 7–12 (paragraph opens at 0, text starts at 1).
      editor.view.dispatch(editor.state.tr.delete(7, 12));

      expect(onCollapsed).toHaveBeenCalledWith("obs-1");
    } finally {
      editor.destroy();
    }
  });

  it("does not fire while the highlighted span survives an unrelated edit", () => {
    const onCollapsed = vi.fn();
    const editor = makeEditor(onCollapsed);
    try {
      editor.view.dispatch(editor.state.tr.setMeta("setObservations", [activeSpanObs()]));
      // Delete "this " (after the span) — the "world" highlight is untouched.
      editor.view.dispatch(editor.state.tr.delete(13, 18));
      expect(onCollapsed).not.toHaveBeenCalled();
    } finally {
      editor.destroy();
    }
  });
});

describe("reanchorOffset (L5)", () => {
  it("returns the single occurrence's offsets, ignoring stale stored offsets", () => {
    const text = "AAAA the moon is here";
    // stored 0:4 points at "AAAA"; anchor "the moon" is at 5:13.
    expect(reanchorOffset(text, "the moon", 0, 4)).toEqual({ start: 5, end: 13 });
  });

  it("falls back to stored offsets when the anchor is not found", () => {
    expect(reanchorOffset("nothing here", "the moon", 3, 11)).toEqual({ start: 3, end: 11 });
  });

  it("falls back to stored offsets for empty/whitespace anchor (pre-v8 records)", () => {
    expect(reanchorOffset("some text", "", 2, 6)).toEqual({ start: 2, end: 6 });
    expect(reanchorOffset("some text", "   ", 2, 6)).toEqual({ start: 2, end: 6 });
  });

  it("re-anchors the whole-block 0:9999 sentinel to the verbatim claim clause", () => {
    // Sweep/conflict anchors store 0:9999 (claims carry text, not offsets). When
    // the claim text is a verbatim substring we now resolve it precisely instead
    // of lighting the whole block.
    expect(reanchorOffset("we ship in Q3 to all", "ship in Q3", 0, 9999)).toEqual({
      start: 3,
      end: 13,
    });
  });

  it("keeps the 0:9999 sentinel whole-block when the claim was reworded (no match)", () => {
    // LLM paraphrased the claim → not a substring → fall back to whole-block; the
    // caller clamps 9999 to the real text length.
    expect(reanchorOffset("we ship in Q3", "committed to Q3 delivery", 0, 9999)).toEqual({
      start: 0,
      end: 9999,
    });
  });

  it("picks the occurrence nearest the stored start when the anchor repeats", () => {
    // "ab" occurs at indices 0, 3, 6. Stored start 4 → nearest is the one at 3.
    const text = "ab_ab_ab__";
    expect(reanchorOffset(text, "ab", 4, 6)).toEqual({ start: 3, end: 5 });
  });
});

describe("highlight re-anchoring on rebuild (L5)", () => {
  const activeSpanObs = (over: Partial<Observation> = {}): Observation => ({
    id: "obs-1",
    docId: "doc-1",
    type: "clarity",
    scope: "span",
    kind: "problem",
    severity: "low",
    confidence: "medium",
    priority: 0.75,
    text: "Vague phrase",
    status: "active",
    blockId: "b1",
    startOffset: 0,
    endOffset: 4,
    anchorText: "the moon",
    ...over,
  });

  function makeEditor() {
    return new Editor({
      extensions: [StarterKit, BlockId, ObservationHighlighter],
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: { blockId: "b1" },
            content: [{ type: "text", text: "AAAA the moon is here" }],
          },
        ],
      },
    });
  }

  it("draws the highlight on the anchorText span, not the stale stored offsets", () => {
    const editor = makeEditor();
    try {
      // Stored offsets 0:4 point at "AAAA"; anchorText "the moon" is at 5:13.
      editor.view.dispatch(editor.state.tr.setMeta("setObservations", [activeSpanObs()]));
      const highlighted = editor.view.dom.querySelector(".obs-highlight")?.textContent;
      expect(highlighted).toBe("the moon");
    } finally {
      editor.destroy();
    }
  });
});

describe("transient highlight for downgraded 'also noticed' obs", () => {
  const obs = (): Observation => ({
    id: "obs-1",
    docId: "doc-1",
    type: "clarity",
    scope: "span",
    kind: "problem",
    severity: "low",
    confidence: "medium",
    priority: 0.75,
    text: "Vague phrase",
    status: "active",
    blockId: "b1",
    startOffset: 0,
    endOffset: 8,
    anchorText: "the moon",
  });

  function makeEditor() {
    return new Editor({
      extensions: [StarterKit, BlockId, ObservationHighlighter],
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: { blockId: "b1" },
            content: [{ type: "text", text: "the moon is here" }],
          },
        ],
      },
    });
  }

  it("renders an invisible anchor at rest, marks transiently on hover, and reverts", () => {
    const editor = makeEditor();
    try {
      // Downgraded: the surfaced set is empty, so obs-1 is not surfaced.
      editor.view.dispatch(
        editor.state.tr
          .setMeta("setObservations", [obs()])
          .setMeta("setSurfacedIds", new Set<string>())
      );
      expect(editor.view.dom.querySelector(".obs-highlight")).toBeNull();

      // Hovering its card marks the span transiently.
      editor.view.dispatch(editor.state.tr.setMeta("setHoveredObservationId", "obs-1"));
      const hovered = editor.view.dom.querySelector(".obs-highlight");
      expect(hovered).not.toBeNull();
      expect(hovered?.textContent).toBe("the moon");
      expect(hovered?.classList.contains("obs-highlight-hovered")).toBe(true);

      // Leaving reverts to the invisible anchor.
      editor.view.dispatch(editor.state.tr.setMeta("setHoveredObservationId", null));
      expect(editor.view.dom.querySelector(".obs-highlight")).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it("pulses transiently on activation (C2 click) for a downgraded obs", () => {
    const editor = makeEditor();
    try {
      editor.view.dispatch(
        editor.state.tr
          .setMeta("setObservations", [obs()])
          .setMeta("setSurfacedIds", new Set<string>())
      );
      expect(editor.view.dom.querySelector(".obs-highlight")).toBeNull();

      editor.view.dispatch(editor.state.tr.setMeta("setPulseObsId", "obs-1"));
      const pulsed = editor.view.dom.querySelector(".obs-highlight");
      expect(pulsed).not.toBeNull();
      expect(pulsed?.classList.contains("obs-highlight-pulse")).toBe(true);

      editor.view.dispatch(editor.state.tr.setMeta("setPulseObsId", null));
      expect(editor.view.dom.querySelector(".obs-highlight")).toBeNull();
    } finally {
      editor.destroy();
    }
  });
});

describe("intra-block conflict decoration (OBS-026)", () => {
  const crossBlockObs: Observation = {
    id: "obs-cross",
    docId: "doc-1",
    type: "contradiction",
    scope: "span",
    kind: "problem",
    severity: "high",
    confidence: "high",
    priority: 0.95,
    text: "Conflict",
    status: "active",
    blockId: "b1",
    startOffset: 0,
    endOffset: 9999,
    conflictingBlockId: "b2",
    conflictingStartOffset: 0,
    conflictingEndOffset: 9999,
  };

  const sameBlockObs: Observation = {
    ...crossBlockObs,
    id: "obs-same",
    conflictingBlockId: "b1",
  };

  function makeEditor() {
    return new Editor({
      extensions: [StarterKit, BlockId, ObservationHighlighter],
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: { blockId: "b1" },
            content: [{ type: "text", text: "Paragraph 1" }],
          },
          {
            type: "paragraph",
            attrs: { blockId: "b2" },
            content: [{ type: "text", text: "Paragraph 2" }],
          },
        ],
      },
    });
  }

  it("renders two decorations for a cross-block conflict", () => {
    const editor = makeEditor();
    try {
      editor.view.dispatch(editor.state.tr.setMeta("setObservations", [crossBlockObs]));
      const decos = editor.view.dom.querySelectorAll(".obs-highlight");
      expect(decos.length).toBe(2);
    } finally {
      editor.destroy();
    }
  });

  it("renders a single decoration for a same-block conflict to prevent stacking", () => {
    const editor = makeEditor();
    try {
      editor.view.dispatch(editor.state.tr.setMeta("setObservations", [sameBlockObs]));
      const decos = editor.view.dom.querySelectorAll(".obs-highlight");
      expect(decos.length).toBe(1);
    } finally {
      editor.destroy();
    }
  });
});
