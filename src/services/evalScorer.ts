/**
 * Pure, synchronous scorer for the evaluator quality ratchet.
 *
 * Answers: "given the observations the pipeline produced, how many of the
 * expected ground-truth observations did it catch (recall) and how many of
 * the produced observations were spurious (precision)?"
 *
 * Match rule for a (produced, expected) pair:
 *   1. `produced.type === expected.type`
 *   2. If `expected.sectionId` is set: `produced.blockId === expected.sectionId`
 *      (doc-scoped obs have no blockId; omit sectionId to match them)
 *   3. If `expected.substring` is set: the substring appears (case-insensitive)
 *      in EITHER `produced.text` (the observation message) OR the raw text of
 *      the section at the anchored span.  This avoids brittle offset comparison
 *      while still pinpointing which passage is being flagged.
 *
 * Each produced/expected observation is used at most once (greedy left-to-right).
 *
 * Design: docs/projects/evaluator_quality_ratchet.md §Scorer match rule
 */

import type { Observation } from "../store/db";
import type { ExpectedObservation } from "./eval-fixtures/types";
import type {
  LabelRow,
  EmissionRow,
  LabelBucket,
} from "./eval-fixtures/corpus/labeling/loadLabels";
import { DOC_TYPES, type DocType } from "./eval-fixtures/corpus/loadCorpus";

/**
 * Per-type precision floors for the Tier-2 live ratchet, keyed to **trust cost**
 * rather than one aggregate number: a false `contradiction` discredits the whole
 * feed (R4.4), while a false soft-opportunity is mild and easily ignored. Four
 * tiers — see docs/projects/evaluator_quality_ratchet.md § Phase 6.
 *
 *   A ≥ 0.95  contradiction                                   (hero; one FP discounts the feed)
 *   B ≥ 0.85  unsupported_claim, audience_mismatch            (assertive problem-claims)
 *   C ≥ 0.80  clarity, undefined_jargon                       (span nits; clarity high-end — G2 slot)
 *   D ≥ 0.70  missing_topic, underexposed_topic,              (soft opportunity-kind suggestions)
 *             structure_flow, strategic_tension
 *
 * PROVISIONAL: the tiering (the policy) is fixed; the constants get recalibrated
 * against real per-type precision once field_validation V1 lands independent,
 * second-rater-labelled real-PRD numbers. A `Record<Observation["type"], …>` so
 * the compiler rejects adding an observation type without assigning it a floor.
 */
export const PRECISION_FLOORS: Record<Observation["type"], number> = {
  // Tier A
  contradiction: 0.95,
  // Tier B
  unsupported_claim: 0.85,
  audience_mismatch: 0.85,
  // Tier C
  clarity: 0.8,
  undefined_jargon: 0.8,
  // Tier D
  missing_topic: 0.7,
  underexposed_topic: 0.7,
  structure_flow: 0.7,
  strategic_tension: 0.7,
  // STRUCTURALLY UNREACHABLE — not a calibrated floor, and not a coverage gap.
  // `user_lens` is agent-only (`AGENT_ONLY_TYPES`, externalObservations.ts): it
  // appears in no evaluator prompt and on no built-in eval path, so the pipeline
  // this scorer measures can never produce one and no corpus will ever cover it.
  // Present only because this Record is exhaustive over `Observation["type"]`.
  // Matches the lowest existing floor so the number is not load-bearing.
  //
  // Owned by the signal-quality lane, added here by the user_lens build with the
  // owner's sign-off (2026-07-21). Do NOT calibrate it against V1 and do NOT
  // count it in a per-type aggregate. The proposed replacement is to subtract
  // the agent-only types from this Record's key type instead
  // (`Record<Exclude<Observation["type"], …>, number>`), which deletes this entry
  // and keeps the live ratchet's "no corpus coverage" warning honest without
  // a name-based skip.
  user_lens: 0.7,
};

/** The tier floor a produced observation of this type must clear (Tier-2 live). */
export function precisionFloorForType(type: Observation["type"]): number {
  return PRECISION_FLOORS[type];
}

/**
 * Aggregate recall soft-floor for the live ratchet. Recall stays aggregate (not
 * per-type) here; field_validation V3 measures the load-bearing contradiction-
 * at-distance recall separately against a hand-labelled corpus.
 */
export const AGGREGATE_RECALL_FLOOR = 0.8;

export interface ScoreResult {
  fixture: string;
  truePositives: Array<{ expected: ExpectedObservation; produced: Observation }>;
  falsePositives: Observation[];
  falseNegatives: ExpectedObservation[];
  /** tp / (tp + fp). NaN when no observations produced. */
  precision: number;
  /** tp / (tp + fn). NaN when no observations expected. */
  recall: number;
}

/**
 * Check whether `produced` satisfies `expected`.
 * `sectionTexts` maps sectionId → raw text for the substring span check.
 */
function matches(
  produced: Observation,
  expected: ExpectedObservation,
  sectionTexts: Map<string, string>
): boolean {
  // 1. Type must match.
  if (produced.type !== expected.type) return false;

  // 2. Section anchor check (only for span-scoped obs).
  if (expected.sectionId !== undefined) {
    if (produced.blockId !== expected.sectionId) return false;
  }

  // 3. Substring check (optional).
  if (expected.substring !== undefined) {
    const needle = expected.substring.toLowerCase();
    // Check the observation message text first.
    if (produced.text.toLowerCase().includes(needle)) return true;
    // Fallback: check the raw section text at the anchored span (handles
    // cases where the observation message paraphrases rather than quoting).
    if (produced.blockId) {
      const sectionText = sectionTexts.get(produced.blockId) ?? "";
      if (produced.startOffset !== undefined && produced.endOffset !== undefined) {
        const spanText = sectionText.slice(produced.startOffset, produced.endOffset);
        if (spanText.toLowerCase().includes(needle)) return true;
      }
      // Also check the full section text (for doc-scoped or fallback cases).
      if (sectionText.toLowerCase().includes(needle)) return true;
    }
    return false;
  }

  return true;
}

/**
 * Score a set of produced observations against expected ground truth.
 *
 * @param fixtureId  Displayed in the result for easy identification in test output.
 * @param produced   All active observations the evaluator pipeline produced.
 * @param expected   Ground-truth expected observations.
 * @param sectionTexts  Map of sectionId → raw text (for substring span matching).
 */
export function scoreObservations(
  fixtureId: string,
  produced: Observation[],
  expected: ExpectedObservation[],
  sectionTexts: Map<string, string>
): ScoreResult {
  const remainingProduced = [...produced];
  const truePositives: ScoreResult["truePositives"] = [];
  const falseNegatives: ExpectedObservation[] = [];

  for (const exp of expected) {
    const idx = remainingProduced.findIndex((p) => matches(p, exp, sectionTexts));
    if (idx !== -1) {
      truePositives.push({ expected: exp, produced: remainingProduced[idx] });
      remainingProduced.splice(idx, 1);
    } else {
      falseNegatives.push(exp);
    }
  }

  const falsePositives = remainingProduced;

  const tp = truePositives.length;
  const fp = falsePositives.length;
  const fn = falseNegatives.length;

  return {
    fixture: fixtureId,
    truePositives,
    falsePositives,
    falseNegatives,
    precision: tp + fp === 0 ? NaN : tp / (tp + fp),
    recall: tp + fn === 0 ? NaN : tp / (tp + fn),
  };
}

// ===========================================================================
// V1 base-rate corpus scorers (docs/projects/field_validation.md § V1)
//
// The fixtures above carry inline `expected` observations; the corpus does not.
// Its ground truth is the external, human-verified labeling sheet (two-bucket
// conflict PAIRS for recall; per-emission verdicts for wild precision). These
// scorers stay pure (no fs, no network) so they run offline against a dumped
// run — the whole point of the record/replay batching.
// ===========================================================================

/** Normalise for lenient, paraphrase-tolerant containment: lowercase, punctuation
 *  → spaces, collapse whitespace. Shared by every span/footprint comparison. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * The full textual footprint of a produced observation: its message plus both
 * anchor snapshots plus the raw section text at each anchored block. A labeled
 * span is matched against this, so it doesn't matter whether the tool quoted the
 * span in the message or merely anchored to it.
 */
function obsFootprint(obs: Observation, sectionTexts: Map<string, string>): string {
  const parts = [obs.text, obs.anchorText ?? "", obs.conflictingAnchorText ?? ""];
  if (obs.blockId) parts.push(sectionTexts.get(obs.blockId) ?? "");
  if (obs.conflictingBlockId) parts.push(sectionTexts.get(obs.conflictingBlockId) ?? "");
  return norm(parts.join(" "));
}

/**
 * Does a labeled span appear in an observation's footprint? Exact normalised
 * containment first; failing that, a ≥70% significant-word overlap so a
 * paraphrased quote still matches. Words shorter than 4 chars are ignored as
 * noise ("the", "and", "q2" is kept since digits count toward length via norm).
 */
function spanInFootprint(span: string, footprint: string): boolean {
  const n = norm(span);
  if (!n) return false;
  if (footprint.includes(n)) return true;
  const words = n.split(" ").filter((w) => w.length >= 4);
  if (words.length === 0) return false;
  const present = words.filter((w) => footprint.includes(w)).length;
  return present / words.length >= 0.7;
}

/**
 * Does a produced observation catch a labeled conflict pair? Both of the pair's
 * spans must appear in the observation's footprint, and the types must line up
 * (Bucket 1 ↔ contradiction, Bucket 2 ↔ strategic_tension). Exported so V1's
 * free-vs-paid false-contradiction count and V3's recall harness share one rule.
 */
export function observationMatchesLabel(
  obs: Observation,
  label: LabelRow,
  sectionTexts: Map<string, string>
): boolean {
  const expectedType = label.bucket === 1 ? "contradiction" : "strategic_tension";
  if (obs.type !== expectedType) return false;
  const fp = obsFootprint(obs, sectionTexts);
  return spanInFootprint(label.spanA, fp) && spanInFootprint(label.spanB, fp);
}

export interface PerDocRun {
  docId: string;
  produced: Observation[];
  /** sectionId → raw text, for the footprint span check. */
  sectionTexts: Map<string, string>;
  /** Stratification tag, so recall can be sliced per document type. */
  docType?: DocType;
}

export interface BucketRecall {
  bucket: LabelBucket;
  /** Ground-truth labels in this bucket (the base-rate numerator). */
  totalLabels: number;
  /** Labels the tool caught. */
  matched: number;
  /** matched / totalLabels; NaN when the bucket has no labels. */
  recall: number;
  /** totalLabels / docCount — the per-document base rate (the hero number for B1). */
  baseRatePerDoc: number;
  /** Labels no produced observation caught (the invisible misses). */
  missed: LabelRow[];
}

export interface CorpusRecallResult {
  docCount: number;
  /** Bucket 1 — strict contradiction; the load-bearing hero measure. */
  strictContradiction: BucketRecall;
  /** Bucket 2 — softer tension / inconsistency; reported SEPARATELY. */
  tension: BucketRecall;
}

function scoreBucket(
  bucket: LabelBucket,
  labels: LabelRow[],
  byDoc: Map<string, PerDocRun>,
  docCount: number
): BucketRecall {
  const bucketLabels = labels.filter((l) => l.bucket === bucket);
  // Greedy: each produced observation satisfies at most one label.
  const usedByDoc = new Map<string, Set<Observation>>();
  const missed: LabelRow[] = [];
  let matched = 0;

  for (const label of bucketLabels) {
    const run = byDoc.get(label.docId);
    if (!run) {
      missed.push(label);
      continue;
    }
    const used = usedByDoc.get(label.docId) ?? new Set<Observation>();
    const hit = run.produced.find(
      (o) => !used.has(o) && observationMatchesLabel(o, label, run.sectionTexts)
    );
    if (hit) {
      used.add(hit);
      usedByDoc.set(label.docId, used);
      matched++;
    } else {
      missed.push(label);
    }
  }

  const total = bucketLabels.length;
  return {
    bucket,
    totalLabels: total,
    matched,
    recall: total === 0 ? NaN : matched / total,
    baseRatePerDoc: docCount === 0 ? NaN : total / docCount,
    missed,
  };
}

/**
 * Per-bucket recall + base rate over the corpus. Bucket 1 (strict contradiction)
 * and Bucket 2 (tension) are scored and reported SEPARATELY so the hero number
 * never gets diluted by the softer bucket. `baseRatePerDoc` counts labels over
 * ALL corpus docs (including zero-label docs), which is exactly the un-planted
 * hero base rate the study exists to produce.
 */
export function scoreCorpusRecall(
  perDoc: PerDocRun[],
  labels: LabelRow[],
  opts: { verifiedOnly?: boolean } = {}
): CorpusRecallResult {
  const used = opts.verifiedOnly ? labels.filter((l) => l.verified) : labels;
  const byDoc = new Map(perDoc.map((d) => [d.docId, d]));
  const docCount = perDoc.length;
  return {
    docCount,
    strictContradiction: scoreBucket(1, used, byDoc, docCount),
    tension: scoreBucket(2, used, byDoc, docCount),
  };
}

export interface StratifiedRecall {
  /** Recall over the whole corpus. */
  all: CorpusRecallResult;
  /** Recall within each document type present (base rate is per-type docCount). */
  byType: Partial<Record<DocType, CorpusRecallResult>>;
}

/**
 * `scoreCorpusRecall` sliced by document type. The overall number answers "does
 * the hero fire often enough", the per-type slices answer "does it hold off its
 * best-case doc type, or collapse" — the reason the corpus is stratified. Each
 * per-type base rate divides by that type's doc count, and labels are scoped to
 * the docs of that type (by docId membership), so a spec-only contradiction can
 * never inflate the comms base rate.
 */
export function stratifyRecall(
  perDoc: PerDocRun[],
  labels: LabelRow[],
  opts: { verifiedOnly?: boolean } = {}
): StratifiedRecall {
  const byType: Partial<Record<DocType, CorpusRecallResult>> = {};
  for (const dt of DOC_TYPES) {
    const docs = perDoc.filter((d) => d.docType === dt);
    if (docs.length === 0) continue;
    const ids = new Set(docs.map((d) => d.docId));
    const typeLabels = labels.filter((l) => ids.has(l.docId));
    byType[dt] = scoreCorpusRecall(docs, typeLabels, opts);
  }
  return { all: scoreCorpusRecall(perDoc, labels, opts), byType };
}

// ===========================================================================
// V3 — Prefilter A/B: isolate SELECTION cost from adjudication
// (docs/projects/field_validation.md § V3). Run the cross-document contradiction
// check twice per doc — with the Jaccard prefilter and with it bypassed
// (all-pairs) — and diff which labeled pairs each arm caught. The gap is the
// **prefilter-drop count**: true pairs only the no-prefilter run catches (the
// "Q2"/"the second quarter" class), i.e. hero misses attributable to candidate
// SELECTION rather than adjudication. Concrete gate for OBS-038 and the deferred
// LEANN/embeddings decision. Pure/offline: two dumped arms reproduce the number.
// ===========================================================================

/**
 * Labels in `bucket` that at least one produced observation in `byDoc` catches,
 * using the same greedy one-observation-per-label rule as `scoreBucket`. Returns
 * the matched `LabelRow` objects **by reference** so two arms scored against the
 * same label array can be diffed by identity.
 */
function matchedLabels(
  bucket: LabelBucket,
  labels: LabelRow[],
  byDoc: Map<string, PerDocRun>
): LabelRow[] {
  const bucketLabels = labels.filter((l) => l.bucket === bucket);
  const usedByDoc = new Map<string, Set<Observation>>();
  const matched: LabelRow[] = [];
  for (const label of bucketLabels) {
    const run = byDoc.get(label.docId);
    if (!run) continue;
    const used = usedByDoc.get(label.docId) ?? new Set<Observation>();
    const hit = run.produced.find(
      (o) => !used.has(o) && observationMatchesLabel(o, label, run.sectionTexts)
    );
    if (hit) {
      used.add(hit);
      usedByDoc.set(label.docId, used);
      matched.push(label);
    }
  }
  return matched;
}

export interface PrefilterDropBucket {
  bucket: LabelBucket;
  /** Ground-truth labels in this bucket. */
  totalLabels: number;
  /** Labels the prefilter (production) arm caught. */
  prefilterMatched: number;
  /** Labels the all-pairs (bypass) arm caught. */
  allPairsMatched: number;
  /** Labels ONLY the all-pairs arm caught — recoverable purely by dropping the
   *  prefilter. The prefilter-drop count: hero misses attributable to SELECTION. */
  dropCount: number;
  /** The specific dropped labels (for the snapshot write-up). */
  droppedLabels: LabelRow[];
  /** Labels NEITHER arm caught — even with every candidate in context the
   *  adjudicator missed them: the adjudication-attributable residual. */
  adjudicationMissCount: number;
}

export interface PrefilterDropResult {
  docCount: number;
  /** Bucket 1 — strict contradiction; the load-bearing hero measure. */
  strictContradiction: PrefilterDropBucket;
  /** Bucket 2 — softer tension / inconsistency; reported SEPARATELY. */
  tension: PrefilterDropBucket;
}

/**
 * Diff the prefilter arm against the all-pairs arm over the same corpus + labels.
 * Both `PerDocRun[]` come from the SAME docs run twice through the contradiction
 * check (prefilter on / off), matched by `docId`. Returns, per bucket:
 *
 *   dropCount            — labels only the all-pairs arm catches → the SELECTION
 *                          cost (the prefilter crowded the true pair out before
 *                          the adjudicator saw it).
 *   adjudicationMissCount — labels neither arm catches → the ADJUDICATION residual
 *                          (present in full context, still missed).
 *
 * dropCount + adjudicationMissCount + prefilterMatched === totalLabels, so the
 * split between "the prefilter's fault" and "the model's fault" is exhaustive.
 * Pure/offline: two dumped arms reproduce identical numbers with zero network.
 */
export function scorePrefilterDrop(
  prefilter: PerDocRun[],
  allPairs: PerDocRun[],
  labels: LabelRow[],
  opts: { verifiedOnly?: boolean } = {}
): PrefilterDropResult {
  const used = opts.verifiedOnly ? labels.filter((l) => l.verified) : labels;
  const pfBy = new Map(prefilter.map((d) => [d.docId, d]));
  const apBy = new Map(allPairs.map((d) => [d.docId, d]));

  const scoreBucketDrop = (bucket: LabelBucket): PrefilterDropBucket => {
    const bucketLabels = used.filter((l) => l.bucket === bucket);
    const pfMatched = new Set(matchedLabels(bucket, used, pfBy));
    const apMatched = matchedLabels(bucket, used, apBy);
    const apSet = new Set(apMatched);
    const dropped = apMatched.filter((l) => !pfMatched.has(l));
    const adjudicationMisses = bucketLabels.filter((l) => !pfMatched.has(l) && !apSet.has(l));
    return {
      bucket,
      totalLabels: bucketLabels.length,
      prefilterMatched: pfMatched.size,
      allPairsMatched: apMatched.length,
      dropCount: dropped.length,
      droppedLabels: dropped,
      adjudicationMissCount: adjudicationMisses.length,
    };
  };

  return {
    docCount: prefilter.length,
    strictContradiction: scoreBucketDrop(1),
    tension: scoreBucketDrop(2),
  };
}

export interface TypePrecision {
  type: Observation["type"];
  tp: number;
  fp: number;
  /** tp + fp — emissions of this type adjudicated. */
  n: number;
  /** tp / n; NaN when no emissions of this type. */
  precision: number;
  /** The trust-cost tier floor for this type. */
  floor: number;
  /** precision >= floor; false when below, undefined-ish (null) when n === 0. */
  meetsFloor: boolean | null;
}

export interface WildPrecisionResult {
  perType: TypePrecision[];
  overall: { tp: number; fp: number; precision: number };
}

/**
 * Per-type precision "in the wild" from the adjudicated emissions sheet. This is
 * the real-PRD number that recalibrates the ratchet's per-type floors (audit #7):
 * for each observation type, TP / (TP + FP) over human-verdicted emissions,
 * compared against `PRECISION_FLOORS`. Every floor type appears in the result
 * (n = 0 when the corpus never emitted it) so coverage gaps stay visible.
 */
export function scoreWildPrecision(
  emissions: EmissionRow[],
  opts: { verifiedOnly?: boolean } = {}
): WildPrecisionResult {
  const rows = opts.verifiedOnly ? emissions.filter((e) => e.verified) : emissions;
  const acc = new Map<Observation["type"], { tp: number; fp: number }>();
  for (const e of rows) {
    // Count only explicit verdicts. `parseEmissions` already drops un-adjudicated
    // rows, but scoring must not *depend* on that: treating "anything not tp" as a
    // false positive would silently deflate precision — and a deflated wild number
    // is exactly what would argue a trust-derived floor downward.
    if (e.verdict !== "tp" && e.verdict !== "fp") continue;
    const s = acc.get(e.type) ?? { tp: 0, fp: 0 };
    if (e.verdict === "tp") s.tp++;
    else s.fp++;
    acc.set(e.type, s);
  }

  const allTypes = Object.keys(PRECISION_FLOORS) as Observation["type"][];
  const perType: TypePrecision[] = allTypes.map((type) => {
    const s = acc.get(type) ?? { tp: 0, fp: 0 };
    const n = s.tp + s.fp;
    const precision = n === 0 ? NaN : s.tp / n;
    const floor = PRECISION_FLOORS[type];
    return {
      type,
      tp: s.tp,
      fp: s.fp,
      n,
      precision,
      floor,
      meetsFloor: n === 0 ? null : precision >= floor,
    };
  });

  const totalTp = [...acc.values()].reduce((a, s) => a + s.tp, 0);
  const totalFp = [...acc.values()].reduce((a, s) => a + s.fp, 0);
  return {
    perType,
    overall: {
      tp: totalTp,
      fp: totalFp,
      precision: totalTp + totalFp === 0 ? NaN : totalTp / (totalTp + totalFp),
    },
  };
}

export interface StratifiedWildPrecision {
  all: WildPrecisionResult;
  byType: Partial<Record<DocType, WildPrecisionResult>>;
}

/**
 * `scoreWildPrecision` sliced by document type (each emission carries the type of
 * its source doc). Reveals whether e.g. `audience_mismatch` is precise on comms
 * but noisy on specs — the per-type floor recalibration (audit #7) should not be
 * driven by one register masquerading as all of them.
 */
export function stratifyWildPrecision(
  emissions: EmissionRow[],
  opts: { verifiedOnly?: boolean } = {}
): StratifiedWildPrecision {
  const byType: Partial<Record<DocType, WildPrecisionResult>> = {};
  for (const dt of DOC_TYPES) {
    const rows = emissions.filter((e) => e.docType === dt);
    if (rows.length === 0) continue;
    byType[dt] = scoreWildPrecision(rows, opts);
  }
  return { all: scoreWildPrecision(emissions, opts), byType };
}

/**
 * Stable identity for a conflict observation across model tiers. Keyed on the
 * ordered block-pair (section ids are identical across the free/paid runs of the
 * same fixture), so "the same conflict" matches even when the two tiers word the
 * message differently. Falls back to type + block + a normalised anchor snippet
 * for a span-only conflict with no `conflictingBlockId`.
 */
function conflictKey(obs: Observation): string {
  const a = obs.blockId ?? "";
  const b = obs.conflictingBlockId ?? "";
  const pair = [a, b].filter(Boolean).sort().join("|");
  return pair
    ? `${obs.type}::${pair}`
    : `${obs.type}::${a}::${norm(obs.anchorText ?? obs.text).slice(0, 40)}`;
}

export interface TierDiff {
  /** Conflict observations only the free tier emitted (candidate weak-model FPs). */
  freeOnlyContradictions: Observation[];
  freeOnlyTensions: Observation[];
  /** Conflict observations only the paid tier emitted (candidate free-tier misses). */
  paidOnlyContradictions: Observation[];
  paidOnlyTensions: Observation[];
  /** Count present in both tiers, per type. */
  sharedContradictions: number;
  sharedTensions: number;
}

const CONFLICT_TYPES: Observation["type"][] = ["contradiction", "strategic_tension"];

/**
 * Diff a document's free-tier vs paid-tier conflict emissions. Surfaces the
 * tier delta the study cares about: `freeOnly*` are the extra conflicts a weak
 * free-tier model asserted that the strong paid model didn't — the raw material
 * for counting **confident false contradictions on the free tier** (R4.4) once
 * cross-referenced with the labels. `paidOnly*` are conflicts only the strong
 * model caught (free-tier recall loss).
 */
export function diffTierRuns(free: Observation[], paid: Observation[]): TierDiff {
  const conflictsOf = (list: Observation[], type: Observation["type"]) =>
    list.filter((o) => o.type === type);
  const keysOf = (list: Observation[]) => new Set(list.map(conflictKey));

  const freeConflicts = free.filter((o) => CONFLICT_TYPES.includes(o.type));
  const paidConflicts = paid.filter((o) => CONFLICT_TYPES.includes(o.type));
  const freeKeys = keysOf(freeConflicts);
  const paidKeys = keysOf(paidConflicts);

  const freeOnly = (type: Observation["type"]) =>
    conflictsOf(free, type).filter((o) => !paidKeys.has(conflictKey(o)));
  const paidOnly = (type: Observation["type"]) =>
    conflictsOf(paid, type).filter((o) => !freeKeys.has(conflictKey(o)));
  const shared = (type: Observation["type"]) =>
    conflictsOf(free, type).filter((o) => paidKeys.has(conflictKey(o))).length;

  return {
    freeOnlyContradictions: freeOnly("contradiction"),
    freeOnlyTensions: freeOnly("strategic_tension"),
    paidOnlyContradictions: paidOnly("contradiction"),
    paidOnlyTensions: paidOnly("strategic_tension"),
    sharedContradictions: shared("contradiction"),
    sharedTensions: shared("strategic_tension"),
  };
}

/**
 * Contradictions the tool emitted for a doc that match NO ground-truth Bucket-1
 * label — i.e. confident contradictions with no basis in the hand labels. On a
 * free-tier run this is the precise **confident-false-contradiction** count
 * (R4.4). Requires verified labels to be trustworthy, so callers should pass the
 * verified-only label set.
 */
export function unlabeledContradictions(run: PerDocRun, labels: LabelRow[]): Observation[] {
  const docLabels = labels.filter((l) => l.docId === run.docId && l.bucket === 1);
  return run.produced
    .filter((o) => o.type === "contradiction")
    .filter((o) => !docLabels.some((l) => observationMatchesLabel(o, l, run.sectionTexts)));
}
