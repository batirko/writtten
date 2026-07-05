/**
 * Record helper — populate fixture recordings by running against the live model.
 *
 * This is a Vitest test file run via `npm run eval:record -- <fixtureId>`.
 * It runs inside Vitest so import.meta.env, vi.mock, and the full module
 * resolution work exactly as in the normal test environment.
 *
 * Usage (the fixture id is read from the EVAL_RECORD_ID env var — a bare
 * `-- <id>` positional does NOT work, vitest treats it as a filename filter):
 *   EVAL_RECORD_ID=contradiction-timeline npm run eval:record
 *   npm run eval:record            # no id → records the whole corpus
 *
 * Requires VITE_GEMINI_API_KEY in .env.local.
 *
 * What it does:
 *   1. Sets LLM mode to "record" (real API calls + captured to recordings map)
 *   2. Runs the fixture's sections via evaluateSection with the live API key
 *   3. Dumps the recordings map and writes it back into the fixture .ts file
 *
 * After running, commit the updated fixture file. The Tier 1 deterministic
 * test will then replay these recordings offline.
 *
 * Design: docs/projects/evaluator_quality_ratchet.md §Record helper
 */

import { describe, it, vi, beforeAll, afterAll } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateSection } from "../evaluator";
import * as db from "../../store/db";
import { setLlmMode, dumpRecordings, clearRecordings } from "../../model/mock";
import type { ClaimLedgerEntry } from "../../store/db";
import { corpus } from "./index";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Module-level mocks (same pattern as the ratchet test)
// ---------------------------------------------------------------------------
vi.mock("../model/gemini"); // NOT mocked here — we want real calls
// Actually we do NOT mock gemini in record mode — real calls go to the API.
// We only mock the DB to avoid IndexedDB.

vi.mock("../../store/db", () => ({
  saveBlockSummary: vi.fn(),
  loadBlockSummary: vi.fn(),
  saveClaimsForBlock: vi.fn(),
  loadActiveClaimsForDocument: vi.fn(),
  // OBS-027: evaluateSection now injects sibling-section context via this.
  // Without it recording throws before any call. runFixture wires no summary
  // store, so [] is correct (siblings come from the accumulating ledger).
  loadBlockSummariesForDocument: vi.fn(async () => []),
  saveObservation: vi.fn(),
  loadActiveObservationsForDocument: vi.fn(),
  updateObservationStatus: vi.fn(),
  loadSuppressionsForDocument: vi.fn(async () => []),
  saveDocEvalState: vi.fn(),
  loadDocEvalState: vi.fn(async () => undefined),
}));

vi.mock("nanoid", () => ({ nanoid: () => `obs-${Math.random().toString(36).slice(2, 7)}` }));

// ---------------------------------------------------------------------------
// In-memory DB state
// ---------------------------------------------------------------------------
const claimsStore: ClaimLedgerEntry[] = [];
let claimIdCounter = 1;

function resetDb() {
  claimsStore.length = 0;
  claimIdCounter = 1;
  vi.mocked(db.loadBlockSummary).mockResolvedValue(undefined);
  vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([]);
  vi.mocked(db.updateObservationStatus).mockResolvedValue(undefined as never);
  vi.mocked(db.saveBlockSummary).mockResolvedValue(undefined as never);
  vi.mocked(db.saveObservation).mockResolvedValue(undefined as never);
  vi.mocked(db.saveDocEvalState).mockResolvedValue(undefined as never);
  vi.mocked(db.loadDocEvalState).mockResolvedValue(undefined);
  vi.mocked(db.loadSuppressionsForDocument).mockResolvedValue([]);
  vi.mocked(db.saveClaimsForBlock).mockImplementation(
    async (docId: string, blockId: string, claims) => {
      const without = claimsStore.filter((c) => c.sourceBlockId !== blockId);
      claimsStore.length = 0;
      claimsStore.push(...without);
      for (const c of claims) {
        claimsStore.push({
          ...(c as Omit<ClaimLedgerEntry, "id" | "docId" | "sourceBlockId" | "status">),
          id: claimIdCounter++,
          docId,
          sourceBlockId: blockId,
          status: "active",
        });
      }
    }
  );
  vi.mocked(db.loadActiveClaimsForDocument).mockImplementation(async () => [...claimsStore]);
}

// ---------------------------------------------------------------------------
// Figure out which fixture(s) to record
// ---------------------------------------------------------------------------
const targetId = process.env.EVAL_RECORD_ID;
const fixturesToRecord =
  targetId === "--all" || !targetId ? corpus : corpus.filter((f) => f.id === targetId);

// ---------------------------------------------------------------------------
// Record each fixture
// ---------------------------------------------------------------------------
describe("eval:record — populate fixture recordings", () => {
  const apiKey = process.env.VITE_GEMINI_API_KEY;

  beforeAll(() => {
    if (!apiKey) {
      throw new Error("VITE_GEMINI_API_KEY is not set. Copy .env.local.example → .env.local.");
    }
  });

  afterAll(() => {
    setLlmMode("live");
  });

  for (const fixture of fixturesToRecord) {
    it(`record: ${fixture.id}`, async () => {
      resetDb();
      clearRecordings();
      setLlmMode("record");

      const docId = `record-${fixture.id}`;
      for (const section of fixture.sections) {
        await evaluateSection(
          docId,
          section.id,
          section.text,
          [{ blockId: section.id, text: section.text }],
          fixture.stage,
          apiKey,
          undefined,
          fixture.jargonAllowlist
        );
      }

      const recordings = dumpRecordings();
      const count = Object.keys(recordings).length;
      console.log(`  [${fixture.id}] captured ${count} recordings`);

      // Write recordings back into the fixture file
      const fixturePath = resolve(__dirname, `${fixture.id}.ts`);
      let source = readFileSync(fixturePath, "utf-8");

      const recordingsJson = JSON.stringify(recordings, null, 2);
      // Indent inner lines by 2 spaces to match fixture file style
      const indented = recordingsJson
        .split("\n")
        .map((line, i) => (i === 0 ? line : "  " + line))
        .join("\n");

      // Find and replace the `recordings:` block using a line-scanning approach
      // that correctly handles JSON string values containing `}` characters.
      // Strategy: find the line that starts `  recordings:`, then scan forward
      // counting brace depth to find the closing `}` of the object, and replace
      // the whole slice.
      const lines = source.split("\n");
      const startIdx = lines.findIndex((l) => /^\s{2}recordings\s*:/.test(l));
      if (startIdx === -1) {
        throw new Error(
          `Could not find 'recordings:' line in ${fixturePath}. ` +
            `Ensure the fixture has a recordings field.`
        );
      }

      // Find the end of the recordings value by tracking brace depth
      let depth = 0;
      let endIdx = startIdx;
      let inString = false;
      let escape = false;
      let started = false;
      outer: for (let i = startIdx; i < lines.length; i++) {
        const line = lines[i];
        for (let j = 0; j < line.length; j++) {
          const ch = line[j];
          if (escape) {
            escape = false;
            continue;
          }
          if (ch === "\\" && inString) {
            escape = true;
            continue;
          }
          if (ch === '"') {
            inString = !inString;
            continue;
          }
          if (inString) continue;
          if (ch === "{") {
            depth++;
            started = true;
          }
          if (ch === "}") {
            depth--;
            if (started && depth === 0) {
              endIdx = i;
              break outer;
            }
          }
        }
      }

      // Reconstruct source with the recordings block replaced
      const prefix = lines.slice(0, startIdx).join("\n");
      const suffix = lines.slice(endIdx + 1).join("\n");
      source = `${prefix}\n  recordings: ${indented},\n${suffix}`;

      writeFileSync(fixturePath, source, "utf-8");
      console.log(`  [${fixture.id}] written → ${fixturePath}`);
    }, 60_000); // 60s timeout for live API calls
  }
});
