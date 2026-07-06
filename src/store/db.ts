import { openDB, type IDBPDatabase } from "idb";
import { harness } from "../debug/harness";

const DB_NAME = "writtten";
const DB_VERSION = 9;

export interface DocumentRecord {
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any; // TipTap JSON
  updatedAt: number;
}

export interface BlockSummary {
  blockId: string;
  docId: string;
  summary: string;
  hash: string;
}

export interface ClaimLedgerEntry {
  id?: number;
  docId: string;
  /** The section's representative (heading / first) block — the claim's
   *  *membership* key, used for section filters, orphaning, and dirty-checks.
   *  NOT necessarily where the claim text lives (see `anchorBlockId`). */
  sourceBlockId: string;
  text: string;
  kind: "commitment" | "fact_claim" | "definition" | "constraint" | "metric";
  status: "active" | "orphaned";
  /** The *precise* block + offsets where this claim's text actually appears,
   *  resolved from the section members at extraction time (`anchorClaimsToMembers`).
   *  Lets contradiction/tension observations anchor to the real clause instead of
   *  the section heading. Absent when the claim text isn't a verbatim substring of
   *  any member (the LLM reworded it) — emit then falls back to `sourceBlockId` +
   *  whole-block. Optional/additive: existing (pre-fix) claims lack it and are
   *  re-derived on the next eval, so no DB migration is needed. */
  anchorBlockId?: string;
  anchorStartOffset?: number;
  anchorEndOffset?: number;
}

export interface Observation {
  id: string; // unique ID
  docId: string;
  type:
    | "clarity"
    | "contradiction"
    | "strategic_tension"
    | "unsupported_claim"
    | "undefined_jargon"
    | "underexposed_topic"
    | "missing_topic"
    | "structure_flow"
    | "audience_mismatch";
  scope: "span" | "document";
  /** Replaces the old `nature` field. Fixed, intrinsic to the observation type.
   *  `problem` = something is wrong/missing; `opportunity` = could be stronger;
   *  `reflection` = neutral structural mirror (Milestone D, not yet produced). */
  kind: "problem" | "opportunity" | "reflection";
  /** Per-instance urgency signal. Defaults to "medium"; Milestone B computes real values. */
  severity: "low" | "medium" | "high";
  /** How confident we are in this observation. Defaults to "medium"; Milestone B calibrates. */
  confidence: "low" | "medium" | "high";
  /** Computed sort key: higher = more urgent. Range [0, 3] once Milestone B lands; 0 until then. */
  priority: number;
  text: string;
  status: "active" | "auto_closed" | "dismissed" | "superseded";

  /** Absence-grace state (doc-scope reconciliation, T1b). `missCount` counts
   *  consecutive doc-idle runs this observation was absent from the regenerated
   *  set; it is reset to 0 whenever the observation is re-matched. A doc-scope
   *  orphan is only auto-closed once `missCount` reaches the grace threshold,
   *  so LLM sampling variance no longer silently drops still-true notes.
   *  `lastSeenAt` (ms epoch of last confirmation) is reserved so the grace
   *  policy can later switch to TTL/decay without another migration.
   *  See docs/projects/doc_scope_reconciliation.md. */
  missCount?: number;
  lastSeenAt?: number;

  // Span mapping data
  blockId?: string;
  startOffset?: number;
  endOffset?: number;
  /** Captured snapshot of the referenced span's text. Stored and shown in the
   *  archive today, but NOT yet used for matching across edits — suppression and
   *  highlight rebuild still key off raw offsets. Making this load-bearing for
   *  re-anchoring + suppression matching is `lifecycle_integrity` L5; the earlier
   *  "to allow matching across edits, resolving OBS-003" claim was aspirational
   *  (2026-06-10 code audit, drift #3). */
  anchorText?: string;

  // Contradiction specifics
  conflictingBlockId?: string;
  conflictingStartOffset?: number;
  conflictingEndOffset?: number;
  conflictingAnchorText?: string;

  /** Reason why the observation was closed, for archive trust */
  closureReason?: string;
}

export interface DismissalSuppression {
  id: string;
  docId: string;
  type: Observation["type"];
  kind?: Observation["kind"];
  severity?: Observation["severity"];
  /** "blockId:startOffset:endOffset" for span obs; absent for doc-level obs.
   *  Remains the fallback key when the anchor-text fields below are absent
   *  (legacy suppressions) or empty. */
  spanSignature?: string;
  /** Snapshot of the dismissed span's text (from the observation's `anchorText`).
   *  Load-bearing for matching across edits: a span-level suppression matches a
   *  fresh observation by (blockId + normalized anchorText), so a dismissal holds
   *  when surrounding edits shift offsets. Empty string / undefined → offset
   *  fallback. See lifecycle_integrity L5. */
  anchorText?: string;
  /** Snapshot of the conflicting span's text, for contradiction/strategic_tension. */
  conflictingAnchorText?: string;
  /** Order-independent block-pair key (`${type}::${lo}|${hi}`) for
   *  contradiction/strategic_tension. Lets a dismissed conflict suppress both
   *  the per-section re-emission (precise offsets) and the ledger-sweep
   *  re-emission (whole-block 0:9999) of the same logical conflict. */
  conflictPairKey?: string;
  note?: string;
}

let _db: IDBPDatabase | null = null;

async function getDb(): Promise<IDBPDatabase> {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
    async upgrade(db, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
        db.createObjectStore("documents", { keyPath: "id" });
      }
      if (oldVersion < 2) {
        db.createObjectStore("block_summaries", { keyPath: "blockId" });

        const claimStore = db.createObjectStore("claim_ledger", {
          keyPath: "id",
          autoIncrement: true,
        });
        claimStore.createIndex("by_doc", "docId");
        claimStore.createIndex("by_block", "sourceBlockId");

        const obsStore = db.createObjectStore("observations", { keyPath: "id" });
        obsStore.createIndex("by_doc", "docId");
        obsStore.createIndex("by_status", "status");
      }
      if (oldVersion < 3) {
        // Add docId index to block_summaries so we can load all summaries for a doc
        transaction.objectStore("block_summaries").createIndex("by_doc", "docId");

        const supStore = db.createObjectStore("dismissal_suppressions", { keyPath: "id" });
        supStore.createIndex("by_doc", "docId");
      }
      if (oldVersion < 4) {
        // Per-doc hash of the last doc-level eval inputs, for the dirty-check
        // that skips redundant doc-level LLM calls.
        db.createObjectStore("doc_eval_state", { keyPath: "docId" });
      }
      if (oldVersion < 5) {
        // Data-backfill migration: rename `nature` → `kind` and add the three
        // new per-instance metadata axes (severity, confidence, priority).
        // `defect` → `problem`; `opportunity` stays `opportunity`.
        // New axes default to neutral values; Milestone B will compute real ones.
        const obsStore = transaction.objectStore("observations");
        let cursor = await obsStore.openCursor();
        while (cursor) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const record = cursor.value as any;
          if ("nature" in record) {
            record.kind = record.nature === "defect" ? "problem" : "opportunity";
            delete record.nature;
          }
          if (!("severity" in record)) record.severity = "medium";
          if (!("confidence" in record)) record.confidence = "medium";
          if (!("priority" in record)) record.priority = 0;
          await cursor.update(record);
          cursor = await cursor.continue();
        }
      }
      if (oldVersion < 6) {
        // G1: Data-backfill migration: assign default `kind` and `severity`
        // to existing dismissal suppressions so they retain legacy category-wide behavior
        // if they were dismissed before this field existed.
        const supStore = transaction.objectStore("dismissal_suppressions");
        let cursor = await supStore.openCursor();
        while (cursor) {
          const sup = cursor.value;
          if (!("severity" in sup)) sup.severity = "medium";
          if (!("kind" in sup)) sup.kind = "problem";
          await cursor.update(sup);
          cursor = await cursor.continue();
        }
      }
      if (oldVersion < 7) {
        // T1b: Data-backfill migration for the doc-scope absence-grace counter.
        // Existing observations have never been "missed", so seed missCount = 0.
        const obsStore = transaction.objectStore("observations");
        let cursor = await obsStore.openCursor();
        while (cursor) {
          const record = cursor.value;
          if (!("missCount" in record)) record.missCount = 0;
          await cursor.update(record);
          cursor = await cursor.continue();
        }
      }
      if (oldVersion < 8) {
        // R3b: Add anchorText, conflictingAnchorText, and closureReason fields
        const obsStore = transaction.objectStore("observations");
        let cursor = await obsStore.openCursor();
        while (cursor) {
          const record = cursor.value;
          if (!("anchorText" in record)) record.anchorText = "";
          if (!("conflictingAnchorText" in record)) record.conflictingAnchorText = "";
          if (!("closureReason" in record)) record.closureReason = "";
          await cursor.update(record);
          cursor = await cursor.continue();
        }
      }
      if (oldVersion < 9) {
        // L5: DismissalSuppression gained anchorText / conflictingAnchorText /
        // conflictPairKey for edit-resilient matching. No backfill: legacy
        // suppressions keep these undefined and continue to match on
        // spanSignature (offset fallback). The version bump is required because
        // new code writes the new shape; no object-store/index changes needed.
      }
    },
  });
  return _db;
}

// Documents
export async function saveDocument(doc: DocumentRecord): Promise<void> {
  const db = await getDb();
  await db.put("documents", doc);
}

export async function loadDocument(id: string): Promise<DocumentRecord | undefined> {
  const db = await getDb();
  return db.get("documents", id);
}

// Block Summaries
export async function saveBlockSummary(summary: BlockSummary): Promise<void> {
  const db = await getDb();
  await db.put("block_summaries", summary);
}

export async function loadBlockSummary(blockId: string): Promise<BlockSummary | undefined> {
  const db = await getDb();
  return db.get("block_summaries", blockId);
}

export async function deleteBlockSummary(blockId: string): Promise<void> {
  const db = await getDb();
  await db.delete("block_summaries", blockId);
}

// Claim Ledger
export async function saveClaimsForBlock(
  docId: string,
  blockId: string,
  claims: Omit<ClaimLedgerEntry, "id" | "docId" | "sourceBlockId" | "status">[]
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("claim_ledger", "readwrite");
  const store = tx.store;

  // 1. Delete existing active claims for this block (count them — a prior
  //    occupant means this write *overwrites* rather than inserts; the
  //    block-id-collision bug shows up here as an unexpected overwrite).
  const blockIndex = store.index("by_block");
  let deleted = 0;
  let cursor = await blockIndex.openCursor(IDBKeyRange.only(blockId));
  while (cursor) {
    await cursor.delete();
    deleted++;
    cursor = await cursor.continue();
  }

  // 2. Insert new claims
  for (const claim of claims) {
    await store.add({
      ...claim,
      docId,
      sourceBlockId: blockId,
      status: "active",
    });
  }

  await tx.done;

  if (import.meta.env.DEV) {
    harness.emit("ledger-write", {
      block: blockId,
      action: deleted > 0 ? "overwrite" : "insert",
      claims: claims.length,
    });
  }
}

export async function orphanClaimsForBlock(blockId: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("claim_ledger", "readwrite");
  const store = tx.store;
  const blockIndex = store.index("by_block");

  let cursor = await blockIndex.openCursor(IDBKeyRange.only(blockId));
  while (cursor) {
    const value = cursor.value;
    value.status = "orphaned";
    await cursor.update(value);
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function loadActiveClaimsForDocument(docId: string): Promise<ClaimLedgerEntry[]> {
  const db = await getDb();
  const tx = db.transaction("claim_ledger", "readonly");
  const store = tx.store;
  const docIndex = store.index("by_doc");

  const results: ClaimLedgerEntry[] = [];
  let cursor = await docIndex.openCursor(IDBKeyRange.only(docId));
  while (cursor) {
    if (cursor.value.status === "active") {
      results.push(cursor.value);
    }
    cursor = await cursor.continue();
  }
  return results;
}

// Observations
export async function saveObservation(obs: Observation): Promise<void> {
  const db = await getDb();
  await db.put("observations", obs);
}

export async function loadObservation(id: string): Promise<Observation | undefined> {
  const db = await getDb();
  return db.get("observations", id);
}

export async function loadObservationsForDocument(docId: string): Promise<Observation[]> {
  const db = await getDb();
  const tx = db.transaction("observations", "readonly");
  const store = tx.store;
  const docIndex = store.index("by_doc");

  const results: Observation[] = [];
  let cursor = await docIndex.openCursor(IDBKeyRange.only(docId));
  while (cursor) {
    results.push(cursor.value);
    cursor = await cursor.continue();
  }
  return results;
}

export async function loadActiveObservationsForDocument(docId: string): Promise<Observation[]> {
  const db = await getDb();
  const tx = db.transaction("observations", "readonly");
  const store = tx.store;
  const docIndex = store.index("by_doc");

  const results: Observation[] = [];
  let cursor = await docIndex.openCursor(IDBKeyRange.only(docId));
  while (cursor) {
    if (cursor.value.status === "active") {
      results.push(cursor.value);
    }
    cursor = await cursor.continue();
  }
  return results;
}

export async function clearDocumentData(docId: string): Promise<void> {
  const db = await getDb();

  await db.delete("documents", docId);

  {
    const tx = db.transaction("block_summaries", "readwrite");
    const docIndex = tx.store.index("by_doc");
    let cursor = await docIndex.openCursor(IDBKeyRange.only(docId));
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  }

  {
    const tx = db.transaction("claim_ledger", "readwrite");
    const docIndex = tx.store.index("by_doc");
    let cursor = await docIndex.openCursor(IDBKeyRange.only(docId));
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  }

  {
    const tx = db.transaction("observations", "readwrite");
    const docIndex = tx.store.index("by_doc");
    let cursor = await docIndex.openCursor(IDBKeyRange.only(docId));
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  }

  {
    const tx = db.transaction("dismissal_suppressions", "readwrite");
    const docIndex = tx.store.index("by_doc");
    let cursor = await docIndex.openCursor(IDBKeyRange.only(docId));
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  }

  await db.delete("doc_eval_state", docId);
  // The bootstrap sweep keys its dirty-check under `${docId}::sweep` (see
  // evaluator.ts), so clear it too — otherwise a re-paste of an identically
  // hashing draft would skip the sweep.
  await db.delete("doc_eval_state", `${docId}::sweep`);
}

// Doc-level eval dirty-check: remember the hash of the inputs (block summaries +
// claim ledger) the last doc-level review ran against, so we can skip a
// redundant strong-tier call when nothing relevant changed.
export async function saveDocEvalState(docId: string, hash: string): Promise<void> {
  const db = await getDb();
  await db.put("doc_eval_state", { docId, hash });
}

export async function loadDocEvalState(docId: string): Promise<string | undefined> {
  const db = await getDb();
  const rec = (await db.get("doc_eval_state", docId)) as
    | { docId: string; hash: string }
    | undefined;
  return rec?.hash;
}

export async function updateObservationStatus(
  id: string,
  status: Observation["status"],
  closureReason?: string
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("observations", "readwrite");
  const store = tx.store;
  const obs = await store.get(id);
  if (obs) {
    obs.status = status;
    if (closureReason !== undefined) obs.closureReason = closureReason;
    await store.put(obs);
  }
  await tx.done;
}

/** Re-activate a previously-closed observation by its original id, clearing
 *  the closure reason and refreshing lastSeenAt. Used by revert-aware
 *  evaluation (Mechanism 2) to restore a card exactly as it was — same id, no
 *  archive churn, no feed flicker — when the document returns to a text state
 *  that was already evaluated. See docs/projects/revert_aware_evaluation.md. */
export async function reactivateObservation(id: string, lastSeenAt: number): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("observations", "readwrite");
  const store = tx.store;
  const obs = await store.get(id);
  if (obs) {
    obs.status = "active";
    delete obs.closureReason;
    obs.lastSeenAt = lastSeenAt;
    await store.put(obs);
  }
  await tx.done;
}

// Block Summaries (by doc)
export async function loadBlockSummariesForDocument(docId: string): Promise<BlockSummary[]> {
  const db = await getDb();
  const tx = db.transaction("block_summaries", "readonly");
  const docIndex = tx.store.index("by_doc");
  const results: BlockSummary[] = [];
  let cursor = await docIndex.openCursor(IDBKeyRange.only(docId));
  while (cursor) {
    results.push(cursor.value);
    cursor = await cursor.continue();
  }
  return results;
}

// Dismissal Suppressions
export async function saveDismissalSuppression(sup: DismissalSuppression): Promise<void> {
  const db = await getDb();
  await db.put("dismissal_suppressions", sup);
}

/** Delete a single dismissal suppression by id. Used by the C3 dismiss-Undo
 *  toast to roll back the suppression written on dismiss, so an accidental
 *  dismiss never silently trains the feed quieter (the G1 flattery-resistance
 *  concern). See docs/projects/ui_interaction_mechanics.md § C3. */
export async function deleteDismissalSuppression(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("dismissal_suppressions", id);
}

export async function loadSuppressionsForDocument(docId: string): Promise<DismissalSuppression[]> {
  const db = await getDb();
  const tx = db.transaction("dismissal_suppressions", "readonly");
  const docIndex = tx.store.index("by_doc");
  const results: DismissalSuppression[] = [];
  let cursor = await docIndex.openCursor(IDBKeyRange.only(docId));
  while (cursor) {
    results.push(cursor.value);
    cursor = await cursor.continue();
  }
  return results;
}
