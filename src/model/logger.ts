import { nanoid } from "nanoid";

export interface LLMLogEntry {
  id: string;
  timestamp: Date;
  type:
    | "trigger"
    | "request"
    | "response"
    | "retry"
    | "error"
    | "archive"
    | "settle"
    | "ledger-write"
    | "observation"
    | "block-removed";
  /** "fast" or "strong" — only set on request/response entries. */
  tier?: "fast" | "strong";
  /** "free" or "paid" — which API key tier made this call. */
  keyTier?: "free" | "paid";
  model?: string;
  endpoint?: string;
  latencyMs?: number;
  statusCode?: number;
  payload?: {
    system: string;
    user: string;
  };
  response?: string;
  errorMessage?: string;
  usage?: {
    promptTokens: number;
    candidateTokens: number;
    totalTokens: number;
  };
  // Populated for "trigger" entries
  triggerKind?: string;
  blockId?: string;
  // --- debug-log redesign correlation fields (docs/projects/debug_log.md) ---
  /** Groups every record spawned by one trigger/eval pass into a causal unit. */
  evalId?: string;
  /** Joins request ↔ retries ↔ response/error of one logical LLM call. */
  callId?: string;
  /** Stable reference to the (static) system prompt — dereferenced on export. */
  promptRef?: string;
  /** Populated for "archive" entries: an observation left the active feed. */
  archive?: ArchiveInfo;
}

/**
 * Metadata for an observation leaving the active feed — the one record type the
 * old log could not produce. `actor` answers "who" (user vs. system) and
 * `reason` answers "why"; both were previously unknowable from the log.
 */
export interface ArchiveInfo {
  observationId: string;
  obsType: string;
  kind?: string;
  severity?: string;
  scope: "span" | "document";
  blockId?: string;
  /** The observation text, so an archive record reads standalone. */
  text: string;
  reason:
    | "dismissed"
    | "collapsed"
    | "auto_closed"
    | "superseded"
    | "resolved_prior"
    | "block_removed";
  actor: "user" | "system";
  /** observationId of the replacement, when reason = "superseded". */
  supersededBy?: string;
}

/**
 * What a single LLM call yielded — attached by the evaluator via `recordProduced`
 * and surfaced on the projected call record. Pre-reconcile yield (observation
 * types the model returned, ledger writes, resolved-prior indices), so a reader
 * sees a call's effect, not just its raw response string.
 */
export interface CallProduced {
  observations?: string[];
  ledgerWrites?: number;
  resolvedPrior?: number[];
}

/**
 * Session-level cost/latency stats, accumulated since app load.
 * Surfaced in `getState()` and the debug panel.
 */
export interface SessionStats {
  fastCalls: number;
  strongCalls: number;
  totalCalls: number;
  totalLatencyMs: number;
  /** Mean latency across all response calls that reported one (ms). */
  avgLatencyMs: number;
  totalPromptTokens: number;
  totalCandidateTokens: number;
  totalCost: number;
}

/**
 * Per-model quota/usage stats derived from the live request/response/error log.
 *
 * The binding free-tier constraint is requests-per-day (RPD) **per model**, not
 * RPM or TPM — the AI Studio dashboard foregrounds RPM/TPM, so 429s look
 * mysterious there. This surface buckets 429s by the actual `quotaId` Google
 * returns so an agent can see *which* quota is biting and how much daily budget
 * remains. See docs/projects/model_rotation_and_debugging.md §1-2.
 */
export interface ModelApiStats {
  model: string;
  /** Attempts dispatched (request entries). */
  requests: number;
  /** 200 responses. */
  successes: number;
  /** Non-200 responses + thrown errors. */
  errors: number;
  /** 429 responses (subset of errors). */
  rate429: number;
  /** 429s split by the violated quota dimension. */
  quota429: {
    perDay: number;
    perMinute: number;
    inputTokens: number;
    other: number;
  };
  /** Daily request cap: parsed from a 429 payload when seen, else a known default, else null. */
  dailyLimit: number | null;
  /** Successful calls in the current Pacific day (RPD resets at Pacific midnight). */
  successesToday: number;
  /** dailyLimit − successesToday, or null when the limit is unknown. */
  remainingToday: number | null;
  /** Last HTTP status seen for this model. */
  lastStatus: number | null;
  /** Last `retry-delay` (ms) Google asked for on a 429. */
  lastRetryDelayMs: number | null;
  avgLatencyMs: number;
  promptTokens: number;
  candidateTokens: number;
  cost: number;
}

export interface ApiStats {
  /** Pacific date key (YYYY-MM-DD) the per-day counts are bucketed under. */
  day: string;
  models: ModelApiStats[];
  totals: {
    requests: number;
    successes: number;
    errors: number;
    rate429: number;
    promptTokens: number;
    candidateTokens: number;
    cost: number;
  };
}

/**
 * Known free-tier daily request caps, used as a fallback until a model actually
 * 429s and reveals its `quotaValue`. Values reflect this project's key as shown
 * in AI Studio (most Flash variants = 20/day; pro = 0 = unavailable on free tier).
 * A dynamically parsed quotaValue always overrides these.
 */
const KNOWN_DAILY_RPD: Record<string, number> = {
  "gemini-2.5-pro": 0, // no free-tier quota; excluded from pool
  "gemini-2.5-flash": 20,
  "gemini-3.5-flash": 20,
  "gemini-2.5-flash-lite": 20,
  "gemini-3.1-flash-lite": 500, // 25× higher RPD — primary workhorse
  "gemini-2.0-flash": 0, // no free-tier quota (confirmed in AI Studio)
  "gemini-2.0-flash-lite": 0,
};

type Quota429Kind = "perDay" | "perMinute" | "inputTokens" | "other";

export interface Parsed429 {
  kinds: Quota429Kind[];
  /** quotaValue of a PerDay violation, when present. */
  dailyLimit: number | null;
  /** RetryInfo.retryDelay converted to ms, when present. */
  retryDelayMs: number | null;
}

/**
 * Parse a Gemini 429 response body for the violated quota dimensions, the daily
 * limit, and the requested retry delay. Returns null if the body isn't the
 * expected RESOURCE_EXHAUSTED shape.
 */
export function parse429(errorMessage: string | undefined): Parsed429 | null {
  if (!errorMessage) return null;
  let body: unknown;
  try {
    body = JSON.parse(errorMessage);
  } catch {
    return null;
  }
  const err = (body as { error?: Record<string, unknown> })?.error;
  if (!err) return null;
  const details = Array.isArray(err.details) ? (err.details as Record<string, unknown>[]) : [];

  const kinds = new Set<Quota429Kind>();
  let dailyLimit: number | null = null;
  let retryDelayMs: number | null = null;

  for (const d of details) {
    const atType = String(d["@type"] ?? "");
    if (atType.includes("QuotaFailure")) {
      const violations = Array.isArray(d.violations)
        ? (d.violations as Record<string, unknown>[])
        : [];
      for (const v of violations) {
        const id = String(v.quotaId ?? "");
        const metric = String(v.quotaMetric ?? "");
        if (metric.includes("input_token")) {
          kinds.add("inputTokens");
        } else if (id.includes("PerDay")) {
          kinds.add("perDay");
          const n = parseInt(String(v.quotaValue ?? ""), 10);
          if (!isNaN(n)) dailyLimit = n;
        } else if (id.includes("PerMinute")) {
          kinds.add("perMinute");
        } else {
          kinds.add("other");
        }
      }
    } else if (atType.includes("RetryInfo")) {
      const m = String(d.retryDelay ?? "").match(/([\d.]+)s/);
      if (m) retryDelayMs = Math.round(parseFloat(m[1]) * 1000);
    }
  }

  return { kinds: [...kinds], dailyLimit, retryDelayMs };
}

/** Current calendar day in Pacific time (where Gemini free-tier RPD resets). */
function pacificDayKey(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(d);
}

interface ModelAccum {
  requests: number;
  successes: number;
  errors: number;
  rate429: number;
  quota429: { perDay: number; perMinute: number; inputTokens: number; other: number };
  dailyLimit: number | null;
  lastStatus: number | null;
  lastRetryDelayMs: number | null;
  latencySum: number;
  latencyCount: number;
  /** successes keyed by Pacific day, so remaining-budget resets at Pacific midnight. */
  successesByDay: Map<string, number>;
  promptTokens: number;
  candidateTokens: number;
  cost: number;
}

function computeCost(
  model: string,
  keyTier: string,
  promptTokens: number,
  candidateTokens: number
): number {
  if (keyTier !== "paid") return 0;
  const isPro = model.includes("-pro");
  const pRate = isPro ? 1.25 : 0.075;
  const cRate = isPro ? 5.0 : 0.3;
  return (promptTokens / 1_000_000) * pRate + (candidateTokens / 1_000_000) * cRate;
}

function emptyAccum(): ModelAccum {
  return {
    requests: 0,
    successes: 0,
    errors: 0,
    rate429: 0,
    quota429: { perDay: 0, perMinute: 0, inputTokens: 0, other: 0 },
    dailyLimit: null,
    lastStatus: null,
    lastRetryDelayMs: null,
    latencySum: 0,
    latencyCount: 0,
    successesByDay: new Map(),
    promptTokens: 0,
    candidateTokens: 0,
    cost: 0,
  };
}

type LogCallback = (logs: LLMLogEntry[], activeProvider: string) => void;
type EventSyncHook = (type: string, fields: Record<string, unknown>) => void;

class LLMLogger {
  private logs: LLMLogEntry[] = [];
  private activeProvider = "gemini-2.0-flash";
  private listeners: Set<LogCallback> = new Set();
  private syncHook?: EventSyncHook;

  setEventSyncHook(hook: EventSyncHook) {
    this.syncHook = hook;
  }
  // Raw entries are append-only and pre-projection (request/response/retry are
  // separate rows), so the buffer holds ~3 rows per call. 120 keeps a realistic
  // bulk-paste session intact once the export projection merges them.
  private maxLogs = 120;
  // What each call produced, keyed by callId — attached out-of-band by the
  // evaluator so the projection can show a call's effect without mutating the
  // append-only log.
  private producedByCall = new Map<string, CallProduced>();

  // Session-level accumulators
  private _fastCalls = 0;
  private _strongCalls = 0;
  private _totalLatencyMs = 0;
  private _latencyCount = 0;
  private _totalPromptTokens = 0;
  private _totalCandidateTokens = 0;
  private _totalCost = 0;

  // Per-model quota/usage accumulators (keyed by model name)
  private _apiStats = new Map<string, ModelAccum>();

  private accumFor(model: string): ModelAccum {
    let a = this._apiStats.get(model);
    if (!a) {
      a = emptyAccum();
      this._apiStats.set(model, a);
    }
    return a;
  }

  subscribe(callback: LogCallback): () => void {
    this.listeners.add(callback);
    callback([...this.logs], this.activeProvider); // Initial state push
    return () => this.listeners.delete(callback);
  }

  private notify() {
    const logsCopy = [...this.logs];
    for (const listener of this.listeners) {
      listener(logsCopy, this.activeProvider);
    }
  }

  setActiveProvider(provider: string) {
    if (this.activeProvider !== provider) {
      this.activeProvider = provider;
      this.notify();
    }
  }

  getActiveProvider(): string {
    return this.activeProvider;
  }

  getSessionStats(): SessionStats {
    const totalCalls = this._fastCalls + this._strongCalls;
    return {
      fastCalls: this._fastCalls,
      strongCalls: this._strongCalls,
      totalCalls,
      totalLatencyMs: this._totalLatencyMs,
      avgLatencyMs:
        this._latencyCount > 0 ? Math.round(this._totalLatencyMs / this._latencyCount) : 0,
      totalPromptTokens: this._totalPromptTokens,
      totalCandidateTokens: this._totalCandidateTokens,
      totalCost: this._totalCost,
    };
  }

  /**
   * Per-model quota/usage snapshot derived from the live log. Sync, so it can
   * be read from `window.__sidecar__.getApiStats()` without awaiting IndexedDB.
   */
  getApiStats(): ApiStats {
    const day = pacificDayKey();
    const models: ModelApiStats[] = [];
    const totals = {
      requests: 0,
      successes: 0,
      errors: 0,
      rate429: 0,
      promptTokens: 0,
      candidateTokens: 0,
      cost: 0,
    };

    for (const [model, a] of this._apiStats) {
      const successesToday = a.successesByDay.get(day) ?? 0;
      const dailyLimit = a.dailyLimit ?? KNOWN_DAILY_RPD[model] ?? null;
      models.push({
        model,
        requests: a.requests,
        successes: a.successes,
        errors: a.errors,
        rate429: a.rate429,
        quota429: { ...a.quota429 },
        dailyLimit,
        successesToday,
        remainingToday: dailyLimit != null ? Math.max(0, dailyLimit - successesToday) : null,
        lastStatus: a.lastStatus,
        lastRetryDelayMs: a.lastRetryDelayMs,
        avgLatencyMs: a.latencyCount > 0 ? Math.round(a.latencySum / a.latencyCount) : 0,
        promptTokens: a.promptTokens,
        candidateTokens: a.candidateTokens,
        cost: a.cost,
      });
      totals.requests += a.requests;
      totals.successes += a.successes;
      totals.errors += a.errors;
      totals.rate429 += a.rate429;
      totals.promptTokens += a.promptTokens;
      totals.candidateTokens += a.candidateTokens;
      totals.cost += a.cost;
    }

    // Most-pressured models first: fewest remaining today, then most 429s.
    models.sort((x, y) => {
      const rx = x.remainingToday ?? Infinity;
      const ry = y.remainingToday ?? Infinity;
      if (rx !== ry) return rx - ry;
      return y.rate429 - x.rate429;
    });

    return { day, models, totals };
  }

  clearLogs(): void {
    this.logs = [];
    this._fastCalls = 0;
    this._strongCalls = 0;
    this._totalLatencyMs = 0;
    this._latencyCount = 0;
    this._totalPromptTokens = 0;
    this._totalCandidateTokens = 0;
    this._totalCost = 0;
    this._apiStats.clear();
    this.producedByCall.clear();
    this.notify();
  }

  /** Newest-first raw entries (for the panel) — copy, so callers can't mutate. */
  getLogs(): LLMLogEntry[] {
    return [...this.logs];
  }

  /** The produced-by-call map, for the export projection. */
  getProducedByCall(): Map<string, CallProduced> {
    return new Map(this.producedByCall);
  }

  /**
   * Record an observation leaving the active feed. Emitted from every status
   * transition (user dismiss/collapse + system auto-close/supersede/resolve).
   */
  logArchive(info: ArchiveInfo, evalId?: string): void {
    this.log({
      type: "archive",
      model: "",
      endpoint: "",
      payload: { system: "", user: "" },
      archive: info,
      evalId,
    });
  }

  /** Attribute what a call yielded back to its callId (merges if called twice). */
  recordProduced(callId: string | undefined, produced: CallProduced): void {
    if (!callId) return;
    const prev = this.producedByCall.get(callId) ?? {};
    this.producedByCall.set(callId, {
      observations: [...(prev.observations ?? []), ...(produced.observations ?? [])],
      ledgerWrites: (prev.ledgerWrites ?? 0) + (produced.ledgerWrites ?? 0),
      resolvedPrior: [...(prev.resolvedPrior ?? []), ...(produced.resolvedPrior ?? [])],
    });
  }

  log(entry: Omit<LLMLogEntry, "id" | "timestamp">) {
    const fullEntry: LLMLogEntry = {
      ...entry,
      id: nanoid(10),
      timestamp: new Date(),
    };

    // Accumulate session stats on successful response entries
    if (fullEntry.type === "response") {
      if (fullEntry.tier === "fast") this._fastCalls++;
      else if (fullEntry.tier === "strong") this._strongCalls++;
      if (fullEntry.latencyMs != null) {
        this._totalLatencyMs += fullEntry.latencyMs;
        this._latencyCount++;
      }
      if (fullEntry.usage) {
        this._totalPromptTokens += fullEntry.usage.promptTokens;
        this._totalCandidateTokens += fullEntry.usage.candidateTokens;
        const cost = computeCost(
          fullEntry.model || "",
          fullEntry.keyTier || "free",
          fullEntry.usage.promptTokens,
          fullEntry.usage.candidateTokens
        );
        this._totalCost += cost;
      }
    }

    // Accumulate per-model quota/usage stats. Skip synthetic entries with no
    // real model (e.g. the "none" pool-exhausted error, empty trigger models).
    const m = fullEntry.model;
    if (m && m !== "none") {
      const a = this.accumFor(m);
      if (fullEntry.type === "request") {
        a.requests++;
      } else if (fullEntry.type === "response") {
        a.successes++;
        a.lastStatus = fullEntry.statusCode ?? 200;
        const dayKey = pacificDayKey(fullEntry.timestamp);
        a.successesByDay.set(dayKey, (a.successesByDay.get(dayKey) ?? 0) + 1);
        if (fullEntry.latencyMs != null) {
          a.latencySum += fullEntry.latencyMs;
          a.latencyCount++;
        }
        if (fullEntry.usage) {
          a.promptTokens += fullEntry.usage.promptTokens;
          a.candidateTokens += fullEntry.usage.candidateTokens;
          a.cost += computeCost(
            m,
            fullEntry.keyTier || "free",
            fullEntry.usage.promptTokens,
            fullEntry.usage.candidateTokens
          );
        }
      } else if (fullEntry.type === "error") {
        a.errors++;
        if (fullEntry.statusCode != null) a.lastStatus = fullEntry.statusCode;
        if (fullEntry.statusCode === 429) {
          a.rate429++;
          const parsed = parse429(fullEntry.errorMessage);
          if (parsed) {
            for (const k of parsed.kinds) a.quota429[k]++;
            if (parsed.dailyLimit != null) a.dailyLimit = parsed.dailyLimit;
            if (parsed.retryDelayMs != null) a.lastRetryDelayMs = parsed.retryDelayMs;
          }
        }
      }
    }

    this.logs.unshift(fullEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }

    this.notify();
    if (this.syncHook) {
      const { id, timestamp, type, ...fields } = fullEntry;
      this.syncHook(type, fields);
    }
  }

  /** Test-only: clear accumulated per-model quota/usage stats. */
  _resetApiStatsForTests(): void {
    this._apiStats.clear();
  }
}

export const llmLogger = new LLMLogger();
