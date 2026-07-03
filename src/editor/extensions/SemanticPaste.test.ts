import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";

// Extract the transformation logic directly so we can unit-test it without
// mounting a full TipTap editor. Mirrors the implementation in SemanticPaste.ts.
function transformPastedHTML(html: string): string {
  try {
    const parser = new new JSDOM("").window.DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    let modified = false;

    const blocks = doc.querySelectorAll("p, div, span, b, strong");
    blocks.forEach((block) => {
      if (block.closest("h1, h2, h3, h4, h5, h6")) return;

      const textContent = block.textContent?.trim() || "";
      if (!textContent || textContent.length > 150) return;

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
        const parentBlock = block.closest("p, div");
        if (parentBlock && parentBlock.textContent?.trim() === textContent) {
          const heading = doc.createElement("h3");
          heading.innerHTML = parentBlock.innerHTML;
          parentBlock.replaceWith(heading);
          modified = true;
        }
      }
    });

    // Mirror of the image-degradation pass in SemanticPaste.ts.
    const imgs = doc.querySelectorAll("img");
    imgs.forEach((img) => {
      const alt = img.getAttribute("alt")?.trim() || "";
      const rawSrc = img.getAttribute("src")?.trim() || "";
      const src = rawSrc.startsWith("data:") ? "embedded-image" : rawSrc;
      const marker = doc.createTextNode(`![${alt}](${src})`);
      img.replaceWith(marker);
      modified = true;
    });

    return modified ? doc.body.innerHTML : html;
  } catch {
    return html;
  }
}

describe("SemanticPaste transformPastedHTML", () => {
  it("converts a standalone <strong> paragraph to h3", () => {
    const input = `<p><strong>Executive Summary</strong></p><p>Body text here.</p>`;
    const output = transformPastedHTML(input);
    expect(output).toContain("<h3>");
    expect(output).toContain("Executive Summary");
    expect(output).toContain("<p>Body text here.</p>");
  });

  it("converts a standalone <b> paragraph to h3", () => {
    const input = `<p><b>Background</b></p><p>Some details.</p>`;
    const output = transformPastedHTML(input);
    expect(output).toContain("<h3>");
    expect(output).not.toContain("<p><b>");
  });

  it("does NOT convert bold text in the middle of a paragraph", () => {
    const input = `<p>See <strong>this important point</strong> for details.</p>`;
    const output = transformPastedHTML(input);
    expect(output).toBe(input);
    expect(output).not.toContain("<h3>");
  });

  it("does NOT convert text longer than 150 chars", () => {
    const longText = "A".repeat(151);
    const input = `<p><strong>${longText}</strong></p>`;
    const output = transformPastedHTML(input);
    expect(output).toBe(input);
  });

  it("does NOT convert bold text already inside a heading", () => {
    const input = `<h2><strong>Already a heading</strong></h2>`;
    const output = transformPastedHTML(input);
    expect(output).toBe(input);
    expect(output).not.toContain("<h3>");
  });

  it("converts span with font-weight: 700 style to h3", () => {
    const input = `<p><span style="font-weight: 700">Goals</span></p><p>Achieve X.</p>`;
    const output = transformPastedHTML(input);
    expect(output).toContain("<h3>");
    expect(output).toContain("Goals");
  });

  it("passes through HTML unchanged when no faux-headings are present", () => {
    const input = `<p>Normal paragraph.</p><p>Another one.</p>`;
    const output = transformPastedHTML(input);
    expect(output).toBe(input);
  });

  it("degrades a pasted image to visible ![alt](src) text instead of silently dropping it", () => {
    const input = `<p>Before</p><img src="https://cdn.example.com/chart.png" alt="Q3 chart"><p>After</p>`;
    const output = transformPastedHTML(input);
    expect(output).not.toContain("<img");
    expect(output).toContain("![Q3 chart](https://cdn.example.com/chart.png)");
    expect(output).toContain("Before");
    expect(output).toContain("After");
  });

  it("collapses a base64 data: image to a short marker (no bytes stored — invariant 5)", () => {
    const input = `<img src="data:image/png;base64,AAAABBBBCCCCDDDD" alt="diagram">`;
    const output = transformPastedHTML(input);
    expect(output).not.toContain("<img");
    expect(output).not.toContain("base64");
    expect(output).toContain("![diagram](embedded-image)");
  });
});
