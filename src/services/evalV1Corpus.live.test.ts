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
 * This is MEASUREMENT infra, not a ratchet gate: no hard asserts on the numbers.
 * Skipped unless EVAL_V1=1, so CI stays offline and quota-free.
 *
 * Corpus + labels are LOCAL and gitignored (invariant #5). Point at them with:
 *   V1_CORPUS_DIR   dir of *.md PRDs + labels.csv/emissions.csv  (default ./.v1-corpus)
 *   V1_RECORD=1     spend RPD once: real calls + dump replayable fixtures to
 *                   <dir>/recordings/<id>.<tier>.json
 *   (default)       offline re-score: replay the dumped fixtures in mock mode,
 *                   zero network — identical numbers.
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
  type CorpusRecallResult,
  type WildPrecisionResult,
  type PerDocRun,
} from "./evalScorer";
import type { EvalFixture } from "./eval-fixtures/types";
import type { Observation } from "../store/db";

const V1 = !!process.env.EVAL_V1;
const RECORD = !!process.env.V1_RECORD;
const CORPUS_DIR = process.env.V1_CORPUS_DIR ?? path.resolve(process.cwd(), ".v1-corpus");
const LIMIT = process.env.V1_LIMIT ? Number(process.env.V1_LIMIT) : Infinity;

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
  return Number.isFinite(LIMIT) ? corpus.slice(0, LIMIT) : corpus;
}

function readSheet<T>(file: string, parse: (csv: string) => T[]): T[] {
  const p = path.join(CORPUS_DIR, file);
  return fs.existsSync(p) ? parse(fs.readFileSync(p, "utf8")) : [];
}

function recordingPath(id: string, tier: "free" | "paid"): string {
  return path.join(CORPUS_DIR, "recordings", `${id}.${tier}.json`);
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
// Per-tier run: record (real calls + dump) or replay (offline from dump).
// ---------------------------------------------------------------------------
async function runTier(
  fixture: EvalFixture,
  tier: "free" | "paid",
  freeKey: string,
  paidKey: string | undefined
): Promise<Observation[]> {
  if (RECORD) {
    // Resumable record (V1_RESUME): a corpus larger than a few docs can't finish
    // a real-call record pass inside one test timeout, and re-recording already-
    // dumped docs re-spends scarce free-tier RPD. When V1_RESUME is set, replay a
    // doc/tier that already has a dump instead of calling the model again, so a
    // record run picks up where a timed-out one left off.
    const existing = recordingPath(fixture.id, tier);
    if (process.env.V1_RESUME && fs.existsSync(existing)) {
      const recordings = JSON.parse(fs.readFileSync(existing, "utf8")) as Record<string, string>;
      return runner.run({ ...fixture, recordings });
    }
    const { observations, recordings } = await runner.runRecord(
      fixture,
      freeKey,
      tier === "paid" ? paidKey : undefined
    );
    fs.mkdirSync(path.dirname(recordingPath(fixture.id, tier)), { recursive: true });
    fs.writeFileSync(recordingPath(fixture.id, tier), JSON.stringify(recordings, null, 2));
    return observations;
  }
  // Offline replay from the dumped fixture — mock mode, zero network.
  const p = recordingPath(fixture.id, tier);
  if (!fs.existsSync(p)) {
    console.warn(`[V1] no ${tier} recording for ${fixture.id} — run with V1_RECORD=1 first`);
    return [];
  }
  const recordings = JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, string>;
  return runner.run({ ...fixture, recordings });
}

// ---------------------------------------------------------------------------
describe.skipIf(!V1)("V1 base-rate corpus study", () => {
  const corpus = readCorpus();
  const labels = readSheet("labels.csv", parseLabels);
  const emissions = readSheet("emissions.csv", parseEmissions);

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
    const emissionDraft: string[] = [
      "doc_id,doc_type,obs_type,anchored_span,message,verdict,verified",
    ];
    const perDocRows: Record<string, unknown>[] = [];
    const verifiedLabels = labels.filter((l) => l.verified);

    for (const { fixture, docType } of corpus) {
      const sectionTexts = sectionTextsOf(fixture);
      const free = await runTier(fixture, "free", freeKey ?? "", paidKey);
      const paid = await runTier(fixture, "paid", freeKey ?? "", paidKey);

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
