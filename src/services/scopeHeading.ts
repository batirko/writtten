/**
 * Scope-exclusion heading detection (OBS-030).
 *
 * A claim under an "Out of scope" / "Non-goals" / "Future work" heading is a
 * deliberate *non*-commitment, not a live claim: there is nothing there to
 * conflict with a stated limit elsewhere. `evaluateSection` uses this to tag such
 * claims `scope: "excluded"` at extraction time, and the contradiction checks
 * then skip them (see docs/logs/prompt_quality_observations.md OBS-030).
 *
 * Pure and synchronous; no model call, no DB. Deterministic on the *heading* the
 * editor already marks (`SectionMember.isHeading`), so it does not depend on the
 * weak free-tier model recognizing the intent.
 *
 * Kept aligned with the heading-intent sentence in the evaluator's "Established
 * elsewhere in this document" block (evaluator.ts) — the two name the same
 * families ("Out of scope"/"Non-goals"/"Future") and must not diverge.
 */

/**
 * True when `heading` marks its section as an explicit scope exclusion.
 *
 * Conservative on "future": a bare "Future state" / "Future vision" heading
 * describes intended direction, not an exclusion, so a "future" heading matches
 * only when qualified ("Future work", "Future considerations", …).
 */
export function isExcludedScopeHeading(heading: string | undefined | null): boolean {
  if (!heading) return false;
  const h = heading
    .toLowerCase()
    .replace(/[*_`#>]/g, " ") // markdown emphasis / heading marks
    .replace(/^[\s\d.)\-–—:]+/, "") // leading numbering / bullets
    .replace(/[\s:.\-–—]+$/, "") // trailing colon / punctuation
    .trim();
  if (!h) return false;

  // "Out of scope" / "out-of-scope" / "not in scope"
  if (/\bout[-\s]of[-\s]scope\b/.test(h)) return true;
  if (/\bnot\s+in\s+scope\b/.test(h)) return true;
  // "Non-goals" / "non goals" / "nongoal(s)"
  if (/\bnon[-\s]?goals?\b/.test(h)) return true;
  // "Future work / considerations / enhancements / scope / plans / iterations"
  // (qualified only — a bare "Future" heading is not an exclusion).
  if (/\bfuture\s+(work|considerations?|enhancements?|scope|plans?|iterations?)\b/.test(h))
    return true;

  return false;
}
