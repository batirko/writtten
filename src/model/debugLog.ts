/**
 * Debug-log projection — turns the append-only raw entry stream into the
 * call-centric, self-describing export envelope. See docs/projects/debug_log.md.
 *
 * Pure and side-effect-free: `buildEnvelope` takes a snapshot of raw entries
 * (+ the produced-by-call map) and returns the envelope. All the "make it
 * legible" work lives here so it can be unit-tested without a logger instance:
 *   - merge each call's request / retries / response|error into ONE record;
 *   - dereference the static system prompt into a `systemPrompts` dictionary;
 *   - dereference the static defined-terms glossary out of the user content;
 *   - order chronologically (raw entries are stored newest-first);
 *   - carry trigger and archive records inline so cause → call → effect read
 *     as one stream.
 */

import type { LLMLogEntry, CallProduced, AgentEventInfo } from "./logger";

/** 3: adds `agent` records + `counts.agentEvents` (BYOA sessions were invisible
 *  — an agent pass produced observations and exported `calls: 0, archives: 0`). */
const SCHEMA_VERSION = 3;

/**
 * Ensure API keys never leak in the exported log envelope. Second layer of a
 * defence-in-depth: the endpoint URL's key is already masked to `<free>`/`<paid>`
 * at log time (`rotation.ts`), and `endpoint` is dropped from the envelope
 * entirely — this catches keys that ride in *free-text* fields instead: a raw
 * error body, a system prompt, or a key a user pasted into the document itself.
 *
 * Three shapes, covering every provider writtten talks to:
 *   - `key=<secret>` — the Gemini URL query-param form (and any `key=` form).
 *   - a bare Google API key (`AIza…`) sitting in prose (e.g. pasted into a draft).
 *   - an OpenAI / Anthropic secret key (`sk-…`, `sk-proj-…`, `sk-ant-…`).
 * The `\b` anchors on the bare forms keep ordinary prose ("task-", "risk-") from
 * being mangled — a real secret is always at a token boundary.
 */
export function redactKeys(str: string | undefined): string | undefined {
  if (!str) return str;
  return str
    .replace(/key=([A-Za-z0-9_-]{20,})/g, "key=<REDACTED>")
    .replace(/\bAIza[0-9A-Za-z_-]{16,}/g, "<REDACTED>")
    .replace(/\bsk-[A-Za-z0-9_-]{16,}/g, "<REDACTED>");
}

/** Header so a pasted log is self-describing — no out-of-band context needed. */
export interface DebugEnvelopeMeta {
  schemaVersion: number;
  capturedAt: string;
  llmMode: string;
  activeProvider: string;
  /** Legend of the trigger kinds present in this capture. */
  triggerKinds: string[];
  /** `agentEvents` reads 0 on an ordinary session and is the tell that a BYOA
   *  session actually recorded its engine — the counter whose absence made a
   *  7-observation agent pass export as `{ triggers: 88, calls: 0 }`. */
  counts: { triggers: number; calls: number; archives: number; agentEvents: number };
}

export interface CallAttempt {
  model: string;
  status: number | "timeout" | "pending";
  latencyMs?: number;
  retryDelayMs?: number;
  error?: string;
}

export interface TriggerRecord {
  kind: "trigger";
  t: string;
  evalId?: string;
  triggerKind?: string;
  blockId?: string;
}

export interface CallRecord {
  kind: "call";
  t: string;
  evalId?: string;
  callId?: string;
  tier?: "fast" | "strong";
  keyTier?: "free" | "paid";
  promptRef?: string;
  /** Variable user content, with the static glossary dereferenced to a token. */
  user?: string;
  attempts: CallAttempt[];
  status: number | "timeout" | "pending";
  latencyMs?: number;
  response?: string;
  produced?: CallProduced;
  usage?: {
    promptTokens: number;
    candidateTokens: number;
    totalTokens: number;
  };
}

export interface ArchiveRecord {
  kind: "archive";
  t: string;
  evalId?: string;
  observationId: string;
  obsType: string;
  obsKind?: string;
  severity?: string;
  scope: "span" | "document";
  blockId?: string;
  text: string;
  reason: string;
  actor: "user" | "system";
  supersededBy?: string;
}

/** One event from the BYOA bridge — the second engine, previously unlogged. */
export interface AgentRecord extends AgentEventInfo {
  kind: "agent";
  t: string;
}

export interface GenericHarnessRecord {
  kind: "harness";
  t: string;
  eventType: string;
  fields: Record<string, unknown>;
}

export type DebugRecord =
  | TriggerRecord
  | CallRecord
  | ArchiveRecord
  | AgentRecord
  | GenericHarnessRecord;

export interface DebugEnvelope {
  meta: DebugEnvelopeMeta;
  /** Each static system prompt stored exactly once, keyed by its promptRef. */
  systemPrompts: Record<string, string>;
  /** The static defined-terms glossary, stored once if any call carried it. */
  glossary?: string[];
  log: DebugRecord[];
}

function hash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const GLOSSARY_RE = /Defined terms \(do not flag as undefined jargon\):\n((?:- .*(?:\n|$))+)/;
const GLOSSARY_TOKEN = "{{glossary}}";

/** Extract the defined-terms list from user content, if present. */
function extractGlossary(user: string): string[] | null {
  const m = user.match(GLOSSARY_RE);
  if (!m) return null;
  return m[1]
    .split("\n")
    .map((l) => l.replace(/^- /, "").trim())
    .filter(Boolean);
}

/**
 * Whether an entry is a real Gemini call leg (vs. trigger/archive/lifecycle).
 *
 * The type string alone is ambiguous: the evaluator emits *semantic* lifecycle
 * events `harness.emit("request"/"response", { block, tier })` that share those
 * type strings but describe "I'm evaluating this section" / "I got a result" —
 * they carry no `callId`, `model`, or `payload`. Keying those by a synthetic id
 * fabricated an empty `{ model: "", status: "pending" }` call record per event.
 * A real HTTP leg always carries at least one of `callId` / `payload` / `model`
 * (live legs mint a `callId`; legacy pre-correlation legs still had model+payload),
 * so require that. Lifecycle request/response events fall through to the generic
 * harness bucket instead.
 */
function isCallLeg(e: LLMLogEntry): boolean {
  const isLegType =
    e.type === "request" || e.type === "response" || e.type === "retry" || e.type === "error";
  return isLegType && Boolean(e.callId || e.payload || e.model);
}

/**
 * Project raw entries into the export envelope. `entries` may be in any order
 * (the logger stores newest-first); output is chronological.
 */
export function buildEnvelope(
  entries: LLMLogEntry[],
  producedByCall: Map<string, CallProduced>,
  context: { llmMode: string; activeProvider: string } = { llmMode: "live", activeProvider: "" }
): DebugEnvelope {
  // Chronological — raw entries arrive newest-first.
  const chron = [...entries].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const systemPrompts: Record<string, string> = {};
  let glossary: string[] | null = null;

  // Resolve a stable promptRef for an entry, registering its system text once.
  const refFor = (e: LLMLogEntry): string | undefined => {
    const sys = e.payload?.system;
    if (!sys) return e.promptRef;
    const ref = e.promptRef ?? `sys-${hash(sys)}`;
    if (!(ref in systemPrompts)) systemPrompts[ref] = redactKeys(sys)!;
    return ref;
  };

  // Replace the static glossary list in user content with a token, capturing it
  // once. Only collapse when it matches the canonical glossary, so calls with a
  // divergent allow-list keep their list inline rather than being misrepresented.
  const dereferenceUser = (user: string): string => {
    const found = extractGlossary(user);
    if (!found) return user;
    if (!glossary) glossary = found;
    if (JSON.stringify(found) === JSON.stringify(glossary)) {
      return user.replace(
        GLOSSARY_RE,
        `Defined terms (do not flag as undefined jargon):\n${GLOSSARY_TOKEN}\n`
      );
    }
    return user;
  };

  // The user content is author-written text, so it can contain a key the user
  // pasted into the draft — redact before it enters the envelope. (Glossary
  // dereference first, then redact; the two are disjoint.)
  const cleanUser = (user: string): string => redactKeys(dereferenceUser(user))!;

  // First pass: assemble call records keyed by callId, preserving first-seen order.
  const calls = new Map<string, CallRecord>();
  const callOrder: string[] = [];
  // A "retry" leg announces the backoff before the *next* attempt's request, so
  // its delay is stashed and applied to the upcoming attempt, not the prior one.
  const pendingRetry = new Map<string, number>();

  const records: DebugRecord[] = [];
  const triggerKinds = new Set<string>();

  for (const e of chron) {
    const ts = e.timestamp.toISOString();

    if (e.type === "trigger") {
      if (e.triggerKind) triggerKinds.add(e.triggerKind);
      records.push({
        kind: "trigger",
        t: ts,
        evalId: e.evalId,
        triggerKind: e.triggerKind,
        blockId: e.blockId || undefined,
      });
      continue;
    }

    if (e.type === "agent" && e.agent) {
      records.push({ kind: "agent", t: ts, ...e.agent });
      continue;
    }

    if (e.type === "archive" && e.archive) {
      const a = e.archive;
      records.push({
        kind: "archive",
        t: ts,
        evalId: e.evalId,
        observationId: a.observationId,
        obsType: a.obsType,
        obsKind: a.kind,
        severity: a.severity,
        scope: a.scope,
        blockId: a.blockId,
        text: a.text,
        reason: a.reason,
        actor: a.actor,
        supersededBy: a.supersededBy,
      });
      continue;
    }

    if (!isCallLeg(e)) {
      const {
        type,
        id,
        timestamp,
        tier,
        keyTier,
        model,
        endpoint,
        latencyMs,
        statusCode,
        payload,
        response,
        errorMessage,
        triggerKind,
        blockId,
        evalId,
        callId,
        promptRef,
        archive,
        usage,
        ...fields
      } = e as unknown as Record<string, unknown>;
      records.push({
        kind: "harness",
        t: ts,
        eventType: e.type,
        fields,
      });
      continue;
    }

    // Group by callId; fall back to a per-entry synthetic key for legacy entries
    // that predate correlation ids, so they still surface (each as its own call).
    const key = e.callId ?? `legacy-${e.id}`;
    let call = calls.get(key);
    if (!call) {
      call = {
        kind: "call",
        t: ts,
        evalId: e.evalId,
        callId: e.callId,
        tier: e.tier,
        keyTier: e.keyTier,
        promptRef: refFor(e),
        user: e.payload?.user ? cleanUser(e.payload.user) : undefined,
        attempts: [],
        status: "pending",
      };
      calls.set(key, call);
      callOrder.push(key);
      records.push(call); // placeholder slot; mutated below in chronological order
    }
    // Keep the best-known promptRef / user / tier as legs arrive.
    if (!call.promptRef) call.promptRef = refFor(e);
    if (!call.user && e.payload?.user) call.user = cleanUser(e.payload.user);
    if (!call.tier && e.tier) call.tier = e.tier;
    if (!call.keyTier && e.keyTier) call.keyTier = e.keyTier;

    if (e.type === "request") {
      const attempt: CallAttempt = { model: e.model || "", status: "pending" };
      const delay = pendingRetry.get(key);
      if (delay != null) {
        attempt.retryDelayMs = delay;
        pendingRetry.delete(key);
      }
      call.attempts.push(attempt);
    } else if (e.type === "retry") {
      if (e.latencyMs != null) pendingRetry.set(key, e.latencyMs);
    } else if (e.type === "response") {
      const last = call.attempts[call.attempts.length - 1];
      if (last) {
        last.status = e.statusCode ?? 200;
        last.latencyMs = e.latencyMs;
      } else {
        call.attempts.push({
          model: e.model || "",
          status: e.statusCode ?? 200,
          latencyMs: e.latencyMs,
        });
      }
      call.status = e.statusCode ?? 200;
      call.latencyMs = e.latencyMs;
      call.response = redactKeys(e.response);
      if (e.usage) call.usage = e.usage;
    } else if (e.type === "error") {
      const last = call.attempts[call.attempts.length - 1];
      const status = e.statusCode ?? "timeout";
      if (last) {
        last.status = status;
        last.latencyMs = e.latencyMs;
        last.error = redactKeys(e.errorMessage);
      } else {
        call.attempts.push({
          model: e.model || "",
          status,
          latencyMs: e.latencyMs,
          error: redactKeys(e.errorMessage),
        });
      }
      call.status = status;
      call.latencyMs = e.latencyMs;
    }
  }

  // Attach produced effects now that every call leg is folded in.
  for (const key of callOrder) {
    const call = calls.get(key)!;
    if (call.callId) {
      const produced = producedByCall.get(call.callId);
      if (produced) call.produced = produced;
    }
  }

  return {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      capturedAt: new Date().toISOString(),
      llmMode: context.llmMode,
      activeProvider: context.activeProvider,
      triggerKinds: [...triggerKinds],
      counts: {
        triggers: records.filter((r) => r.kind === "trigger").length,
        calls: callOrder.length,
        archives: records.filter((r) => r.kind === "archive").length,
        agentEvents: records.filter((r) => r.kind === "agent").length,
      },
    },
    systemPrompts,
    glossary: glossary ?? undefined,
    log: records,
  };
}
