import { describe, it, expect } from "vitest";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { BlockId } from "./BlockId";
import { charOffsetToPmPos } from "./ObservationHighlighter";

const schema = getSchema([StarterKit, BlockId]);

const para = (id: string, text: string) =>
  schema.node("paragraph", { blockId: id }, text ? schema.text(text) : undefined);

const bullets = (id: string, items: string[]) =>
  schema.node(
    "bulletList",
    { blockId: id },
    items.map((t) => schema.node("listItem", null, schema.node("paragraph", null, schema.text(t))))
  );

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
