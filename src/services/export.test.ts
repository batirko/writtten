/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  toMarkdown,
  toHtml,
  downloadFile,
  downloadMarkdown,
  copyMarkdown,
  copyRichText,
  exportPdf,
} from "./export";
import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Heading from "@tiptap/extension-heading";
import BulletList from "@tiptap/extension-bullet-list";
import ListItem from "@tiptap/extension-list-item";
import { Markdown } from "tiptap-markdown";
import Link from "@tiptap/extension-link";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";

describe("export service", () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({
      extensions: [Document, Paragraph, Text, Heading, BulletList, ListItem, Markdown],
      content: {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Heading" }] },
          { type: "paragraph", content: [{ type: "text", text: "This is a paragraph." }] },
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Bullet 1" }] }],
              },
              {
                type: "listItem",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Bullet 2" }] }],
              },
            ],
          },
        ],
      },
    });
  });

  afterEach(() => {
    editor.destroy();
    vi.restoreAllMocks();
  });

  it("toMarkdown converts editor content to markdown", () => {
    const md = toMarkdown(editor as any);
    expect(md).toContain("## Heading");
    expect(md).toContain("This is a paragraph.");
    expect(md).toContain("- Bullet 1");
    expect(md).toContain("- Bullet 2");
  });

  it("toMarkdown round-trips links as [text](url)", () => {
    const linkEditor = new Editor({
      extensions: [
        Document,
        Paragraph,
        Text,
        Link.configure({ openOnClick: false, autolink: false }),
        Markdown,
      ],
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Click here",
                marks: [{ type: "link", attrs: { href: "https://example.com" } }],
              },
            ],
          },
        ],
      },
    });
    const md = toMarkdown(linkEditor as any);
    expect(md).toContain("[Click here](https://example.com)");
    linkEditor.destroy();
  });

  it("serializes a table to GFM markdown (round-trip)", () => {
    const tableEditor = new Editor({
      extensions: [Document, Paragraph, Text, Table, TableRow, TableHeader, TableCell, Markdown],
      content: {
        type: "doc",
        content: [
          {
            type: "table",
            content: [
              {
                type: "tableRow",
                content: [
                  {
                    type: "tableHeader",
                    content: [{ type: "paragraph", content: [{ type: "text", text: "Option" }] }],
                  },
                  {
                    type: "tableHeader",
                    content: [{ type: "paragraph", content: [{ type: "text", text: "Cost" }] }],
                  },
                ],
              },
              {
                type: "tableRow",
                content: [
                  {
                    type: "tableCell",
                    content: [{ type: "paragraph", content: [{ type: "text", text: "A" }] }],
                  },
                  {
                    type: "tableCell",
                    content: [{ type: "paragraph", content: [{ type: "text", text: "Low" }] }],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    const md = toMarkdown(tableEditor as any);
    // GFM pipe-table syntax: a header row, a delimiter row, and the body row.
    expect(md).toContain("| Option | Cost |");
    expect(md).toMatch(/\| ?-+ ?\| ?-+ ?\|/);
    expect(md).toContain("| A | Low |");
    tableEditor.destroy();
  });

  it("toHtml converts editor content to html", () => {
    const html = toHtml(editor as any);
    expect(html).toContain("<h2>Heading</h2>");
    expect(html).toContain("<p>This is a paragraph.</p>");
    expect(html).toContain("<li><p>Bullet 1</p></li>");
  });

  it("downloadFile creates anchor and clicks it", () => {
    const createElementSpy = vi.spyOn(document, "createElement");
    const createObjectURLSpy = vi.fn().mockReturnValue("blob:url");
    const revokeObjectURLSpy = vi.fn();

    global.URL.createObjectURL = createObjectURLSpy;
    global.URL.revokeObjectURL = revokeObjectURLSpy;

    const mockAnchor = { href: "", download: "", click: vi.fn() };
    createElementSpy.mockReturnValue(mockAnchor as any);

    downloadFile("test.txt", "text/plain", "hello");

    expect(createElementSpy).toHaveBeenCalledWith("a");
    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(mockAnchor.href).toBe("blob:url");
    expect(mockAnchor.download).toBe("test.txt");
    expect(mockAnchor.click).toHaveBeenCalled();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:url");
  });

  it("downloadMarkdown constructs correct file", () => {
    const createObjectURLSpy = vi.fn().mockReturnValue("blob:url");
    const revokeObjectURLSpy = vi.fn();
    global.URL.createObjectURL = createObjectURLSpy;
    global.URL.revokeObjectURL = revokeObjectURLSpy;
    const createElementSpy = vi.spyOn(document, "createElement");
    const mockAnchor = { href: "", download: "", click: vi.fn() };
    createElementSpy.mockReturnValue(mockAnchor as any);

    downloadMarkdown(editor as any, "test.md");
    expect(mockAnchor.download).toBe("test.md");
  });

  it("copyMarkdown writes text to clipboard", async () => {
    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextSpy },
    });

    await copyMarkdown(editor as any);
    expect(writeTextSpy).toHaveBeenCalled();
    const callArg = writeTextSpy.mock.calls[0][0];
    expect(callArg).toContain("## Heading");
  });

  it("copyRichText writes ClipboardItems", async () => {
    const writeSpy = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { write: writeSpy },
    });

    const mockClipboardItem = vi.fn();
    global.ClipboardItem = mockClipboardItem as any;

    await copyRichText(editor as any);

    expect(writeSpy).toHaveBeenCalled();
    expect(mockClipboardItem).toHaveBeenCalled();
    const arg = mockClipboardItem.mock.calls[0][0];
    expect(arg["text/html"]).toBeInstanceOf(Blob);
    expect(arg["text/plain"]).toBeInstanceOf(Blob);
  });

  it("exportPdf calls window.print", () => {
    const printSpy = vi.fn();
    Object.assign(window, { print: printSpy });
    exportPdf();
    expect(printSpy).toHaveBeenCalled();
  });
});
