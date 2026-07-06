/**
 * Labeling-sheet parser for the V1 base-rate corpus study.
 *
 * Two flat CSVs, keyed by anonymised `doc_id`, are the durable artifacts this
 * study produces (docs/projects/field_validation.md § V1). Both are edited by
 * hand (tool-blind ground truth + human-verified verdicts), so this module only
 * *parses* them — it never writes, and the filled sheets stay local (invariant
 * #5). Pure and fs-free: the caller reads the file text and passes it in.
 *
 *   labels.csv    — tool-blind ground-truth conflict PAIRS (recall ground truth).
 *   emissions.csv — per-emission TP/FP adjudication (per-type wild precision).
 *
 * The `verified` column separates the AI first-pass draft (`false`) from
 * human-confirmed rows (`true`); callers can filter to verified-only so an
 * unreviewed draft never silently counts as evidence.
 */

import type { Observation } from "../../../../store/db";
import type { ExpectedObservation } from "../../types";
import { isDocType, type DocType } from "../loadCorpus";

/** Bucket 1 = strict logical contradiction (the hero measure); Bucket 2 = softer
 *  tension / inconsistency. Reported separately so the hero number stays clean. */
export type LabelBucket = 1 | 2;

/** One tool-blind ground-truth conflict pair from labels.csv. */
export interface LabelRow {
  docId: string;
  bucket: LabelBucket;
  /** Quoted text of the two conflicting spans. */
  spanA: string;
  spanB: string;
  /** Optional section-id anchors (informational; matching is span-based). */
  sectionA?: string;
  sectionB?: string;
  rationale: string;
  /** Human-verified (`true`) vs AI first-pass draft (`false`). */
  verified: boolean;
  /** Optional stratification tag; usually joined from the corpus by docId. */
  docType?: DocType;
}

/** One adjudicated tool emission from emissions.csv. */
export interface EmissionRow {
  docId: string;
  type: Observation["type"];
  /** The span the emission anchored to (or the message, for doc-scoped obs). */
  anchoredSpan: string;
  message: string;
  /** Human verdict: was this emission a true or false positive? */
  verdict: "tp" | "fp";
  verified: boolean;
  /** Stratification tag (written by the runner from the corpus doc's type). */
  docType?: DocType;
}

/** Parse an optional `doc_type` cell into a `DocType`, or undefined. */
function parseDocType(v: string | undefined): DocType | undefined {
  const t = (v ?? "").trim().toLowerCase();
  return isDocType(t) ? t : undefined;
}

// ---------------------------------------------------------------------------
// Minimal RFC-4180-ish CSV parser (handles quoted fields, embedded commas,
// newlines, and "" escapes). Kept local — no dependency added for a two-file
// format.
// ---------------------------------------------------------------------------
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  // Flush trailing field/row (unless the input ended on a clean newline).
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Map header names → column index, tolerant of surrounding whitespace/case. */
function headerIndex(header: string[]): Map<string, number> {
  const m = new Map<string, number>();
  header.forEach((h, i) => m.set(h.trim().toLowerCase(), i));
  return m;
}

function isBlankRow(cells: string[]): boolean {
  return cells.every((c) => c.trim() === "");
}

function parseBool(v: string | undefined): boolean {
  return (v ?? "").trim().toLowerCase() === "true";
}

/**
 * Parse labels.csv → typed rows. Unknown/blank/comment (`#`-prefixed doc_id)
 * lines are skipped. Throws on a missing required header so a malformed sheet
 * fails loudly rather than scoring against nothing.
 */
export function parseLabels(csv: string): LabelRow[] {
  const grid = parseCsv(csv).filter((r) => !isBlankRow(r));
  if (grid.length === 0) return [];
  const idx = headerIndex(grid[0]);
  for (const col of ["doc_id", "bucket", "span_a", "span_b"]) {
    if (!idx.has(col)) throw new Error(`labels.csv missing required column: ${col}`);
  }
  const get = (row: string[], col: string) => (row[idx.get(col)!] ?? "").trim();

  const out: LabelRow[] = [];
  for (const row of grid.slice(1)) {
    const docId = get(row, "doc_id");
    if (!docId || docId.startsWith("#")) continue; // skip comment/blank
    const bucketNum = Number(get(row, "bucket"));
    if (bucketNum !== 1 && bucketNum !== 2) continue; // skip un-bucketed rows
    out.push({
      docId,
      bucket: bucketNum as LabelBucket,
      spanA: get(row, "span_a"),
      spanB: get(row, "span_b"),
      sectionA: get(row, "section_a_id") || undefined,
      sectionB: get(row, "section_b_id") || undefined,
      rationale: get(row, "rationale"),
      verified: parseBool(get(row, "verified")),
      docType: parseDocType(get(row, "doc_type")),
    });
  }
  return out;
}

/** Parse emissions.csv → typed rows (rows with an unrecognised verdict skipped). */
export function parseEmissions(csv: string): EmissionRow[] {
  const grid = parseCsv(csv).filter((r) => !isBlankRow(r));
  if (grid.length === 0) return [];
  const idx = headerIndex(grid[0]);
  for (const col of ["doc_id", "obs_type", "verdict"]) {
    if (!idx.has(col)) throw new Error(`emissions.csv missing required column: ${col}`);
  }
  const get = (row: string[], col: string) => (row[idx.get(col)!] ?? "").trim();

  const out: EmissionRow[] = [];
  for (const row of grid.slice(1)) {
    const docId = get(row, "doc_id");
    if (!docId || docId.startsWith("#")) continue;
    const verdict = get(row, "verdict").toLowerCase();
    if (verdict !== "tp" && verdict !== "fp") continue; // skip un-adjudicated
    out.push({
      docId,
      type: get(row, "obs_type") as Observation["type"],
      anchoredSpan: get(row, "anchored_span"),
      message: get(row, "message"),
      verdict,
      verified: parseBool(get(row, "verified")),
      docType: parseDocType(get(row, "doc_type")),
    });
  }
  return out;
}

/**
 * Convert a ground-truth label row into an `ExpectedObservation`, so V3 and the
 * ratchet can reuse the sheet with the existing `scoreObservations` machinery.
 * Bucket 1 → `contradiction`, Bucket 2 → `strategic_tension`; `substring` uses
 * span A (the anchor), matching the case-insensitive containment rule in
 * evalScorer.matches().
 */
export function labelToExpected(row: LabelRow): ExpectedObservation {
  return {
    type: row.bucket === 1 ? "contradiction" : "strategic_tension",
    substring: row.spanA,
    note: row.rationale,
  };
}
