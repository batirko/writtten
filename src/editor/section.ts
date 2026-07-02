import { type Node as PMNode } from "@tiptap/pm/model";

/**
 * Section resolver — derives semantic "sections" (a heading plus every body
 * block until the next heading) from the live ProseMirror doc. Sections are the
 * unit of *evaluation input*; individual blocks remain the unit of *anchoring*.
 *
 * Why this exists: TipTap represents every top-level node as its own block with
 * its own stable `blockId`. A heading is a block; its paragraphs are separate
 * blocks. When the eval pipeline fired per-block, a heading was evaluated in
 * isolation with no body — producing hallucinations like "this section is
 * empty" on populated sections (see docs/projects/evaluation_signal_quality.md
 * Finding 1). Feeding the whole section makes that structurally impossible.
 *
 * Sections are *derived, not stored* — re-computed on each eval from the live
 * doc. No schema change, no `section` node type. A linear walk is cheap.
 * See docs/projects/section_as_eval_unit.md.
 */

export interface SectionMember {
  blockId: string;
  text: string;
  /** True if this member is a heading node. Lets the evaluator tell a section
   *  with real body text from a bodyless heading (OBS-029). */
  isHeading: boolean;
}

export interface Section {
  /** Representative id: the heading block's id, or the first block's id for an
   *  intro section that precedes any heading. Used as the ledger/summary key. */
  sectionId: string;
  /** The heading's text, or "" for an intro section with no heading. */
  headingText: string;
  /** Ordered top-level blocks belonging to this section (heading first, if any). */
  members: SectionMember[];
  /** Heading + body joined in document order — the LLM's view of the section. */
  combinedText: string;
}

/**
 * Hard ceiling on the combined text we send for a single section. A very long
 * section (e.g. a multi-thousand-word background narrative) is truncated with a
 * warning rather than blowing up the prompt. Chunked-merge of huge sections is
 * a deferred refinement — see the project doc's non-goals.
 */
export const MAX_SECTION_CHARS = 8000;

interface TopBlock {
  blockId: string;
  text: string;
  isHeading: boolean;
}

function topLevelBlocks(doc: PMNode): TopBlock[] {
  const out: TopBlock[] = [];
  doc.forEach((node) => {
    const blockId = node.attrs?.blockId as string | undefined;
    if (!blockId) return;
    out.push({
      blockId,
      text: node.textContent,
      isHeading: node.type.name === "heading",
    });
  });
  return out;
}

function buildCombined(members: SectionMember[]): string {
  const combined = members
    .map((m) => m.text)
    .filter((t) => t.trim().length > 0)
    .join("\n\n");
  if (combined.length > MAX_SECTION_CHARS) {
    console.warn(
      `[section] combinedText ${combined.length} chars exceeds MAX_SECTION_CHARS (${MAX_SECTION_CHARS}); truncating.`
    );
    return combined.slice(0, MAX_SECTION_CHARS);
  }
  return combined;
}

/**
 * Walk the doc into a flat list of sections. Every heading (at any level) opens
 * a new section; content before the first heading is an implicit intro section
 * keyed by its first block's id. Sub-heading hierarchy is flattened for v1.
 */
export function resolveSections(doc: PMNode): Section[] {
  const blocks = topLevelBlocks(doc);
  const sections: Section[] = [];

  let current: { sectionId: string; headingText: string; members: SectionMember[] } | null = null;

  const flush = () => {
    if (!current) return;
    sections.push({
      sectionId: current.sectionId,
      headingText: current.headingText,
      members: current.members,
      combinedText: buildCombined(current.members),
    });
    current = null;
  };

  for (const b of blocks) {
    if (b.isHeading) {
      flush();
      current = {
        sectionId: b.blockId,
        headingText: b.text,
        members: [{ blockId: b.blockId, text: b.text, isHeading: b.isHeading }],
      };
    } else {
      if (!current) {
        current = { sectionId: b.blockId, headingText: "", members: [] };
      }
      current.members.push({ blockId: b.blockId, text: b.text, isHeading: b.isHeading });
    }
  }
  flush();

  return sections;
}

/** Resolve the section that a given block belongs to, or null if not found. */
export function resolveSection(doc: PMNode, blockId: string): Section | null {
  const sections = resolveSections(doc);
  return sections.find((s) => s.members.some((m) => m.blockId === blockId)) ?? null;
}
