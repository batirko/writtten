/**
 * Evaluator quality ratchet — seed corpus.
 *
 * Import this barrel to get the full fixture set. Each fixture is a
 * self-contained labeled test case. See docs/projects/evaluator_quality_ratchet.md.
 *
 * Add a fixture by:
 *   1. Create src/services/eval-fixtures/<id>.ts
 *   2. Add it to the array below
 *   3. Run `npm run eval:record -- <id>` to populate the recordings map
 *   4. Add expected[] ground-truth labels
 *   5. `npm test` should pass (Tier 1 exact match)
 */

import contradictionTimeline from "./contradiction-timeline";
import strategicTensionFraud from "./strategic-tension-fraud";
import clarityVague from "./clarity-vague";
import unsupportedVsAttributed from "./unsupported-vs-attributed";
import jargonAllowlist from "./jargon-allowlist";
import cleanDoc from "./clean-doc";
import antiTaxonomy from "./anti-taxonomy";
import noDisguisedFix from "./no-disguised-fix";
import clarityDiscrimination from "./clarity-discrimination";
import unsupportedSuccessMetric from "./unsupported-success-metric";
import clarityWordySpecified from "./clarity-wordy-specified";
import clarityConditionalSpecified from "./clarity-conditional-specified";
import claimKindDiscrimination from "./claim-kind-discrimination";
import clarityTextInsight from "./clarity-text-insight";
import type { EvalFixture } from "./types";

export const corpus: EvalFixture[] = [
  contradictionTimeline,
  strategicTensionFraud,
  clarityVague,
  unsupportedVsAttributed,
  jargonAllowlist,
  cleanDoc,
  antiTaxonomy,
  noDisguisedFix,
  clarityDiscrimination,
  unsupportedSuccessMetric,
  clarityWordySpecified,
  clarityConditionalSpecified,
  claimKindDiscrimination,
  clarityTextInsight,
];

export { type EvalFixture } from "./types";
