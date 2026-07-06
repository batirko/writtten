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
 * (see ./labeling). It exists only to feed a real PRD through `runLive`.
 */

import type { EvalFixture } from "../types";
import { splitSections } from "./splitSections";

/**
 * Anonymised, order-stable doc id (`P01`, `P02`, …). Referenced this way in the
 * snapshot and labeling sheet so a source title never leaks into the repo
 * (local-first invariant #5; audit #5 privacy handling).
 */
export function anonymisedId(index: number): string {
  return `P${String(index + 1).padStart(2, "0")}`;
}

/**
 * Turn one raw markdown PRD into an `EvalFixture`. `recordings` starts empty and
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
 * Build the whole corpus from `{ name, markdown }` entries (already read from
 * disk by the caller). Entries are sorted by `name` first so ids are stable
 * across runs regardless of readdir order; the source `name` is used only for
 * the human-readable description, never the id.
 */
export function buildCorpus(files: { name: string; markdown: string }[]): EvalFixture[] {
  return [...files]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((f, i) => {
      const id = anonymisedId(i);
      return buildCorpusFixture(id, f.markdown, `${id} — ${f.name}`);
    });
}
