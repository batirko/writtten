/**
 * Live-document snapshot source — a production-safe registry the editor fills with a
 * read-only view of the current document. Sibling of `activitySignal`: a tiny module-level
 * seam that lets a non-React service read live editor state without importing React and
 * without going through the dev-only acceptance harness.
 *
 * Why not reuse the harness's `registerBlockReader`? That one is DEV-only (stripped in
 * production), and it hands out `blockId`s alongside a matching *write* affordance. The
 * agent bridge ships in production and must have neither.
 *
 * This seam is **app-internal**, and it does carry block ids: the external-observation
 * boundary resolves an agent's `anchorText` against real blocks locally, which is
 * precisely how the agent gets anchoring without ever being told an id.
 *
 * The invariant is about the *wire*, not this module: nothing carrying block identity may
 * reach a connected agent (docs/projects/agent_connected_eval.md § The boundary #4). That
 * narrowing happens in `agentSnapshot.ts`, which projects `sections` through an explicit
 * allowlist and never touches `members` — guarded by a test asserting the projected keys.
 */
import type { SectionMember } from "../services/types";

export interface SnapshotSection {
  heading: string;
  text: string;
}

export interface LiveDocSnapshot {
  /** Derived from a leading heading node, or "" — writtten has no document-title field. */
  title: string;
  /** The Document Context the author wrote: what this document is, and for whom. */
  stage: string;
  /** Id-free — this is what the wire projection is built from. */
  sections: SnapshotSection[];
  /**
   * Flat, **document-ordered** blocks with their ids. App-internal only: the boundary
   * needs these to resolve `anchorText` (multi-match resolves to the first in document
   * order, so the ordering is load-bearing). Never projected onto the wire.
   */
  members: SectionMember[];
}

type Reader = () => LiveDocSnapshot;

let reader: Reader | null = null;

/** Register the live reader. Returns an unregister fn — wire it to a useEffect cleanup. */
export function registerDocSnapshotReader(fn: Reader): () => void {
  reader = fn;
  return () => {
    // Guard against a stale cleanup clobbering a newer registration.
    if (reader === fn) reader = null;
  };
}

/** Read the current document, or null when no editor is mounted. */
export function readLiveDoc(): LiveDocSnapshot | null {
  return reader ? reader() : null;
}
