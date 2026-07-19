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
 * Deliberately id-free: this returns headings and text only. The connected agent must
 * never learn block identity (docs/projects/agent_connected_eval.md § The boundary #4),
 * so the narrowing happens here, at the seam, rather than being left to each consumer to
 * remember.
 */

export interface SnapshotSection {
  heading: string;
  text: string;
}

export interface LiveDocSnapshot {
  /** Derived from a leading heading node, or "" — writtten has no document-title field. */
  title: string;
  /** The Document Context the author wrote: what this document is, and for whom. */
  stage: string;
  sections: SnapshotSection[];
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
