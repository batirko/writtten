/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { Editor, getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import { BlockId } from "./BlockId";
import {
  ObservationHighlighter,
  charOffsetToPmPos,
  reanchorOffset,
  computeObservationRanges,
  resolveCoveringSet,
  type ObservationRange,
} from "./ObservationHighlighter";
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

  it("suppresses (null) a real exact anchor whose text was edited away", () => {
    // Stored 3:11 is a real span, not the whole-block sentinel. "the moon" is
    // gone, so painting 3:11 would light unrelated current words — return null.
    expect(reanchorOffset("nothing here", "the moon", 3, 11)).toBeNull();
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

  it("tolerates trailing punctuation the extractor appended to a mid-sentence clause", () => {
    // anchorClaimsToMembers anchors "We ship in Q3." via its punctuation-strip
    // fallback, storing the STRIPPED offsets (0:13) but the UNSTRIPPED claim as
    // anchorText. Without a matching strip here the real (non-sentinel) span
    // would resolve to null — suppressing the highlight and killing card-click.
    // The resolved end uses the stripped length (13), not the anchorText length.
    expect(reanchorOffset("We ship in Q3, giving the team room.", "We ship in Q3.", 0, 13)).toEqual(
      { start: 0, end: 13 }
    );
  });

  it("still suppresses a vanished anchor even after stripping trailing punctuation", () => {
    // Stripping "gone." → "gone" still finds nothing, and 3:7 is a real span
    // (not the whole-block sentinel), so the stale span is correctly suppressed.
    expect(reanchorOffset("nothing here at all", "gone.", 3, 7)).toBeNull();
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

  it("paints no highlight when the exact anchor text has been edited away", () => {
    // Reproduces the stale cross-claim mismatch: the block text ("AAAA the moon
    // is here") no longer contains the anchor "vanished clause", so the stored
    // offsets (which now cover unrelated same-length words) must NOT be painted.
    const editor = makeEditor();
    try {
      editor.view.dispatch(
        editor.state.tr.setMeta("setObservations", [
          activeSpanObs({ anchorText: "vanished clause", startOffset: 5, endOffset: 20 }),
        ])
      );
      expect(editor.view.dom.querySelector(".obs-highlight")).toBeNull();
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

describe("computeObservationRanges (C9 hit-testing)", () => {
  const spanObs = (id: string, anchorText: string, over: Partial<Observation> = {}): Observation => ({
    id,
    docId: "doc-1",
    type: "clarity",
    scope: "span",
    kind: "problem",
    severity: "low",
    confidence: "medium",
    priority: 0.5,
    text: "note",
    status: "active",
    blockId: "b1",
    startOffset: 0,
    endOffset: 0,
    anchorText,
    ...over,
  });

  // "Hello world this is text" — "world" at 6:11, "world this is" at 6:19.
  const doc = () =>
    schema.node("doc", null, [para("b1", "Hello world this is text"), para("b2", "Second block")]);

  it("maps each active span obs to a from<to range regardless of visibility", () => {
    const ranges = computeObservationRanges(doc(), [
      spanObs("broad", "world this is"),
      spanObs("narrow", "world"),
    ]);
    expect(ranges).toHaveLength(2);
    for (const r of ranges) expect(r.from).toBeLessThan(r.to);
    const narrow = ranges.find((r) => r.obs.id === "narrow")!;
    const broad = ranges.find((r) => r.obs.id === "broad")!;
    // The nested substring resolves to a strictly smaller range.
    expect(narrow.to - narrow.from).toBeLessThan(broad.to - broad.from);
  });

  it("yields two ranges (primary + conflicting) for a cross-block conflict", () => {
    const cross = spanObs("x", "", {
      type: "contradiction",
      startOffset: 0,
      endOffset: 9999,
      conflictingBlockId: "b2",
      conflictingStartOffset: 0,
      conflictingEndOffset: 9999,
    });
    expect(computeObservationRanges(doc(), [cross])).toHaveLength(2);
  });

  /**
   * UX-037. A contradiction between two passages of ONE paragraph is a real and
   * common shape — a bullet asserting two incompatible things — and it used to
   * render one highlight for a card whose text named two passages, because the
   * guard keyed on same-block rather than on same-span.
   */
  it("draws both sides of a same-block conflict when the spans differ", () => {
    const text = doc().firstChild!.textContent;
    const a = text.slice(0, 6);
    const b = text.slice(text.length - 6);
    const same = spanObs("x", "", {
      type: "contradiction",
      anchorText: a,
      startOffset: 0,
      endOffset: 6,
      conflictingBlockId: "b1",
      conflictingAnchorText: b,
      conflictingStartOffset: text.length - 6,
      conflictingEndOffset: text.length,
    });
    const ranges = computeObservationRanges(doc(), [same]);
    expect(ranges).toHaveLength(2);
    expect(ranges.map((r) => r.side).sort()).toEqual(["conflicting", "primary"]);
    // Two distinct ranges, not one drawn twice.
    expect(ranges[0].from).not.toBe(ranges[1].from);
  });

  /**
   * The degenerate case the old same-block guard was really protecting against,
   * and it is reachable without an agent: evaluator-owned conflicts commonly
   * carry the 0:9999 whole-block sentinel on BOTH sides, so two claims drawn
   * from one paragraph resolve to identical ranges. One span, one decoration.
   */
  it("drops a conflicting side that resolves to the primary's own range", () => {
    const same = spanObs("x", "", {
      type: "contradiction",
      startOffset: 0,
      endOffset: 9999,
      conflictingBlockId: "b1",
      conflictingStartOffset: 0,
      conflictingEndOffset: 9999,
    });
    expect(computeObservationRanges(doc(), [same])).toHaveLength(1);
  });

  it("skips observations whose block is absent from the doc", () => {
    const ghost = spanObs("g", "world", { blockId: "missing" });
    expect(computeObservationRanges(doc(), [ghost])).toHaveLength(0);
  });
});

describe("resolveCoveringSet (C9 primary selection)", () => {
  const range = (id: string, from: number, to: number): ObservationRange => ({
    obs: { id } as Observation,
    from,
    to,
    side: "primary",
  });

  it("picks the smallest covering range as primary, rest co-cover (nested)", () => {
    const ranges = [range("outer", 1, 20), range("inner", 5, 10)];
    const res = resolveCoveringSet(ranges, 7, null);
    expect(res).toEqual({ primaryId: "inner", related: ["inner", "outer"] });
  });

  it("returns every co-located card when several ranges coincide", () => {
    const ranges = [range("a", 1, 10), range("b", 1, 10), range("c", 1, 10)];
    const res = resolveCoveringSet(ranges, 5, null);
    expect(res?.primaryId).toBe("a");
    expect(new Set(res?.related)).toEqual(new Set(["a", "b", "c"]));
  });

  it("returns null when nothing covers the point", () => {
    expect(resolveCoveringSet([range("a", 1, 5)], 9, null)).toBeNull();
  });

  it("targets a downgraded (invisible) substring when it nests inside a visible span", () => {
    // 'inner' is not surfaced (invisible), 'outer' is — the point is over both,
    // so the covering set is visible and the innermost still wins as primary.
    const ranges = [range("outer", 1, 20), range("inner", 5, 10)];
    const res = resolveCoveringSet(ranges, 7, new Set(["outer"]));
    expect(res).toEqual({ primaryId: "inner", related: ["inner", "outer"] });
  });

  it("stays inert over plain text covered only by downgraded (invisible) anchors", () => {
    const ranges = [range("hidden", 1, 20)];
    expect(resolveCoveringSet(ranges, 7, new Set<string>())).toBeNull();
  });
});
