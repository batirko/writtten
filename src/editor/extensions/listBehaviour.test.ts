/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import ListKeymap from "@tiptap/extension-list-keymap";
import { Fragment, Slice, type Node as PMNode } from "@tiptap/pm/model";
import { ListEscape } from "./ListEscape";
import { ListPaste } from "./ListPaste";

/**
 * Guards the two list-editing fixes (UX-023, UX-024). Both are keymap/paste
 * plugin behaviour, which the browser harness can't exercise: plain character
 * deletion is native editing rather than a keymap handler, and synthetic key
 * events don't reach ProseMirror for it. Driving the registered props directly
 * is the reliable way to pin these.
 */

function makeEditor(html: string) {
  return new Editor({
    extensions: [StarterKit, ListKeymap, ListEscape, ListPaste],
    content: html,
  });
}

/** Runs the registered keydown handlers in priority order, as the browser would. */
function pressBackspace(editor: Editor): boolean {
  const event = new KeyboardEvent("keydown", { key: "Backspace", code: "Backspace" });
  Object.defineProperty(event, "keyCode", { get: () => 8 });
  return editor.view.someProp("handleKeyDown", (f) => f(editor.view, event)) ?? false;
}

/** Start of the last list item's first paragraph. */
function cursorInLastListItem(editor: Editor): number {
  let itemPos = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "listItem") itemPos = pos;
  });
  return itemPos + 2;
}

/** Start of the first list item's first paragraph. */
function cursorInFirstListItem(editor: Editor): number {
  let itemPos = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "listItem" && itemPos === -1) itemPos = pos;
  });
  return itemPos + 2;
}

function html(editor: Editor): string {
  return editor.getHTML().replace(/ data-[a-z-]+="[^"]*"/g, "");
}

/**
 * Asserts ListEscape stays out of the way at `cursor`: Backspace must leave the
 * document in exactly the state it reaches without the extension registered.
 * Comparing against a ListEscape-free editor is the honest way to say "declines"
 * — asserting on the resulting HTML alone would really be testing ListKeymap and
 * the base keymap, whose behaviour here is pre-existing and not ours to pin.
 */
function expectUnchangedByListEscape(content: string, cursor: (editor: Editor) => number) {
  const withEscape = new Editor({
    extensions: [StarterKit, ListKeymap, ListEscape, ListPaste],
    content,
  });
  const without = new Editor({ extensions: [StarterKit, ListKeymap], content });

  withEscape.commands.setTextSelection(cursor(withEscape));
  without.commands.setTextSelection(cursor(without));
  pressBackspace(withEscape);
  pressBackspace(without);

  expect(html(withEscape)).toBe(html(without));
  withEscape.destroy();
  without.destroy();
}

describe("ListEscape — Backspace leaves the list (UX-024)", () => {
  it("lifts an empty top-level item out into a paragraph", () => {
    const editor = makeEditor(
      "<ul><li><p>one</p></li><li><p>two</p></li><li><p></p></li></ul>"
    );
    editor.commands.setTextSelection(cursorInLastListItem(editor));

    expect(pressBackspace(editor)).toBe(true);
    expect(html(editor)).toBe("<ul><li><p>one</p></li><li><p>two</p></li></ul><p></p>");
    editor.destroy();
  });

  it("outdents a nested empty item one level instead of leaving the list", () => {
    const editor = makeEditor(
      "<ul><li><p>parent</p><ul><li><p></p></li></ul></li></ul>"
    );
    editor.commands.setTextSelection(cursorInLastListItem(editor));

    expect(pressBackspace(editor)).toBe(true);
    expect(html(editor)).toBe("<ul><li><p>parent</p></li><li><p></p></li></ul>");
    editor.destroy();
  });

  it("unlists an item that still has text, rather than appending it to the previous bullet", () => {
    const editor = makeEditor("<ul><li><p>one</p></li><li><p>two</p></li></ul>");
    editor.commands.setTextSelection(cursorInLastListItem(editor)); // start of "two"

    expect(pressBackspace(editor)).toBe(true);
    // "two" keeps its own block and its text; "one" is untouched.
    expect(html(editor)).toBe("<ul><li><p>one</p></li></ul><p>two</p>");
    editor.destroy();
  });

  it("unlists the first item into a paragraph before the list", () => {
    const editor = makeEditor("<ul><li><p>one</p></li><li><p>two</p></li></ul>");
    editor.commands.setTextSelection(cursorInFirstListItem(editor)); // start of "one"

    expect(pressBackspace(editor)).toBe(true);
    expect(html(editor)).toBe("<p>one</p><ul><li><p>two</p></li></ul>");
    editor.destroy();
  });

  it("declines mid-text, leaving Backspace exactly as it was", () => {
    expectUnchangedByListEscape("<ul><li><p>one</p></li><li><p>two</p></li></ul>", (editor) =>
      cursorInLastListItem(editor) + 3 // end of "two"
    );
  });

  it("declines in a later block of a multi-block item", () => {
    expectUnchangedByListEscape("<ul><li><p>one</p><p>second block</p></li></ul>", (editor) => {
      let itemPos = -1;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "listItem") itemPos = pos;
      });
      // start of the item's *second* block — not the item's start, so not ours
      return itemPos + 1 + editor.state.doc.nodeAt(itemPos + 1)!.nodeSize + 1;
    });
  });

  it("ignores an empty paragraph outside any list", () => {
    const editor = makeEditor("<p>alpha</p><p></p>");
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);

    // Our handler declines, so the default joinBackward merges the two
    // paragraphs rather than anything list-shaped happening.
    pressBackspace(editor);
    expect(html(editor)).toBe("<p>alpha</p>");
    editor.destroy();
  });
});

describe("ListPaste — multi-line paste splits into items (UX-023)", () => {
  function paste(editor: Editor, nodes: PMNode[]): Slice {
    const slice = new Slice(Fragment.from(nodes), 0, 0);
    return editor.view.someProp("transformPasted", (f) => f(slice, editor.view, false)) ?? slice;
  }

  function paragraphs(editor: Editor, texts: string[]): PMNode[] {
    const { paragraph } = editor.state.schema.nodes;
    return texts.map((t) => paragraph.create(null, editor.state.schema.text(t)));
  }

  it("rewraps a run of pasted paragraphs as sibling list items", () => {
    const editor = makeEditor("<ul><li><p>alpha</p></li></ul>");
    editor.commands.setTextSelection(cursorInLastListItem(editor));

    const out = paste(editor, paragraphs(editor, ["beta", "gamma", "delta"]));

    expect(out.content.childCount).toBe(3);
    for (let i = 0; i < out.content.childCount; i++) {
      expect(out.content.child(i).type.name).toBe("listItem");
    }
    expect(out.openStart).toBe(2);
    expect(out.openEnd).toBe(2);
    editor.destroy();
  });

  it("leaves a single pasted paragraph untouched", () => {
    const editor = makeEditor("<ul><li><p>alpha</p></li></ul>");
    editor.commands.setTextSelection(cursorInLastListItem(editor));

    const out = paste(editor, paragraphs(editor, ["beta"]));

    expect(out.content.child(0).type.name).toBe("paragraph");
    editor.destroy();
  });

  it("leaves mixed content untouched so richer pastes degrade predictably", () => {
    const editor = makeEditor("<ul><li><p>alpha</p></li></ul>");
    editor.commands.setTextSelection(cursorInLastListItem(editor));

    const { heading, paragraph } = editor.state.schema.nodes;
    const nodes = [
      paragraph.create(null, editor.state.schema.text("beta")),
      heading.create({ level: 2 }, editor.state.schema.text("gamma")),
    ];
    const out = paste(editor, nodes);

    expect(out.content.child(0).type.name).toBe("paragraph");
    expect(out.content.child(1).type.name).toBe("heading");
    editor.destroy();
  });

  it("does not touch a paste outside a list", () => {
    const editor = makeEditor("<p>alpha</p>");
    editor.commands.setTextSelection(3);

    const out = paste(editor, paragraphs(editor, ["beta", "gamma"]));

    expect(out.content.child(0).type.name).toBe("paragraph");
    editor.destroy();
  });
});
