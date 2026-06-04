/**
 * Tier 1 — Evaluator quality ratchet (deterministic, quota-free).
 *
 * Replays pre-recorded LLM responses from the seed corpus and asserts
 * that the full evaluator pipeline (anchoring, reconciliation, dedup,
 * priority, aggregation, contradiction/tension routing) produces exactly
 * the ground-truth expected observations — precision === 1 && recall === 1.
 *
 * This test runs on every `npm test` commit with zero network calls and
 * zero quota consumption. Any change to the deterministic pipeline that
 * breaks the ground truth causes this test to fail.
 *
 * Workflow for adding a fixture:
 *   1. Create src/services/eval-fixtures/<id>.ts with sections + expected
 *   2. Run `npm run eval:record -- <id>` to populate recordings
 *   3. This test should now be green for that fixture
 *
 * Design: docs/projects/evaluator_quality_ratchet.md §Tier 1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as db from "../store/db";
import { scoreObservations } from "./evalScorer";
import { createFixtureRunner } from "./eval-fixtures/runFixture";
import { corpus } from "./eval-fixtures/index";

// ---------------------------------------------------------------------------
// Module-level mocks (hoisted by Vitest — must be at top level)
// ---------------------------------------------------------------------------

vi.mock("../model/gemini", () => ({
  createGeminiRouter: vi.fn(() => ({
    fast: () => {
      throw new Error("[ratchet] Gemini fast reached — mock mode should intercept");
    },
    strong: () => {
      throw new Error("[ratchet] Gemini strong reached — mock mode should intercept");
    },
  })),
}));

vi.mock("../store/db", () => ({
  saveBlockSummary: vi.fn(),
  loadBlockSummary: vi.fn(),
  saveClaimsForBlock: vi.fn(),
  loadActiveClaimsForDocument: vi.fn(),
  saveObservation: vi.fn(),
  loadActiveObservationsForDocument: vi.fn(),
  updateObservationStatus: vi.fn(),
  loadSuppressionsForDocument: vi.fn(async () => []),
  saveDocEvalState: vi.fn(),
  loadDocEvalState: vi.fn(async () => undefined),
}));

let obsIdCounter = 0;
vi.mock("nanoid", () => ({ nanoid: () => `obs-${++obsIdCounter}` }));

// ---------------------------------------------------------------------------
// Runner + tests
// ---------------------------------------------------------------------------

const runner = createFixtureRunner();

describe("Evaluator quality ratchet — Tier 1 (deterministic replay)", () => {
  beforeEach(() => {
    obsIdCounter = 0;
    vi.clearAllMocks();
    runner.setup();
  });

  afterEach(() => {
    runner.teardown();
  });

  for (const fixture of corpus) {
    it(`${fixture.id}: ${fixture.description}`, async () => {
      const produced = await runner.run(fixture);

      const sectionTexts = new Map(
        fixture.sections.map((s) => [s.id, s.text]),
      );

      // G3 Message Lint: assert no generated message violates the no-disguised-fix rule
      for (const o of produced) {
        const textLow = o.text.toLowerCase();
        
        // 1. No questions (catches Socratic/rhetorical questions like "Have you considered...?")
        expect(
          o.text.includes("?") || o.text.includes("? "),
          `G3 violation: message contains a question mark. Must be a direct statement.\n  Message: "${o.text}"`
        ).toBe(false);

        // 2. No prescriptive/imperative patterns
        const prescriptivePatterns = [
          "you need to",
          "you should",
          "we should",
          "consider changing",
          "consider adding",
          "it might be helpful",
          "it would be helpful",
          "i suggest",
          "i recommend"
        ];
        for (const pattern of prescriptivePatterns) {
          expect(
            textLow.includes(pattern),
            `G3 violation: message contains prescriptive pattern "${pattern}". Must locate, not prescribe.\n  Message: "${o.text}"`
          ).toBe(false);
        }
      }

      const result = scoreObservations(
        fixture.id,
        produced,
        fixture.expected,
        sectionTexts,
      );

      // On failure, print a detailed breakdown to help diagnose.
      if (result.precision !== 1 || result.recall !== 1) {
        console.error(`\n[${fixture.id}] Score breakdown:`);
        console.error(
          `  Produced (${produced.length}):`,
          produced.map((o) => `${o.type}@${o.blockId ?? "doc"}:"${o.text.slice(0, 60)}"`),
        );
        console.error(
          `  Expected (${fixture.expected.length}):`,
          fixture.expected.map((e) => `${e.type}@${e.sectionId ?? "doc"}${e.substring ? `:"${e.substring}"` : ""}`),
        );
        if (result.falsePositives.length > 0) {
          console.error(
            `  False positives:`,
            result.falsePositives.map((o) => `${o.type}@${o.blockId ?? "doc"}:"${o.text.slice(0, 60)}"`),
          );
        }
        if (result.falseNegatives.length > 0) {
          console.error(
            `  False negatives:`,
            result.falseNegatives.map((e) => `${e.type}@${e.sectionId ?? "doc"}${e.substring ? `:"${e.substring}"` : ""}`),
          );
        }
      }

      // NaN arises when both produced and expected are empty (0/0) — that's perfect.
      const precisionOk = Number.isNaN(result.precision) || result.precision === 1;
      const recallOk = Number.isNaN(result.recall) || result.recall === 1;

      expect(precisionOk, `precision for ${fixture.id} (got ${result.precision})`).toBe(true);
      expect(recallOk, `recall for ${fixture.id} (got ${result.recall})`).toBe(true);
    });
  }
});
