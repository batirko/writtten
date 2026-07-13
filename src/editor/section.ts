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
  /** True if this member is a table node. A table carries a blockId (so section
   *  boundaries stay correct) but its cell text is excluded from `combinedText`
   *  and from the evaluator's body check — the table is eval-inert. See
   *  docs/projects/canvas_content_types.md § Eval-model interaction. */
  isTable: boolean;
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
  /** True when the joined text exceeded MAX_SECTION_CHARS and `combinedText`
   *  was cut at the cap — everything past it is invisible to the evaluator.
   *  Surfaced as the feed's truncation note (heading-cliff facet 2); the
   *  console-only warn otherwise read as "nothing to flag" on the tail. */
  truncated: boolean;
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
  isTable: boolean;
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
      isTable: node.type.name === "table",
    });
  });
  return out;
}

function buildCombined(members: SectionMember[]): { text: string; truncated: boolean } {
  const combined = members
    // A table is eval-inert: keep it as a section member (for anchoring
    // continuity) but exclude its flattened cell text from the LLM's view of
    // the section, so no claims are extracted and span checks never fire inside
    // cells. See docs/projects/canvas_content_types.md § Eval-model interaction.
    .filter((m) => !m.isTable)
    .map((m) => m.text)
    .filter((t) => t.trim().length > 0)
    .join("\n\n");
  if (combined.length > MAX_SECTION_CHARS) {
    console.warn(
      `[section] combinedText ${combined.length} chars exceeds MAX_SECTION_CHARS (${MAX_SECTION_CHARS}); truncating.`
    );
    return { text: combined.slice(0, MAX_SECTION_CHARS), truncated: true };
  }
  return { text: combined, truncated: false };
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
    const { text, truncated } = buildCombined(current.members);
    sections.push({
      sectionId: current.sectionId,
      headingText: current.headingText,
      members: current.members,
      combinedText: text,
      truncated,
    });
    current = null;
  };

  for (const b of blocks) {
    if (b.isHeading) {
      flush();
      current = {
        sectionId: b.blockId,
        headingText: b.text,
        members: [{ blockId: b.blockId, text: b.text, isHeading: b.isHeading, isTable: b.isTable }],
      };
    } else {
      if (!current) {
        current = { sectionId: b.blockId, headingText: "", members: [] };
      }
      current.members.push({
        blockId: b.blockId,
        text: b.text,
        isHeading: b.isHeading,
        isTable: b.isTable,
      });
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

// ---------------------------------------------------------------------------
// Section-boundary structural-change detection (revert-aware eval, Mechanism 1)
// ---------------------------------------------------------------------------
//
// A block-type toggle (paragraph ↔ heading) silently re-sections the document
// via resolveSections() with no debounce of its own: the block that became a
// heading opens a new section and steals the body that followed it. The next
// legitimate trigger then evaluates a *transiently* resized section. These
// helpers let the editor detect that re-sectioning and hold eval dispatch until
// the new boundaries are sustained (a "committed" layer over the always-live
// resolveSections result). See docs/projects/revert_aware_evaluation.md
// (Mechanism 1) and docs/mechanics/evaluation-triggers.md.

/**
 * Map every member blockId to the id of the section that currently owns it. The
 * owner is a section's representative id (heading id, or first-block id for the
 * intro). This is the *structural* fingerprint of the document: it changes only
 * when a heading is added/removed/moved (re-sectioning), not when text is edited
 * or a paragraph is split within an existing section.
 */
export function sectionOwnerMap(sections: Section[]): Map<string, string> {
  const owners = new Map<string, string>();
  for (const s of sections) {
    for (const m of s.members) {
      owners.set(m.blockId, s.sectionId);
    }
  }
  return owners;
}

/**
 * True iff a **surviving** block (present in both layouts) changed which section
 * owns it — the signature of a re-sectioning (heading toggle, heading delete),
 * as opposed to plain typing or an Enter-split (which add/remove blocks but never
 * move a survivor to a different owner). Blocks that only exist on one side are
 * ignored, so add/remove alone is not treated as structural.
 */
export function hasStructuralChange(
  committed: Map<string, string>,
  live: Map<string, string>
): boolean {
  for (const [blockId, owner] of live) {
    const prior = committed.get(blockId);
    if (prior !== undefined && prior !== owner) return true;
  }
  return false;
}

/**
 * The set of section ids affected by a structural change: every owner id, on
 * either side, of a surviving block whose ownership moved. This spans both the
 * section that lost blocks and the one that gained them (e.g. the shrunk intro
 * *and* the new heading section on a P→H toggle). Used to scope eval suppression
 * and in-flight invalidation to just the re-sectioned area.
 */
export function changedSectionIds(
  committed: Map<string, string>,
  live: Map<string, string>
): Set<string> {
  const changed = new Set<string>();
  for (const [blockId, owner] of live) {
    const prior = committed.get(blockId);
    if (prior !== undefined && prior !== owner) {
      changed.add(owner);
      changed.add(prior);
    }
  }
  return changed;
}
