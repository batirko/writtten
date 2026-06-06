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

import type { LLMLogEntry, CallProduced } from "./logger";

const SCHEMA_VERSION = 2;

/** Ensure API keys (e.g. from raw error messages) never leak in the export. */
export function redactKeys(str: string | undefined): string | undefined {
  if (!str) return str;
  return str.replace(/key=([A-Za-z0-9_-]{20,})/g, "key=<REDACTED>");
}

/** Header so a pasted log is self-describing — no out-of-band context needed. */
export interface DebugEnvelopeMeta {
  schemaVersion: number;
  capturedAt: string;
  llmMode: string;
  activeProvider: string;
  /** Legend of the trigger kinds present in this capture. */
  triggerKinds: string[];
  counts: { triggers: number; calls: number; archives: number };
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

export interface GenericHarnessRecord {
  kind: "harness";
  t: string;
  eventType: string;
  fields: Record<string, unknown>;
}

export type DebugRecord = TriggerRecord | CallRecord | ArchiveRecord | GenericHarnessRecord;

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

/** Whether an entry represents a single LLM call leg (vs. trigger/archive). */
function isCallLeg(type: LLMLogEntry["type"]): boolean {
  return type === "request" || type === "response" || type === "retry" || type === "error";
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
      return user.replace(GLOSSARY_RE, `Defined terms (do not flag as undefined jargon):\n${GLOSSARY_TOKEN}\n`);
    }
    return user;
  };

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

    if (!isCallLeg(e.type)) {
      const { type, id, timestamp, tier, keyTier, model, endpoint, latencyMs, statusCode, payload, response, errorMessage, triggerKind, blockId, evalId, callId, promptRef, archive, usage, ...fields } = e as any;
      records.push({
        kind: "harness",
        t: ts,
        eventType: e.type,
        fields
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
        user: e.payload?.user ? dereferenceUser(e.payload.user) : undefined,
        attempts: [],
        status: "pending",
      };
      calls.set(key, call);
      callOrder.push(key);
      records.push(call); // placeholder slot; mutated below in chronological order
    }
    // Keep the best-known promptRef / user / tier as legs arrive.
    if (!call.promptRef) call.promptRef = refFor(e);
    if (!call.user && e.payload?.user) call.user = dereferenceUser(e.payload.user);
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
        call.attempts.push({ model: e.model || "", status: e.statusCode ?? 200, latencyMs: e.latencyMs });
      }
      call.status = e.statusCode ?? 200;
      call.latencyMs = e.latencyMs;
      call.response = e.response;
      if (e.usage) call.usage = e.usage;
    } else if (e.type === "error") {
      const last = call.attempts[call.attempts.length - 1];
      const status = e.statusCode ?? "timeout";
      if (last) {
        last.status = status;
        last.latencyMs = e.latencyMs;
        last.error = redactKeys(e.errorMessage);
      } else {
        call.attempts.push({ model: e.model || "", status, latencyMs: e.latencyMs, error: redactKeys(e.errorMessage) });
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
      },
    },
    systemPrompts,
    glossary: glossary ?? undefined,
    log: records,
  };
}
