import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export const SemanticPaste = Extension.create({
  name: "semanticPaste",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("semanticPaste"),
        props: {
          transformPastedHTML(html: string): string {
            try {
              const parser = new DOMParser();
              const doc = parser.parseFromString(html, "text/html");
              let modified = false;

              // Find elements that look like faux-headings.
              // When copying from Google Docs or Word, headings often arrive as
              // <p><span><b>Heading</b></span></p> or <p><strong>Heading</strong></p>.
              const blocks = doc.querySelectorAll("p, div, span, b, strong");
              blocks.forEach((block) => {
                // If it's already a heading or inside a heading, skip.
                if (block.closest("h1, h2, h3, h4, h5, h6")) return;

                const textContent = block.textContent?.trim() || "";
                if (!textContent || textContent.length > 150) return;

                // Check if this element effectively represents a bold block of text.
                // It must be the only text content in its line/block context.
                let isFauxHeading = false;

                if (block.tagName === "B" || block.tagName === "STRONG") {
                  isFauxHeading = true;
                } else if (block.tagName === "SPAN") {
                  const style = block.getAttribute("style") || "";
                  if (style.includes("font-weight: 700") || style.includes("font-weight: bold")) {
                    isFauxHeading = true;
                  }
                }

                if (isFauxHeading) {
                  // Make sure this bold element constitutes the entirety of its parent block.
                  // E.g., we don't want to convert a bold word in the middle of a paragraph.
                  const parentBlock = block.closest("p, div");
                  if (parentBlock && parentBlock.textContent?.trim() === textContent) {
                    const heading = doc.createElement("h3");
                    heading.innerHTML = parentBlock.innerHTML;
                    parentBlock.replaceWith(heading);
                    modified = true;
                  }
                }
              });

              // Predictable degradation for unsupported content — never let a
              // paste silently lose material (canvas_content_types.md §
              // Degradation contract). Tables and links are real nodes now; the
              // common remaining silent-loss case is images, which the schema
              // has no node for and which ProseMirror would drop outright.
              // Rewrite each <img> into visible, editable Markdown text so the
              // reference survives and the user can act on it. No bytes are
              // stored (invariant 5) — a data: URI is collapsed to a short
              // marker rather than dumping base64 into the doc.
              const imgs = doc.querySelectorAll("img");
              imgs.forEach((img) => {
                const alt = img.getAttribute("alt")?.trim() || "";
                const rawSrc = img.getAttribute("src")?.trim() || "";
                const src = rawSrc.startsWith("data:") ? "embedded-image" : rawSrc;
                const marker = doc.createTextNode(`![${alt}](${src})`);
                img.replaceWith(marker);
                modified = true;
              });

              if (modified) {
                return doc.body.innerHTML;
              }
            } catch (e) {
              console.warn("SemanticPaste error:", e);
            }
            return html;
          },
        },
      }),
    ];
  },
});
