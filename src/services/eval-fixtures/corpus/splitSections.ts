/**
 * Markdown → evaluation sections, for the V1 base-rate corpus study.
 *
 * A "section" here mirrors production's eval unit (docs/projects/section_as_eval_unit.md):
 * a heading plus the block-level paragraphs that follow it, evaluated together as
 * one unit so the claim ledger accumulates per section and cross-section
 * contradiction / strategic-tension detection behaves as it does in the running app.
 *
 * The output is `{ id, text }[]` — exactly the shape `EvalFixture.sections` expects,
 * so a corpus doc drops straight into `createFixtureRunner().runLive(...)` with no
 * new runner code. Each section's `text` is the heading + its paragraphs joined,
 * which is what the evaluator extracts claims from.
 *
 * Pure and fs-free by design: the file-reading glue lives in the `.live.test.ts`
 * (which has node types); this module is type-checked by the app build too, so it
 * must not import `node:*`.
 */

/** A block is a run of non-blank lines delimited by blank line(s). */
function toBlocks(markdown: string): string[] {
  return markdown
    .replace(/\r\n/g, "\n")
    .split(/\n[ \t]*\n+/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
}

/** True when a block begins with an ATX heading marker (`#`..`######`). */
function isHeadingBlock(block: string): boolean {
  return /^#{1,6}[ \t]+\S/.test(block);
}

/** Slugify a heading's text for a readable, stable-ish section id. */
function slug(text: string): string {
  return text
    .replace(/^#{1,6}[ \t]+/, "") // strip the heading marker
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export interface CorpusSection {
  id: string;
  text: string;
}

/**
 * Split a markdown document into heading-grouped sections.
 *
 * - Content before the first heading becomes an intro section.
 * - Each ATX heading starts a new section that absorbs the following blocks
 *   until the next heading.
 * - A document with no headings falls back to one section per top-level block,
 *   so the ledger still accumulates across ≥2 sections (enabling cross-section
 *   contradiction detection) rather than collapsing to a single blob.
 *
 * Section ids are unique and prefixed with their order (`s1-…`, `s2-…`) so a
 * repeated heading text can't collide.
 */
export function splitSections(markdown: string): CorpusSection[] {
  const blocks = toBlocks(markdown);
  if (blocks.length === 0) return [];

  const hasHeading = blocks.some(isHeadingBlock);

  // No headings → paragraph-per-section fallback.
  if (!hasHeading) {
    return blocks.map((text, i) => ({ id: `s${i + 1}-p`, text }));
  }

  const sections: { title: string; members: string[] }[] = [];
  let current: { title: string; members: string[] } | null = null;

  for (const block of blocks) {
    if (isHeadingBlock(block)) {
      if (current) sections.push(current);
      current = { title: block, members: [block] };
    } else if (current) {
      current.members.push(block);
    } else {
      // Content before the first heading — an intro section.
      current = { title: "intro", members: [block] };
    }
  }
  if (current) sections.push(current);

  return sections.map((s, i) => {
    const base = s.title === "intro" ? "intro" : slug(s.title) || "section";
    return { id: `s${i + 1}-${base}`, text: s.members.join("\n\n") };
  });
}
