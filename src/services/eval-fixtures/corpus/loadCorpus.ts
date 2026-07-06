/**
 * Build V1-corpus fixtures from raw markdown, for the base-rate corpus study
 * (docs/projects/field_validation.md § V1).
 *
 * Pure and fs-free: callers (the `.live.test.ts`) read the local corpus dir and
 * hand file contents in here. Keeping the fs glue out of this module lets it be
 * unit-tested offline and type-checked by the app build (which has no node types).
 *
 * A corpus fixture carries NO inline `expected` observations — unlike the seed
 * fixtures, its ground truth lives in the external, human-verified labeling sheet
 * (see ./labeling). It exists only to feed a real doc through `runLive`.
 *
 * The corpus is **stratified** by document type (the persona writes "PRDs, specs,
 * comms, and decision docs"): each fixture is tagged with a `docType` so the runner
 * can report the hero base rate and per-type precision BOTH overall and per doc
 * type — revealing whether contradiction-at-distance holds off its best-case doc
 * type or collapses. On disk this is a subfolder per type (`<dir>/spec/*.md`, …).
 */

import type { EvalFixture } from "../types";
import { splitSections } from "./splitSections";

/**
 * Stratification buckets. `spec` is the PRD-shaped primary slice (public RFCs /
 * design docs stand in for confidential PRDs, which are not public); `prd` holds
 * the genuinely PRD-like docs we could find; `decision` and `comms` are contrast
 * slices. On disk, each is a subfolder of the corpus dir.
 */
export type DocType = "prd" | "spec" | "decision" | "comms";
export const DOC_TYPES: DocType[] = ["prd", "spec", "decision", "comms"];

export function isDocType(s: string): s is DocType {
  return (DOC_TYPES as string[]).includes(s);
}

/** A corpus fixture plus its stratification tag. */
export interface CorpusEntry {
  fixture: EvalFixture;
  docType: DocType;
}

/**
 * Anonymised, order-stable doc id (`P01`, `P02`, …). Referenced this way in the
 * snapshot and labeling sheet so a source title never leaks into the repo
 * (local-first invariant #5; audit #5 privacy handling).
 */
export function anonymisedId(index: number): string {
  return `P${String(index + 1).padStart(2, "0")}`;
}

/**
 * Turn one raw markdown doc into an `EvalFixture`. `recordings` starts empty and
 * is populated at runtime in record mode; `expected` stays empty (ground truth is
 * the external labeling sheet).
 */
export function buildCorpusFixture(
  docId: string,
  markdown: string,
  description = `corpus doc ${docId}`
): EvalFixture {
  return {
    id: docId,
    description,
    sections: splitSections(markdown),
    recordings: {},
    expected: [],
  };
}

/**
 * Build the whole stratified corpus from `{ name, markdown, docType }` entries
 * (already read from disk by the caller). Entries are sorted by `docType` (in
 * `DOC_TYPES` order) then `name`, so anonymised ids are stable across runs
 * regardless of readdir order and group by type; the source `name` is used only
 * for the human-readable description, never the id.
 */
export function buildCorpus(
  files: { name: string; markdown: string; docType: DocType }[]
): CorpusEntry[] {
  const rank = (t: DocType) => DOC_TYPES.indexOf(t);
  return [...files]
    .sort((a, b) => rank(a.docType) - rank(b.docType) || a.name.localeCompare(b.name))
    .map((f, i) => {
      const id = anonymisedId(i);
      return {
        fixture: buildCorpusFixture(id, f.markdown, `${id} — ${f.docType}/${f.name}`),
        docType: f.docType,
      };
    });
}
