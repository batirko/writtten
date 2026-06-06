import type { Editor } from "@tiptap/react";

/** Markdown serialization — tiptap-markdown is already a dependency. */
export function toMarkdown(editor: Editor): string {
  return editor.storage.markdown.getMarkdown();
}

/** Full HTML for the document body (used for rich-text clipboard). */
export function toHtml(editor: Editor): string {
  return editor.getHTML();
}

/** Trigger a browser file download of a string as a named file. */
export function downloadFile(filename: string, mime: string, content: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadMarkdown(editor: Editor, filename = "document.md"): void {
  downloadFile(filename, "text/markdown", toMarkdown(editor));
}

/** Copy Markdown as plain text. */
export async function copyMarkdown(editor: Editor): Promise<void> {
  await navigator.clipboard.writeText(toMarkdown(editor));
}

/** Copy rich text: HTML + plaintext fallback, so paste targets pick the best. */
export async function copyRichText(editor: Editor): Promise<void> {
  const html = toHtml(editor);
  const md = toMarkdown(editor);
  await navigator.clipboard.write([
    new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([md], { type: "text/plain" }),
    }),
  ]);
}

/** PDF — THE SWAPPABLE SEAM. Today: browser print-to-PDF via a print
 *  stylesheet. Later: replace this function body with a pdf-lib /
 *  jsPDF generator. No caller changes — they only call exportPdf(). */
export function exportPdf(): void {
  window.print();
}
