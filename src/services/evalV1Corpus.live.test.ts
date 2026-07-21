/**
 * V1 — Base-rate corpus study runner (docs/projects/field_validation.md § V1).
 *
 * Runs a local corpus of real PRDs headless through the pipeline, once per tier
 * (free-model routing vs a paid `gemini-2.5-pro` key), and reports the three
 * numbers the study exists to produce:
 *
 *   1. Hero base rate  — un-planted Bucket-1 (strict contradiction) labels/doc,
 *      and the tool's recall against them; Bucket-2 (tension) reported separately.
 *   2. Wild precision  — per observation type, TP/(TP+FP) from the adjudicated
 *      emissions sheet (feeds the ratchet's per-type floors, audit #7).
 *   3. Free-vs-paid delta — confident false contradictions the free tier emits
 *      that the paid tier / the labels don't support (R4.4).
 *
 * V3 — Hero-miss instrumentation (field_validation.md § V3) rides the same runner:
 * the paid tier's cross-document contradiction check runs TWICE per doc — with the
 * Jaccard prefilter and with it bypassed (`contradictionCandidates: "all-pairs"`).
 * Diffing which labeled pairs each arm catches yields the PREFILTER-DROP COUNT
 * (labels only the no-prefilter arm catches — the candidate-SELECTION cost), split
 * from the adjudication residual (labels neither arm catches). This is the gate for
 * OBS-038 and the deferred LEANN/embeddings decision.
 *
 * This is MEASUREMENT infra, not a ratchet gate: no hard asserts on the numbers.
 * Skipped unless EVAL_V1=1, so CI stays offline and quota-free.
 *
 * Corpus + labels are LOCAL and gitignored (invariant #5). Point at them with:
 *   V1_CORPUS_DIR   dir of *.md PRDs + labels.csv/emissions.csv  (default ./.v1-corpus)
 *   V1_RECORD=1     spend RPD once: real calls + dump replayable fixtures to
 *                   <dir>/recordings/<id>.<tier>[.allpairs].json  (the all-pairs
 *                   arm reuses the prefilter arm's fast-tier recordings via
 *                   fill-gaps record, so only the differing contradiction calls
 *                   spend RPD).
 *   (default)       offline re-score: replay the dumped fixtures in mock mode,
 *                   zero network — identical numbers (both arms).
 *   V1_LIMIT=N      only the first N docs (smoke runs).
 *
 * Requires (record mode): VITE_GEMINI_API_KEY (+ VITE_GEMINI_PAID_KEY for the paid tier).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createFixtureRunner } from "./eval-fixtures/runFixture";
import {
  buildCorpus,
  DOC_TYPES,
  type CorpusEntry,
  type DocType,
} from "./eval-fixtures/corpus/loadCorpus";
import { parseLabels, parseEmissions } from "./eval-fixtures/corpus/labeling/loadLabels";
import {
  stratifyRecall,
  stratifyWildPrecision,
  diffTierRuns,
  unlabeledContradictions,
  scorePrefilterDrop,
  type CorpusRecallResult,
  type WildPrecisionResult,
  type PrefilterDropResult,
  type PerDocRun,
} from "./evalScorer";
import { getReplayStats } from "../model/mock";
import type { EvalFixture } from "./eval-fixtures/types";
import type { Observation } from "../store/db";

const V1 = !!process.env.EVAL_V1;
const RECORD = !!process.env.V1_RECORD;
const CORPUS_DIR = process.env.V1_CORPUS_DIR ?? path.resolve(process.cwd(), ".v1-corpus");
const LIMIT = process.env.V1_LIMIT ? Number(process.env.V1_LIMIT) : Infinity;
// V1_DOCS=P01,P04,P07 — record/replay ONLY these corpus ids. Filters the built
// corpus AFTER id assignment (which spans the whole dir), so ids still match the
// full-corpus labels.csv — unlike V1_LIMIT, which slices the first N. Lets a
// bounded record pass target the docs that actually carry the labels of interest.
const DOCS = process.env.V1_DOCS
  ? new Set(process.env.V1_DOCS.split(",").map((s) => s.trim()).filter(Boolean))
  : null;

// Mock the DB (IndexedDB is unavailable in Node) and nanoid — mirrors the
// Tier-2 live ratchet. Real Gemini calls go through in record mode; mock mode
// replays the dumped fixtures.
vi.mock("../store/db", () => ({
  saveBlockSummary: vi.fn(),
  loadBlockSummary: vi.fn(),
  saveClaimsForBlock: vi.fn(),
  loadActiveClaimsForDocument: vi.fn(),
  loadBlockSummariesForDocument: vi.fn(async () => []),
  saveObservation: vi.fn(),
  loadObservation: vi.fn(),
  reactivateObservation: vi.fn(),
  loadActiveObservationsForDocument: vi.fn(),
  updateObservationStatus: vi.fn(),
  loadSuppressionsForDocument: vi.fn(async () => []),
  saveDocEvalState: vi.fn(),
  loadDocEvalState: vi.fn(async () => undefined),
}));
vi.mock("nanoid", () => ({ nanoid: () => `obs-${Math.random().toString(36).slice(2, 8)}` }));

const runner = createFixtureRunner();

// ---------------------------------------------------------------------------
// Local fs helpers (test-only; app build never compiles this file's fs use)
// ---------------------------------------------------------------------------
/**
 * Read the stratified corpus: one subfolder per `DocType` (`<dir>/spec/*.md`, …).
 * Root-level `*.md` (a quick flat smoke corpus) is accepted and tagged `spec`.
 */
function readCorpus(): CorpusEntry[] {
  if (!fs.existsSync(CORPUS_DIR)) return [];
  const mdIn = (dir: string) =>
    fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((f) => f.toLowerCase().endsWith(".md") && !f.startsWith("."))
          .map((name) => ({ name, markdown: fs.readFileSync(path.join(dir, name), "utf8") }))
      : [];

  const files: { name: string; markdown: string; docType: DocType }[] = [];
  for (const dt of DOC_TYPES) {
    for (const f of mdIn(path.join(CORPUS_DIR, dt))) files.push({ ...f, docType: dt });
  }
  // Flat fallback: root-level *.md with no subfolders → treat as spec.
  if (files.length === 0) {
    for (const f of mdIn(CORPUS_DIR)) files.push({ ...f, docType: "spec" });
  }
  const corpus = buildCorpus(files);
  const selected = DOCS ? corpus.filter((c) => DOCS.has(c.fixture.id)) : corpus;
  return Number.isFinite(LIMIT) ? selected.slice(0, LIMIT) : selected;
}

function readSheet<T>(file: string, parse: (csv: string) => T[]): T[] {
  const p = path.join(CORPUS_DIR, file);
  return fs.existsSync(p) ? parse(fs.readFileSync(p, "utf8")) : [];
}

type Tier = "free" | "paid";
type Arm = "prefilter" | "all-pairs";

/** The prefilter arm keeps the historical `<id>.<tier>.json` path (so V1 Run 1's
 *  dumps replay unchanged); the all-pairs arm gets a `.allpairs` suffix. */
function recordingPath(id: string, tier: Tier, arm: Arm = "prefilter"): string {
  const suffix = arm === "all-pairs" ? ".allpairs" : "";
  return path.join(CORPUS_DIR, "recordings", `${id}.${tier}${suffix}.json`);
}

function readRecordingFile(id: string, tier: Tier, arm: Arm): Record<string, string> | undefined {
  const p = recordingPath(id, tier, arm);
  return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, string>) : undefined;
}

function sectionTextsOf(fixture: EvalFixture): Map<string, string> {
  return new Map(fixture.sections.map((s) => [s.id, s.text]));
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** One emission → a draft adjudication row (verdict left blank for the human). */
function emissionRow(docId: string, docType: DocType, o: Observation): string {
  return [docId, docType, o.type, o.anchorText ?? "", o.text.replace(/\n/g, " "), "", "false"]
    .map(csvCell)
    .join(",");
}

// ---------------------------------------------------------------------------
// Per-arm run: record (real calls + dump) or replay (offline from dump).
//
// `arm` selects the contradiction candidate strategy. The all-pairs arm's record
// pass seeds the prefilter arm's recordings (fill-gaps) so only the differing
// contradiction calls hit the model — the fast-tier calls are byte-identical
// between arms and are served from cache.
//
// Every arm is fully isolated by `runner.setup()` up front. The arms share a
// docId (`fixture-<id>`) across the free/paid/all-pairs runs, and the evaluator's
// revert-aware snapshot store is module-level: without a reset, a later arm would
// "restore" the earlier arm's snapshot for the same (docId, membership, text)
// and never re-run the model — so the all-pairs arm would silently reproduce the
// prefilter arm (drop count stuck at 0), and free→paid would cross-contaminate.
// `setup()` clears the snapshot store (and claims/observations), so each arm is a
// genuine independent run. Run 1 dodged this only by recording the tiers in
// separate processes; the in-process A/B must reset explicitly.
// ---------------------------------------------------------------------------
async function runArm(
  fixture: EvalFixture,
  tier: Tier,
  arm: Arm,
  freeKey: string,
  paidKey: string | undefined,
  seedRecordings?: Record<string, string>
): Promise<Observation[]> {
  const cc = arm;
  runner.setup();
  if (RECORD) {
    // Resumable record (V1_RESUME): a corpus larger than a few docs can't finish
    // a real-call record pass inside one test timeout, and re-recording already-
    // dumped docs re-spends scarce free-tier RPD. When V1_RESUME is set, replay a
    // doc/arm that already has a dump instead of calling the model again, so a
    // record run picks up where a timed-out one left off.
    const existing = recordingPath(fixture.id, tier, arm);
    if (process.env.V1_RESUME && fs.existsSync(existing)) {
      const recordings = JSON.parse(fs.readFileSync(existing, "utf8")) as Record<string, string>;
      return runner.run({ ...fixture, recordings }, { contradictionCandidates: cc });
    }
    const { observations, recordings } = await runner.runRecord(
      fixture,
      freeKey,
      tier === "paid" ? paidKey : undefined,
      { contradictionCandidates: cc, seedRecordings }
    );
    fs.mkdirSync(path.dirname(existing), { recursive: true });
    fs.writeFileSync(existing, JSON.stringify(recordings, null, 2));
    return observations;
  }
  // Offline replay from the dumped fixture — mock mode, zero network.
  const recordings = readRecordingFile(fixture.id, tier, arm);
  if (!recordings) {
    console.warn(
      `[V1] no ${tier}/${arm} recording for ${fixture.id} — run with V1_RECORD=1 first`
    );
    return [];
  }
  const observations = await runner.run({ ...fixture, recordings }, { contradictionCandidates: cc });
  noteFidelity(fixture.id, tier, arm);
  return observations;
}

/**
 * Replay fidelity per doc/arm. A mock-mode miss degrades to an empty `{}`, so a
 * recording set that no longer matches the current prompts produces an all-zero
 * result that is indistinguishable from a clean run — the numbers look like
 * evidence but measure nothing. Tally every arm and refuse to report on a stale
 * corpus. (2026-07-21: two post-Run-1 prompt changes invalidated every V1
 * recording — 282 requests, 282 misses — and the run still passed green.)
 */
const fidelity: { doc: string; tier: Tier; arm: Arm; hits: number; misses: number }[] = [];

function noteFidelity(doc: string, tier: Tier, arm: Arm): void {
  const { hits, misses } = getReplayStats();
  fidelity.push({ doc, tier, arm, hits, misses });
}

// ---------------------------------------------------------------------------
describe.skipIf(!V1)("V1 base-rate corpus study", () => {
  const corpus = readCorpus();
  // Scope labels/emissions to the docs actually in this run. A no-op for a full
  // run (every label's doc is present); for a V1_DOCS/V1_LIMIT subset it stops an
  // unmeasured doc's labels from counting as misses and tanking the ALL-slice
  // recall (the per-type slices already scope by docId, so they'd disagree).
  const corpusIds = new Set(corpus.map((c) => c.fixture.id));
  const labels = readSheet("labels.csv", parseLabels).filter((l) => corpusIds.has(l.docId));
  const emissions = readSheet("emissions.csv", parseEmissions).filter((e) =>
    corpusIds.has(e.docId)
  );

  beforeEach(() => {
    vi.clearAllMocks();
    runner.setup();
  });
  afterEach(() => runner.teardown());

  it("runs the corpus (free + paid) and reports base rate, wild precision, tier delta", async () => {
    if (corpus.length === 0) {
      console.warn(
        `[V1] no corpus at ${CORPUS_DIR} — drop *.md PRDs + labels.csv there, then re-run. Skipping.`
      );
      return;
    }
    const freeKey = process.env.VITE_GEMINI_API_KEY;
    const paidKey = process.env.VITE_GEMINI_PAID_KEY;
    if (RECORD && !freeKey) throw new Error("V1_RECORD=1 needs VITE_GEMINI_API_KEY");

    const perDocFree: PerDocRun[] = [];
    const perDocPaid: PerDocRun[] = [];
    // V3 — all-pairs (prefilter-bypassed) paid arm; only docs actually measured.
    const perDocPaidAllPairs: PerDocRun[] = [];
    const abMeasuredDocIds = new Set<string>();
    const runAB = !process.env.V1_SKIP_AB; // V1_SKIP_AB=1 → base-rate only, no A/B
    const emissionDraft: string[] = [
      "doc_id,doc_type,obs_type,anchored_span,message,verdict,verified",
    ];
    const perDocRows: Record<string, unknown>[] = [];
    const verifiedLabels = labels.filter((l) => l.verified);

    for (const { fixture, docType } of corpus) {
      const sectionTexts = sectionTextsOf(fixture);
      const free = await runArm(fixture, "free", "prefilter", freeKey ?? "", paidKey);
      const paid = await runArm(fixture, "paid", "prefilter", freeKey ?? "", paidKey);

      const freeRun: PerDocRun = { docId: fixture.id, produced: free, sectionTexts, docType };
      const paidRun: PerDocRun = { docId: fixture.id, produced: paid, sectionTexts, docType };
      perDocFree.push(freeRun);
      perDocPaid.push(paidRun);

      // Emissions to adjudicate come from the strong (paid) tier.
      for (const o of paid) emissionDraft.push(emissionRow(fixture.id, docType, o));

      const diff = diffTierRuns(free, paid);
      perDocRows.push({
        doc: fixture.id,
        type: docType,
        sections: fixture.sections.length,
        "free·contra": free.filter((o) => o.type === "contradiction").length,
        "paid·contra": paid.filter((o) => o.type === "contradiction").length,
        "free-only contra": diff.freeOnlyContradictions.length,
        "paid-only contra": diff.paidOnlyContradictions.length,
        "free false-contra*": unlabeledContradictions(freeRun, verifiedLabels).length,
      });

      // V3 — prefilter A/B: re-run the PAID contradiction check with the Jaccard
      // prefilter bypassed. In record mode this is measured for every doc (the
      // all-pairs arm reuses the paid prefilter arm's fast-tier recordings via
      // fill-gaps, so only the differing contradiction calls spend RPD); in replay
      // it is measured only for docs whose all-pairs arm was previously recorded.
      if (runAB && (RECORD || fs.existsSync(recordingPath(fixture.id, "paid", "all-pairs")))) {
        const seed = RECORD ? readRecordingFile(fixture.id, "paid", "prefilter") : undefined;
        const paidAllPairs = await runArm(
          fixture,
          "paid",
          "all-pairs",
          freeKey ?? "",
          paidKey,
          seed
        );
        perDocPaidAllPairs.push({
          docId: fixture.id,
          produced: paidAllPairs,
          sectionTexts,
          docType,
        });
        abMeasuredDocIds.add(fixture.id);
      }
    }

    // Persist the emissions draft for hand-adjudication (never overwrites the
    // human-verified emissions.csv — writes a separate .generated file).
    fs.writeFileSync(path.join(CORPUS_DIR, "emissions.generated.csv"), emissionDraft.join("\n"));

    // --- Report -----------------------------------------------------------
    const typeCounts = DOC_TYPES.map(
      (dt) => `${dt}:${corpus.filter((c) => c.docType === dt).length}`
    )
      .filter((s) => !s.endsWith(":0"))
      .join(" · ");
    console.log(`\n=== V1 base-rate corpus study (${RECORD ? "record" : "replay"} mode) ===`);
    console.log(
      `Corpus: ${corpus.length} docs (${typeCounts}) · labels: ${labels.length} (verified: ${verifiedLabels.length})`
    );
    console.table(perDocRows);

    // Hero base rate & recall — overall AND stratified by doc type (does the hero
    // hold off its best-case type, or collapse?).
    const recall = stratifyRecall(perDocPaid, labels, { verifiedOnly: true });
    console.log("\n--- Hero base rate & recall (paid tier, verified labels) ---");
    console.table(recallRows("ALL", recall.all));
    for (const dt of DOC_TYPES) {
      const r = recall.byType[dt];
      if (r) console.table(recallRows(dt, r));
    }

    const totalFreeFalse = perDocFree.reduce(
      (n, run) => n + unlabeledContradictions(run, verifiedLabels).length,
      0
    );
    console.log(`\n--- Free-vs-paid delta ---`);
    console.log(
      `Confident FALSE contradictions on the FREE tier (no verified B1 label): ${totalFreeFalse}` +
        (verifiedLabels.length === 0 ? "  (⚠ no verified labels yet — not trustworthy)" : "")
    );

    // V3 — prefilter A/B: the candidate-SELECTION drop, split from adjudication.
    if (perDocPaidAllPairs.length > 0) {
      const paidForDrop = perDocPaid.filter((d) => abMeasuredDocIds.has(d.docId));
      const drop = scorePrefilterDrop(paidForDrop, perDocPaidAllPairs, labels, {
        verifiedOnly: true,
      });
      console.log(
        `\n--- V3 prefilter A/B — candidate-selection drop (paid tier, verified labels, ${perDocPaidAllPairs.length}/${corpus.length} docs measured) ---`
      );
      console.table(dropRows(drop));
      const dropped = [
        ...drop.strictContradiction.droppedLabels,
        ...drop.tension.droppedLabels,
      ];
      if (dropped.length > 0) {
        console.log(
          "Pairs the prefilter dropped but all-pairs caught (selection cost — the LEANN/embeddings gate):"
        );
        for (const l of dropped) {
          console.log(`  · [${l.docId} B${l.bucket}] "${l.spanA}" ⇄ "${l.spanB}"`);
        }
      }
    } else if (runAB) {
      console.log(
        "\n--- V3 prefilter A/B ---\n(no all-pairs recordings yet — run `V1_RECORD=1 npm run eval:v1` with a paid key to capture the bypass arm)"
      );
    }

    if (emissions.length > 0) {
      const wild = stratifyWildPrecision(emissions, { verifiedOnly: true });
      console.log("\n--- Per-type wild precision (adjudicated emissions) — ALL doc types ---");
      console.table(wildRows(wild.all));
      for (const dt of DOC_TYPES) {
        const w = wild.byType[dt];
        if (w) {
          console.log(`\n  · wild precision — ${dt} only ·`);
          console.table(wildRows(w));
        }
      }
    } else {
      console.log(
        "\n--- Per-type wild precision ---\n(no adjudicated emissions.csv yet — adjudicate emissions.generated.csv, rename to emissions.csv)"
      );
    }

    // --- Replay fidelity -----------------------------------------------------
    // Report before asserting, so a stale corpus shows *which* arms went stale.
    if (fidelity.length > 0) {
      const totalHits = fidelity.reduce((a, f) => a + f.hits, 0);
      const totalMisses = fidelity.reduce((a, f) => a + f.misses, 0);
      const stale = fidelity.filter((f) => f.misses > 0);
      console.log(
        `\n--- Replay fidelity ---\n${totalHits}/${totalHits + totalMisses} requests served from recordings` +
          (totalMisses > 0 ? ` · ${totalMisses} MISSES across ${stale.length} arm(s)` : " · all hit")
      );
      if (stale.length > 0) {
        console.table(
          stale.map((f) => ({ doc: f.doc, tier: f.tier, arm: f.arm, hits: f.hits, misses: f.misses }))
        );
      }

      // A miss in pure replay mode is never benign: the request never reached a
      // model and never matched a recording, so the observation set is silently
      // truncated. Numbers computed on top of that are not evidence. Fail rather
      // than report them.
      expect(
        totalMisses,
        `${totalMisses} replay miss(es): the dumped recordings no longer match the current prompts, ` +
          `so this run measured nothing. Re-record with V1_RECORD=1 (prompt changes invalidate ` +
          `every recording keyed by request hash).`
      ).toBe(0);
    }

    // Sanity assertions only (never gate on the measured numbers themselves).
    expect(recall.all.docCount).toBe(corpus.length);
    expect(fs.existsSync(path.join(CORPUS_DIR, "emissions.generated.csv"))).toBe(true);
  }, process.env.V1_TIMEOUT ? Number(process.env.V1_TIMEOUT) : 600_000);
});

/** Both buckets of a recall result as console.table rows, labeled by slice. */
function recallRows(slice: string, r: CorpusRecallResult) {
  const row = (name: string, b: CorpusRecallResult["strictContradiction"]) => ({
    slice,
    bucket: name,
    docs: r.docCount,
    labels: b.totalLabels,
    "base rate/doc": Number.isNaN(b.baseRatePerDoc) ? "—" : b.baseRatePerDoc.toFixed(2),
    matched: b.matched,
    recall: Number.isNaN(b.recall) ? "—" : (b.recall * 100).toFixed(0) + "%",
  });
  return [
    row("B1 strict contradiction (hero)", r.strictContradiction),
    row("B2 tension", r.tension),
  ];
}

/** V3 prefilter A/B rows: how the two arms caught each bucket, and the split of
 *  the miss into SELECTION (drop) vs ADJUDICATION residual. */
function dropRows(d: PrefilterDropResult) {
  const row = (name: string, b: PrefilterDropResult["strictContradiction"]) => ({
    bucket: name,
    docs: d.docCount,
    labels: b.totalLabels,
    "prefilter caught": b.prefilterMatched,
    "all-pairs caught": b.allPairsMatched,
    "PREFILTER DROP": b.dropCount,
    "adjudication miss": b.adjudicationMissCount,
  });
  return [
    row("B1 strict contradiction (hero)", d.strictContradiction),
    row("B2 tension", d.tension),
  ];
}

/** Per-type wild-precision rows vs the tier floors. */
function wildRows(w: WildPrecisionResult) {
  return w.perType.map((t) => ({
    type: t.type,
    n: t.n,
    precision: Number.isNaN(t.precision) ? "—" : (t.precision * 100).toFixed(0) + "%",
    floor: (t.floor * 100).toFixed(0) + "%",
    status: t.meetsFloor === null ? "— n=0" : t.meetsFloor ? "✅" : "❌ below floor",
  }));
}
