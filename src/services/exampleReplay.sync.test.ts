/**
 * Drift guard for the "See it in action" demo recording.
 *
 * The keyless demo replays `EXAMPLE_DOC_RECORDING` in `mock` mode, keyed by
 * `reqHash(system, user)`. Any edit to the section / sweep / doc-scan prompts
 * re-keys the requests the pipeline makes, so a stale recording silently MISSES
 * (mock returns `{}`) and the demo shows an empty feed — the exact regression
 * this test exists to catch (a prompt grew, the fixture wasn't re-keyed, and CI
 * stayed green because nothing replayed the real pipeline).
 *
 * This replays the actual example through the real evaluator in mock mode and
 * asserts (a) every request the pipeline makes hits a recording (no `[mock] no
 * recording` misses) and (b) the six curated cards all surface. If a prompt
 * changes, this fails until `exampleDocRecording.ts` is re-keyed (see its header).
 *
 * Faithful to the app's demo path (App.handleLoadExample → Editor import effect):
 *   - sections dispatch with `skipContradiction: true` (no intra-section call);
 *   - sections evaluate against an EMPTY ledger (they fire concurrently before
 *     any summary/claim is written), so section-eval hashes are sibling-free —
 *     modelled here by hiding the ledger until the section phase completes;
 *   - then one cross-document sweep, then the doc-scan, both over the full ledger;
 *   - weak capability throughout (keyless = free tier); maturity is unset (the
 *     import EvalContext never threads it, so the doc-scan omits the maturity block).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EXAMPLE_DOC_RECORDING } from "./exampleDocRecording";
import { EXAMPLE_STAGE } from "./exampleDoc";
import { setLlmMode, loadRecordings, clearRecordings } from "../model/mock";
import { WEAK_CAPABILITY } from "../model/capability";
import { exampleReplayCapability } from "./exampleReplay";

// The demo runs at the ambient (keyless → weak) tier but with the contradiction
// emit-gate held open, because it replays a hand-curated recording rather than
// adjudicating live. Derived from the *same* helper App.tsx uses, so this guard
// can never drift into asserting a demo production does not actually run.
const DEMO_CAPABILITY = exampleReplayCapability(WEAK_CAPABILITY);
import type { BlockSummary, ClaimLedgerEntry, Observation } from "../store/db";

// Gemini must never be reached — mock mode should intercept every call.
vi.mock("../model/gemini", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../model/gemini")>()),
  createGeminiRouter: vi.fn(() => ({
    fast: () => {
      throw new Error("[test] Gemini fast reached — mock mode should have intercepted");
    },
    strong: () => {
      throw new Error("[test] Gemini strong reached — mock mode should have intercepted");
    },
  })),
}));

vi.mock("../store/db", () => ({
  saveBlockSummary: vi.fn(),
  loadBlockSummary: vi.fn(),
  saveClaimsForBlock: vi.fn(),
  loadActiveClaimsForDocument: vi.fn(),
  loadBlockSummariesForDocument: vi.fn(),
  loadDocument: vi.fn(),
  saveObservation: vi.fn(),
  loadObservation: vi.fn(),
  reactivateObservation: vi.fn(),
  loadActiveObservationsForDocument: vi.fn(),
  updateObservationStatus: vi.fn(),
  loadSuppressionsForDocument: vi.fn(),
  saveDocEvalState: vi.fn(),
  loadDocEvalState: vi.fn(),
}));

let obsId = 0;
vi.mock("nanoid", () => ({ nanoid: () => `obs-${++obsId}` }));

import { evaluateSection, evaluateLedgerContradictions, evaluateDocument } from "./evaluator";
import * as db from "../store/db";

// The exact section texts the editor feeds (heading + body joined by "\n\n"),
// derived from EXAMPLE_DOC_HTML the same way `resolveSections`/`buildCombined` do.
// Byte-exact: the section-eval request hash is a hash of this text (+ the static
// system prompt), so any drift here would itself trip the miss assertion.
const SECTION_TEXTS: string[] = [
  'Overview\n\nThis PRD proposes "Sidecar Review", a companion panel that watches a working document and surfaces observations — unclear passages, unsupported claims, and internal contradictions — without ever editing the author\'s text. Observations appear beside the draft, ranked by a lightweight BM25 pass over the text. The goal is to sharpen the writer\'s own thinking, not to draft on their behalf.',
  "Problem\n\nProduct managers lose hours reconciling documents they wrote themselves. Internal research shows PMs spend nearly a third of every week hunting for inconsistencies in their own specs. Existing tools either rewrite the prose or stay silent on meaning.",
  "Timeline\n\nWe are committing to a public launch in Q2 2026, and engineering is confident it can hit that date.",
  "Success metrics\n\nWe will measure adoption by weekly active documents, targeting five hundred within the first quarter, and by the share of surfaced observations that authors act on. We will also track whether the observations feel trustworthy to authors. The public launch is firmly set for Q3 2026, giving us a full quarter of beta feedback before general availability.",
  "Non-goals\n\nThe assistant will not generate or rewrite document text in any phase; it stays quiet and never interrupts the writer. It observes; the author decides.",
];

const DOC_ID = "example-sync";

// Phase-aware in-memory store. During the section phase `committed` is false, so
// the ledger reads back empty (matching the app's concurrent dispatch, where no
// section has written yet). Flipping it true exposes the full ledger to the
// sweep + doc-scan, exactly as the app serialises them after sections settle.
let committed = false;
const claimsStore: ClaimLedgerEntry[] = [];
const summaryStore: BlockSummary[] = [];
let claimId = 1;
const saved: Observation[] = [];
const superseded = new Set<string>();

function wireDb(): void {
  vi.mocked(db.loadBlockSummary).mockResolvedValue(undefined);
  vi.mocked(db.loadSuppressionsForDocument).mockResolvedValue([]);
  vi.mocked(db.saveDocEvalState).mockResolvedValue(undefined as never);
  vi.mocked(db.loadDocEvalState).mockResolvedValue(undefined);
  vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([]);

  vi.mocked(db.loadActiveClaimsForDocument).mockImplementation(async () =>
    committed ? claimsStore.filter((c) => c.status === "active") : []
  );
  vi.mocked(db.loadBlockSummariesForDocument).mockImplementation(async () =>
    committed ? summaryStore : []
  );
  // OBS-035: the doc-scan orders its Block Summaries / Claim Ledger by the
  // document's reading order — but only when the doc is *persisted* (loadDocument
  // reads the `documents` store). The demo loads the example via
  // `editor.commands.setContent(html, /* emitUpdate */ false)`, so the editor's
  // onUpdate → debounced saveDocument NEVER fires and the document is never
  // written. So in the real keyless demo loadDocument returns undefined and the
  // doc-scan falls back to the hash-determinism alphabetical order — which is
  // exactly what this fixture's recording is keyed to. Returning undefined here
  // is therefore the *faithful* mock: it reproduces the real demo request. (A
  // real typing session persists the doc, so OBS-035 reorders there — covered by
  // evaluator.test.ts "OBS-035 document-ordered prompt input".)
  vi.mocked(db.loadDocument).mockResolvedValue(undefined);

  vi.mocked(db.saveBlockSummary).mockImplementation(async (s) => {
    const i = summaryStore.findIndex((x) => x.blockId === s.blockId);
    if (i >= 0) summaryStore.splice(i, 1);
    summaryStore.push(s);
  });
  vi.mocked(db.saveClaimsForBlock).mockImplementation(async (docId, blockId, claims) => {
    for (let i = claimsStore.length - 1; i >= 0; i--) {
      if (claimsStore[i].sourceBlockId === blockId) claimsStore.splice(i, 1);
    }
    for (const c of claims) {
      claimsStore.push({
        ...(c as Omit<ClaimLedgerEntry, "id" | "docId" | "sourceBlockId" | "status">),
        id: claimId++,
        docId,
        sourceBlockId: blockId,
        status: "active",
      });
    }
  });

  vi.mocked(db.saveObservation).mockImplementation(async (o) => {
    saved.push(o as Observation);
  });
  vi.mocked(db.loadObservation).mockImplementation(async (id) => saved.find((o) => o.id === id));
  vi.mocked(db.reactivateObservation).mockImplementation(async (id) => {
    const o = saved.find((x) => x.id === id);
    if (o) o.status = "active";
    superseded.delete(id);
  });
  vi.mocked(db.updateObservationStatus).mockImplementation(async (id, status) => {
    const o = saved.find((x) => x.id === id);
    if (o) o.status = status;
    if (status === "superseded" || status === "auto_closed") superseded.add(id);
  });
}

describe("example demo recording — drift guard", () => {
  beforeEach(() => {
    committed = false;
    claimsStore.length = 0;
    summaryStore.length = 0;
    saved.length = 0;
    superseded.clear();
    claimId = 1;
    obsId = 0;
    vi.clearAllMocks();
    wireDb();
    clearRecordings();
    loadRecordings(EXAMPLE_DOC_RECORDING);
    setLlmMode("mock");
  });

  afterEach(() => {
    setLlmMode("live");
    clearRecordings();
  });

  it("replays the full example with zero mock misses and the six curated cards", async () => {
    const warns: string[] = [];
    const warnSpy = vi.spyOn(console, "warn").mockImplementation((...args) => {
      warns.push(args.map((a) => String(a)).join(" "));
    });

    // Section phase — empty ledger, skipContradiction (matches import dispatch).
    for (let i = 0; i < SECTION_TEXTS.length; i++) {
      const text = SECTION_TEXTS[i];
      await evaluateSection(
        DOC_ID,
        `s${i}`,
        text,
        [{ blockId: `s${i}`, text, isHeading: false, isTable: false }],
        EXAMPLE_STAGE,
        "mock-key",
        undefined,
        [],
        true, // skipContradiction
        undefined, // evalId
        DEMO_CAPABILITY
      );
    }

    // Ledger now visible; sweep + doc-scan run over the full document.
    committed = true;
    await evaluateLedgerContradictions(
      DOC_ID,
      EXAMPLE_STAGE,
      "mock-key",
      undefined,
      undefined,
      DEMO_CAPABILITY
    );
    // maturity is undefined here: the import EvalContext (Editor import effect)
    // never threads it, so the demo's doc-scan omits the maturity block.
    await evaluateDocument(
      DOC_ID,
      EXAMPLE_STAGE,
      "mock-key",
      undefined,
      undefined,
      undefined,
      WEAK_CAPABILITY
    );

    warnSpy.mockRestore();

    // (a) No request missed its recording — the keys are in sync with the prompts.
    const misses = warns.filter((w) => w.includes("no recording"));
    expect(misses, `stale recording keys → mock misses:\n${misses.join("\n")}`).toEqual([]);

    // (b) All six curated capabilities surface, one clean exemplar each.
    const activeTypes = new Set(
      saved.filter((o) => o.status === "active" && !superseded.has(o.id)).map((o) => o.type)
    );
    for (const type of [
      "undefined_jargon",
      "unsupported_claim",
      "clarity",
      "contradiction",
      "strategic_tension",
      "missing_topic",
    ] as const) {
      expect(activeTypes.has(type), `expected a "${type}" card in the demo`).toBe(true);
    }
  });
});
