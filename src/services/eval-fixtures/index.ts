/**
 * Evaluator quality ratchet — seed corpus.
 *
 * Import this barrel to get the full fixture set. Each fixture is a
 * self-contained labeled test case. See docs/projects/evaluator_quality_ratchet.md.
 *
 * Add a fixture by:
 *   1. Create src/services/eval-fixtures/<id>.ts
 *   2. Add it to the array below
 *   3. Run `EVAL_RECORD_ID=<id> npm run eval:record` to populate the recordings map
 *   4. Add expected[] ground-truth labels
 *   5. `npm test` should pass (Tier 1 exact match)
 */

import contradictionTimeline from "./contradiction-timeline";
import contradictionIntraSection from "./contradiction-intra-section";
import contradictionSweepFidelity from "./contradiction-sweep-fidelity";
import contradictionSlaFamily from "./contradiction-sla-family";
import strategicTensionFraud from "./strategic-tension-fraud";
import clarityVague from "./clarity-vague";
import unsupportedVsAttributed from "./unsupported-vs-attributed";
import jargonAllowlist from "./jargon-allowlist";
import jargonAudienceInferred from "./jargon-audience-inferred";
import cleanDoc from "./clean-doc";
import antiTaxonomy from "./anti-taxonomy";
import noDisguisedFix from "./no-disguised-fix";
import clarityDiscrimination from "./clarity-discrimination";
import unsupportedSuccessMetric from "./unsupported-success-metric";
import clarityWordySpecified from "./clarity-wordy-specified";
import clarityConditionalSpecified from "./clarity-conditional-specified";
import claimKindDiscrimination from "./claim-kind-discrimination";
import clarityTextInsight from "./clarity-text-insight";
import opinionApprehension from "./opinion-apprehension";
import commsNarrative from "./comms-narrative";
import rhetoricalApprehension from "./rhetorical-apprehension";
import type { EvalFixture } from "./types";

export const corpus: EvalFixture[] = [
  contradictionTimeline,
  contradictionIntraSection,
  contradictionSweepFidelity,
  contradictionSlaFamily,
  strategicTensionFraud,
  clarityVague,
  unsupportedVsAttributed,
  jargonAllowlist,
  jargonAudienceInferred,
  cleanDoc,
  antiTaxonomy,
  noDisguisedFix,
  clarityDiscrimination,
  unsupportedSuccessMetric,
  clarityWordySpecified,
  clarityConditionalSpecified,
  claimKindDiscrimination,
  clarityTextInsight,
  opinionApprehension,
  commsNarrative,
  rhetoricalApprehension,
];

export { type EvalFixture } from "./types";

// Tone reference corpus — labeled pairs for the Tier-2 manual scorer.
// Not in the Tier-1 `corpus` array (no pipeline to run against).
export { toneCorpus } from "./tone-corpus";
export type { TonePair, ToneLabel } from "./tone-corpus";
