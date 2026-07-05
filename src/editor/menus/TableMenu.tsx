import { BubbleMenu } from "@tiptap/react";
import type { Editor } from "@tiptap/react";

interface Props {
  editor: Editor;
}

/**
 * Structural controls for tables — add/remove row & column, delete table.
 * Appears (like the inline mark bubble menu) only when the caret is inside a
 * table, and vanishes when it leaves: zero standing chrome, appear-on-demand
 * (visual_style #1). Shares the `.bubble-menu` pill so it reads as the same
 * product surface as the formatting bubble menu. See
 * docs/projects/table_editing_controls.md (Option A).
 */
export function TableMenu({ editor }: Props) {
  /** Rows and columns of the table the caret currently sits in, or null. */
  function tableDims(): { rows: number; cols: number } | null {
    const { $from } = editor.state.selection;
    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d);
      if (node.type.name === "table") {
        const rows = node.childCount;
        const cols = node.firstChild ? node.firstChild.childCount : 0;
        return { rows, cols };
      }
    }
    return null;
  }

  function shouldShow(): boolean {
    // Show only for a bare caret inside a table. A text selection inside a cell
    // surfaces the inline marks menu instead (formatting cell text is valid).
    return editor.isActive("table") && editor.state.selection.empty;
  }

  /** Delete the current row, or the whole table if it was the last row. */
  function deleteRow() {
    const dims = tableDims();
    if (dims && dims.rows <= 1) editor.chain().focus().deleteTable().run();
    else editor.chain().focus().deleteRow().run();
  }

  /** Delete the current column, or the whole table if it was the last column. */
  function deleteColumn() {
    const dims = tableDims();
    if (dims && dims.cols <= 1) editor.chain().focus().deleteTable().run();
    else editor.chain().focus().deleteColumn().run();
  }

  const press = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    fn();
  };

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="tableMenu"
      tippyOptions={{ duration: 120, placement: "top" }}
      shouldShow={shouldShow}
    >
      <div data-testid="table-menu" className="bubble-menu">
        <button
          data-testid="table-add-row"
          className="table-menu-btn"
          aria-label="Add row below"
          onMouseDown={press(() => editor.chain().focus().addRowAfter().run())}
        >
          + Row
        </button>
        <button
          data-testid="table-del-row"
          className="table-menu-btn"
          aria-label="Delete row"
          onMouseDown={press(deleteRow)}
        >
          − Row
        </button>
        <button
          data-testid="table-add-col"
          className="table-menu-btn"
          aria-label="Add column right"
          onMouseDown={press(() => editor.chain().focus().addColumnAfter().run())}
        >
          + Col
        </button>
        <button
          data-testid="table-del-col"
          className="table-menu-btn"
          aria-label="Delete column"
          onMouseDown={press(deleteColumn)}
        >
          − Col
        </button>
        <div className="bubble-divider" />
        <button
          data-testid="table-delete"
          className="table-menu-btn table-menu-btn--danger"
          aria-label="Delete table"
          onMouseDown={press(() => editor.chain().focus().deleteTable().run())}
        >
          Delete table
        </button>
      </div>
    </BubbleMenu>
  );
}
