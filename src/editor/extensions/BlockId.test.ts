import { describe, it, expect } from "vitest";
import { getSchema } from "@tiptap/core";
import { EditorState } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { BlockId, assignBlockIds } from "./BlockId";

// Headless ProseMirror schema built from the same extensions the editor uses.
// No DOM needed: getSchema / EditorState / transactions all run in node.
const schema = getSchema([StarterKit, BlockId]);

/** Apply assignBlockIds to a doc and return the resulting top-level block ids. */
function idsAfterPass(doc: ReturnType<typeof schema.node>): {
  ids: (string | null)[];
  modified: boolean;
} {
  const state = EditorState.create({ schema, doc });
  const tr = state.tr;
  const modified = assignBlockIds(state.doc, tr);
  const newDoc = state.apply(tr).doc;
  const ids: (string | null)[] = [];
  newDoc.forEach((node) => ids.push(node.attrs.blockId as string | null));
  return { ids, modified };
}

describe("assignBlockIds", () => {
  it("reissues a fresh id for a paragraph that duplicates an earlier block's id (Enter-split bug)", () => {
    // Mimics ProseMirror copying attrs (incl. blockId) into the split-off paragraph.
    const doc = schema.node("doc", null, [
      schema.node("paragraph", { blockId: "dup" }, schema.text("This will ship in Q3.")),
      schema.node("paragraph", { blockId: "dup" }, schema.text("We'll launch this in Q2.")),
    ]);

    const { ids, modified } = idsAfterPass(doc);

    expect(modified).toBe(true);
    expect(ids[0]).toBe("dup"); // first occurrence keeps the id
    expect(ids[1]).not.toBe("dup"); // duplicate gets a new one
    expect(ids[1]).toBeTruthy();
    expect(new Set(ids).size).toBe(2); // both blocks now uniquely identified
  });

  it("assigns ids to blocks that have none", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, schema.text("First paragraph here.")),
      schema.node("paragraph", null, schema.text("Second paragraph here.")),
    ]);

    const { ids, modified } = idsAfterPass(doc);

    expect(modified).toBe(true);
    expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(2);
  });

  it("leaves already-unique ids untouched (no transaction)", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", { blockId: "aaaaaaaaaa" }, schema.text("First paragraph here.")),
      schema.node("paragraph", { blockId: "bbbbbbbbbb" }, schema.text("Second paragraph here.")),
    ]);

    const { ids, modified } = idsAfterPass(doc);

    expect(modified).toBe(false);
    expect(ids).toEqual(["aaaaaaaaaa", "bbbbbbbbbb"]);
  });
});
