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

/** Position of the text cursor inside the last list item's paragraph. */
function cursorInLastListItem(editor: Editor): number {
  let itemPos = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "listItem") itemPos = pos;
  });
  return itemPos + 2;
}

function html(editor: Editor): string {
  return editor.getHTML().replace(/ data-[a-z-]+="[^"]*"/g, "");
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

  it("leaves a non-empty item alone — no lift out of the list", () => {
    const editor = makeEditor("<ul><li><p>one</p></li><li><p>two</p></li></ul>");
    editor.commands.setTextSelection(cursorInLastListItem(editor) + 3); // end of "two"

    pressBackspace(editor);
    // Still a two-item list; the item was not lifted into a paragraph.
    expect(html(editor)).toContain("<li><p>two</p></li>");
    expect(html(editor)).not.toContain("</ul><p>two</p>");
    editor.destroy();
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
