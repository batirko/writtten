import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "writtten";
const DB_VERSION = 2;

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
  sourceBlockId: string;
  text: string;
  kind: "commitment" | "fact_claim" | "definition" | "constraint" | "metric";
  status: "active" | "orphaned";
}

export interface Observation {
  id: string; // unique ID
  docId: string;
  type:
    | "clarity"
    | "contradiction"
    | "unsupported_claim"
    | "undefined_jargon"
    | "underexposed_topic"
    | "missing_topic"
    | "structure_flow"
    | "audience_mismatch";
  scope: "span" | "document";
  nature: "defect" | "opportunity";
  text: string;
  status: "active" | "auto_closed" | "dismissed" | "superseded";

  // Span mapping data
  blockId?: string;
  startOffset?: number;
  endOffset?: number;

  // Contradiction specifics
  conflictingBlockId?: string;
  conflictingStartOffset?: number;
  conflictingEndOffset?: number;
}

let _db: IDBPDatabase | null = null;

async function getDb(): Promise<IDBPDatabase> {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
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

  // 1. Delete existing active claims for this block
  const blockIndex = store.index("by_block");
  let cursor = await blockIndex.openCursor(IDBKeyRange.only(blockId));
  while (cursor) {
    await cursor.delete();
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

export async function updateObservationStatus(
  id: string,
  status: Observation["status"]
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("observations", "readwrite");
  const store = tx.store;
  const obs = await store.get(id);
  if (obs) {
    obs.status = status;
    await store.put(obs);
  }
  await tx.done;
}
