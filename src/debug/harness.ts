/**
 * Agent Acceptance Harness — Phase 1 observability primitives.
 *
 * Dev-only test/observability surface. See docs/projects/agent_acceptance_harness.md.
 *
 * Three primitives:
 *   1. A structured, monotonic event stream (console + in-memory ring buffer).
 *      Every meaningful lifecycle moment emits one event with a monotonic `seq`,
 *      so an agent can wait for "an event newer than the one I last saw" instead
 *      of grepping a string that also appears in history.
 *   2. A readiness signal: `pending` (0 == idle), pushed to UI subscribers.
 *   3. `window.__sidecar__` — read-only `getState()` / `getEvents()` so an agent
 *      can inspect live blocks, the claim ledger, active observations, pending
 *      count, active model, and last seq.
 *
 * Gating: call sites are wrapped in `if (import.meta.env.DEV)` so esbuild
 * dead-code-eliminates them (and this module) from the production build. No
 * server, telemetry, or egress — consistent with standing rule 5.
 *
 * "Observe, don't fabricate": this surfaces existing internal state only. It
 * never computes new product behaviour and never edits the user's prose.
 */

import {
  loadActiveClaimsForDocument,
  loadActiveObservationsForDocument,
  loadSuppressionsForDocument,
  saveClaimsForBlock,
  saveDismissalSuppression,
  type ClaimLedgerEntry,
  type DismissalSuppression,
  type Observation,
} from "../store/db";
import { nanoid } from "nanoid";
import {
  llmLogger,
  type LLMLogEntry,
  type SessionStats,
  type ApiStats,
  type ArchiveInfo,
} from "../model/logger";
import {
  setLlmMode,
  getLlmMode,
  loadRecordings,
  dumpRecordings,
  type LlmMode,
} from "../model/mock";

export type HarnessEventType =
  | "settle"
  | "request"
  | "response"
  | "retry"
  | "trigger"
  | "ledger-write"
  | "observation"
  | "archive"
  | "block-removed"
  | "error";

export interface HarnessEvent {
  seq: number;
  t: number;
  type: HarnessEventType;
  [field: string]: unknown;
}

export interface BlockSnapshot {
  id: string;
  text: string;
}

export interface SidecarState {
  seq: number;
  pending: number;
  blocks: BlockSnapshot[];
  ledger: ClaimLedgerEntry[];
  observations: Observation[];
  activeModel: string;
  suppressions: number;
  /** Session-level cost/latency stats (Phase 3). */
  sessionStats: SessionStats;
}

/** A document to install via loadDoc. `id` is optional — omit to let the
 *  BlockId plugin mint one. */
export interface DocFixture {
  blocks: Array<{ id?: string; text: string }>;
}

/** Claims to install directly into the ledger via loadLedger. */
export type LedgerFixture = Array<{
  blockId: string;
  text: string;
  kind: ClaimLedgerEntry["kind"];
}>;

/** Suppressions to seed directly, bypassing the dismissal UI. */
export type SuppressionsFixture = Array<{
  type: DismissalSuppression["type"];
  spanSignature?: string;
  note?: string;
}>;

type BlockReader = () => BlockSnapshot[];
type DocWriter = (fixture: DocFixture) => void;
type ClearFn = () => void;
type PendingListener = (pending: number) => void;

const MAX_EVENTS = 500;

function formatField(value: unknown): string {
  if (Array.isArray(value)) return `[${value.join(",")}]`;
  return String(value);
}

class Harness {
  private seq = 0;
  private events: HarnessEvent[] = [];
  private pending = 0;
  private pendingListeners = new Set<PendingListener>();
  private blockReader: BlockReader | null = null;
  private docWriter: DocWriter | null = null;
  private clearFn: ClearFn | null = null;
  private docId = "default";

  /** Append one structured event; mirror it to the console as a greppable line. */
  emit(type: HarnessEventType, fields: Record<string, unknown> = {}): void {
    llmLogger.log({ type: type as LLMLogEntry["type"], ...fields });
  }

  /** Called internally by llmLogger.setEventSyncHook to keep the agent stream in sync. */
  _syncFromLogger(type: string, fields: Record<string, unknown>): void {
    const event: HarnessEvent = {
      seq: ++this.seq,
      t: Date.now(),
      type: type as HarnessEventType,
      ...fields,
    };
    this.events.push(event);
    if (this.events.length > MAX_EVENTS) this.events.shift();

    const msgFields = { ...fields };
    delete msgFields.payload;
    const tail = Object.entries(msgFields)
      .map(([k, v]) => `${k}=${formatField(v)}`)
      .join(" ");
    console.log(`[sidecar] ${type} seq=${event.seq}${tail ? ` ${tail}` : ""}`);
  }

  /** Tail of the event stream: only events strictly newer than `sinceSeq`. */
  getEvents(sinceSeq = 0): HarnessEvent[] {
    return this.events.filter((e) => e.seq > sinceSeq);
  }

  /**
   * Record an observation leaving the active feed in BOTH logs at once: the
   * llmLogger archive record (for the human "Copy All" export) and the agent
   * event stream (so automated tests can also see closures). The single entry
   * point that keeps the two logs from diverging on archival.
   */
  archive(info: ArchiveInfo, evalId?: string): void {
    llmLogger.logArchive(info, evalId);
  }

  /** Current monotonic sequence number (last emitted event's seq). */
  currentSeq(): number {
    return this.seq;
  }

  // --- readiness signal ---

  setPending(n: number): void {
    if (n === this.pending) return;
    this.pending = n;
    for (const listener of this.pendingListeners) listener(n);
  }

  getPending(): number {
    return this.pending;
  }

  subscribePending(listener: PendingListener): () => void {
    this.pendingListeners.add(listener);
    listener(this.pending); // initial push
    return () => this.pendingListeners.delete(listener);
  }

  // --- live state wiring ---

  /** The editor registers a reader so getState() can return live blocks+text. */
  registerBlockReader(reader: BlockReader): void {
    this.blockReader = reader;
  }

  /** The editor registers a writer so loadDoc() can install a fixture document. */
  registerDocWriter(writer: DocWriter): void {
    this.docWriter = writer;
  }

  /** The app registers its clear handler so clear() skips the confirm modal. */
  registerClear(fn: ClearFn): void {
    this.clearFn = fn;
  }

  // --- write affordances (test-only; namespaced so they're never mistaken for
  //     product features — they manipulate *test setup*, never the user's prose
  //     on the user's behalf). ---

  /** Install a known document into the editor (replaces current content). */
  loadDoc(fixture: DocFixture): void {
    if (!this.docWriter) {
      console.warn("[sidecar] loadDoc: no editor registered");
      return;
    }
    this.docWriter(fixture);
  }

  /** Seed dismissal suppressions directly (e.g. to test that observations
   *  don't re-surface after dismissal). */
  async loadSuppressions(fixture: SuppressionsFixture): Promise<void> {
    for (const f of fixture) {
      await saveDismissalSuppression({
        id: nanoid(10),
        docId: this.docId,
        type: f.type,
        spanSignature: f.spanSignature,
        note: f.note,
      });
    }
  }

  /** Write claims straight into the ledger, grouped by block. Does not run an
   *  evaluation — it seeds state for logic tests. */
  async loadLedger(fixture: LedgerFixture): Promise<void> {
    const byBlock = new Map<string, Array<{ text: string; kind: ClaimLedgerEntry["kind"] }>>();
    for (const c of fixture) {
      const arr = byBlock.get(c.blockId) ?? [];
      arr.push({ text: c.text, kind: c.kind });
      byBlock.set(c.blockId, arr);
    }
    for (const [blockId, claims] of byBlock) {
      await saveClaimsForBlock(this.docId, blockId, claims);
    }
  }

  /** Clear the workspace without the confirm modal. */
  clear(): void {
    if (!this.clearFn) {
      console.warn("[sidecar] clear: no clear handler registered");
      return;
    }
    this.clearFn();
  }

  /** Read-only snapshot of everything an acceptance agent needs. Async: the
   *  ledger and observations live in IndexedDB. */
  async getState(): Promise<SidecarState> {
    const [ledger, observations, suppressions] = await Promise.all([
      loadActiveClaimsForDocument(this.docId),
      loadActiveObservationsForDocument(this.docId),
      loadSuppressionsForDocument(this.docId),
    ]);
    return {
      seq: this.seq,
      pending: this.pending,
      blocks: this.blockReader ? this.blockReader() : [],
      ledger,
      observations,
      activeModel: llmLogger.getActiveProvider(),
      suppressions: suppressions.length,
      sessionStats: llmLogger.getSessionStats(),
    };
  }

  /** Attach the read-only surface to `window`. Dev-only — call from a DEV guard. */
  install(opts: { docId: string }): void {
    this.docId = opts.docId;
    (window as unknown as { __sidecar__: unknown }).__sidecar__ = {
      // reads
      getState: () => this.getState(),
      getEvents: (sinceSeq?: number) => this.getEvents(sinceSeq),
      getApiStats: (): ApiStats => llmLogger.getApiStats(),
      // write affordances (test setup)
      clear: () => this.clear(),
      loadDoc: (fixture: DocFixture) => this.loadDoc(fixture),
      loadLedger: (fixture: LedgerFixture) => this.loadLedger(fixture),
      loadSuppressions: (fixture: SuppressionsFixture) => this.loadSuppressions(fixture),
      // LLM mock / record-replay
      setLlmMode: (mode: LlmMode) => setLlmMode(mode),
      getLlmMode: () => getLlmMode(),
      loadRecordings: (entries: Record<string, string>) => loadRecordings(entries),
      dumpRecordings: () => dumpRecordings(),
    };
  }

  /** Test-only: reset all state between unit tests. */
  _resetForTests(): void {
    this.seq = 0;
    this.events = [];
    this.pending = 0;
    this.pendingListeners.clear();
    this.blockReader = null;
    this.docWriter = null;
    this.clearFn = null;
    this.docId = "default";
  }
}

export const harness = new Harness();

if (import.meta.env.DEV) {
  llmLogger.setEventSyncHook((type, fields) => {
    harness._syncFromLogger(type, fields);
  });
}
