import { describe, it, expect } from "vitest";
import {
  buildEnvelope,
  type CallRecord,
  type ArchiveRecord,
  type TriggerRecord,
  type AgentRecord,
} from "./debugLog";
import type { LLMLogEntry, CallProduced } from "./logger";

let seq = 0;
/** Build a raw entry with a monotonic timestamp (1s apart) so order is stable. */
function entry(partial: Partial<LLMLogEntry> & Pick<LLMLogEntry, "type">): LLMLogEntry {
  seq += 1;
  return {
    id: `e${seq}`,
    timestamp: new Date(2026, 0, 1, 0, 0, seq),
    model: "",
    endpoint: "",
    payload: { system: "", user: "" },
    ...partial,
  };
}

const SYS = "You are a critical editor reviewing a document.";

describe("buildEnvelope — call merge", () => {
  it("merges a request + response sharing a callId into one call record", () => {
    // Built in real chronological order (request then response); the projection
    // sorts by timestamp, so storage order in the array is irrelevant — reverse
    // it to prove the sort.
    const entries = [
      entry({
        type: "request",
        callId: "c1",
        evalId: "E1",
        tier: "strong",
        keyTier: "paid",
        model: "gemini-2.5-pro",
        promptRef: "doc-quality",
        payload: { system: SYS, user: "Stage: PRD" },
      }),
      entry({
        type: "response",
        callId: "c1",
        evalId: "E1",
        tier: "strong",
        keyTier: "paid",
        model: "gemini-2.5-pro",
        promptRef: "doc-quality",
        statusCode: 200,
        latencyMs: 1800,
        payload: { system: SYS, user: "Stage: PRD" },
        response: '{"ok":true}',
      }),
    ].reverse();

    const env = buildEnvelope(entries, new Map());
    const calls = env.log.filter((r) => r.kind === "call") as CallRecord[];
    expect(calls).toHaveLength(1);
    expect(calls[0].callId).toBe("c1");
    expect(calls[0].evalId).toBe("E1");
    expect(calls[0].status).toBe(200);
    expect(calls[0].latencyMs).toBe(1800);
    expect(calls[0].response).toBe('{"ok":true}');
    expect(calls[0].attempts).toHaveLength(1);
    expect(calls[0].attempts[0]).toMatchObject({ model: "gemini-2.5-pro", status: 200 });
  });

  it("dereferences the system prompt into the dictionary, not the call record", () => {
    const entries = [
      entry({
        type: "request",
        callId: "c1",
        promptRef: "doc-quality",
        payload: { system: SYS, user: "u" },
      }),
      entry({
        type: "response",
        callId: "c1",
        promptRef: "doc-quality",
        statusCode: 200,
        payload: { system: SYS, user: "u" },
        response: "{}",
      }),
    ];
    const env = buildEnvelope(entries, new Map());
    expect(env.systemPrompts["doc-quality"]).toBe(SYS);
    const call = env.log.find((r) => r.kind === "call") as CallRecord;
    expect(call.promptRef).toBe("doc-quality");
    // The full system text must not be duplicated onto the call record.
    expect(JSON.stringify(call)).not.toContain(SYS);
  });

  it("collapses rotation retries into the attempts array under one call", () => {
    const entries = [
      entry({
        type: "request",
        callId: "c1",
        model: "model-a",
        payload: { system: SYS, user: "u" },
      }),
      entry({
        type: "error",
        callId: "c1",
        model: "model-a",
        statusCode: 429,
        errorMessage: "rate",
        payload: { system: SYS, user: "u" },
      }),
      entry({
        type: "retry",
        callId: "c1",
        model: "model-b",
        latencyMs: 500,
        payload: { system: SYS, user: "u" },
      }),
      entry({
        type: "request",
        callId: "c1",
        model: "model-b",
        payload: { system: SYS, user: "u" },
      }),
      entry({
        type: "response",
        callId: "c1",
        model: "model-b",
        statusCode: 200,
        latencyMs: 900,
        payload: { system: SYS, user: "u" },
        response: "{}",
      }),
    ];
    const env = buildEnvelope(entries, new Map());
    const call = env.log.find((r) => r.kind === "call") as CallRecord;
    expect(call.attempts).toHaveLength(2);
    expect(call.attempts[0]).toMatchObject({ model: "model-a", status: 429 });
    expect(call.attempts[1]).toMatchObject({ model: "model-b", status: 200, retryDelayMs: 500 });
    expect(call.status).toBe(200); // terminal
  });

  it("auto-generates a promptRef when none is supplied, deduping identical prompts", () => {
    const entries = [
      entry({ type: "request", callId: "c1", payload: { system: SYS, user: "a" } }),
      entry({ type: "request", callId: "c2", payload: { system: SYS, user: "b" } }),
    ];
    const env = buildEnvelope(entries, new Map());
    expect(Object.keys(env.systemPrompts)).toHaveLength(1); // same text → one dict entry
  });
});

describe("buildEnvelope — harness semantic request/response are not fabricated calls", () => {
  it("routes model/callId/payload-less request+response events to the harness bucket, not empty calls", () => {
    // The evaluator emits `harness.emit("request"/"response", { block, tier })`
    // as lifecycle signals. They share the type strings of real HTTP legs but
    // carry no callId/model/payload — they must NOT become empty call records.
    const entries = [
      // harness "request" lifecycle event (no callId/model/payload)
      entry({ type: "request", model: undefined, payload: undefined, tier: "fast" }),
      // the real Gemini leg for that section
      entry({
        type: "request",
        callId: "c1",
        tier: "fast",
        model: "gemini-3.1-flash-lite",
        promptRef: "section-eval",
        payload: { system: SYS, user: "u" },
      }),
      entry({
        type: "response",
        callId: "c1",
        tier: "fast",
        model: "gemini-3.1-flash-lite",
        statusCode: 200,
        latencyMs: 1399,
        payload: { system: SYS, user: "u" },
        response: "{}",
      }),
      // harness "response" lifecycle event (no callId/model/payload)
      entry({
        type: "response",
        model: undefined,
        payload: undefined,
        tier: "fast",
        latencyMs: 1016,
      }),
    ] as LLMLogEntry[];

    const env = buildEnvelope(entries, new Map());
    const calls = env.log.filter((r) => r.kind === "call") as CallRecord[];
    // Exactly one real call — no phantom { model: "", status: "pending" } records.
    expect(calls).toHaveLength(1);
    expect(calls[0].callId).toBe("c1");
    expect(calls[0].status).toBe(200);
    expect(env.meta.counts.calls).toBe(1);

    // The two lifecycle events surface as harness records with their type intact.
    const harnessReqResp = env.log.filter(
      (r) => r.kind === "harness" && (r.eventType === "request" || r.eventType === "response")
    );
    expect(harnessReqResp).toHaveLength(2);
  });
});

describe("buildEnvelope — glossary dereference", () => {
  it("extracts the defined-terms list once and tokenizes it in user content", () => {
    const user =
      "Section body text.\nDefined terms (do not flag as undefined jargon):\n- sprint\n- backlog\n- roadmap";
    const env = buildEnvelope(
      [entry({ type: "request", callId: "c1", payload: { system: SYS, user } })],
      new Map()
    );
    expect(env.glossary).toEqual(["sprint", "backlog", "roadmap"]);
    const call = env.log.find((r) => r.kind === "call") as CallRecord;
    expect(call.user).toContain("{{glossary}}");
    expect(call.user).not.toContain("- sprint");
  });
});

describe("buildEnvelope — secret redaction (never leak a key)", () => {
  // Realistic-shaped fakes (never real secrets). Gemini: AIza + 35; sk-: OpenAI/Anthropic.
  const GEMINI_KEY = "AIzaSyRAWfakeRAWfakeRAWfakeRAWfake1234";
  const OPENAI_KEY = "sk-proj-RAWfakeRAWfakeRAWfakeRAWfake123";

  it("emits no raw API key from any free-text field, and drops the endpoint entirely", () => {
    const entries = [
      entry({
        type: "request",
        callId: "c1",
        model: "gemini-2.5-pro",
        // The endpoint carries the key in the URL — it must never reach the envelope.
        endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GEMINI_KEY}`,
        payload: {
          system: `You are an editor. (stray key=${GEMINI_KEY})`,
          // A user who pasted their own keys into the document body.
          user: `Overview\n\nMy Gemini key is ${GEMINI_KEY} and my OpenAI key is ${OPENAI_KEY}.`,
        },
      }),
      entry({
        type: "error",
        callId: "c1",
        model: "gemini-2.5-pro",
        statusCode: 400,
        errorMessage: `Bad request to https://…:generateContent?key=${GEMINI_KEY}`,
        payload: { system: "", user: "" },
      }),
      entry({
        type: "response",
        callId: "c1",
        statusCode: 200,
        payload: { system: "", user: "" },
        response: `{"echo":"${GEMINI_KEY}"}`,
      }),
    ];

    const serialized = JSON.stringify(buildEnvelope(entries, new Map()));
    // No raw secret survives anywhere in the envelope…
    expect(serialized).not.toContain(GEMINI_KEY);
    expect(serialized).not.toContain(OPENAI_KEY);
    // …and the endpoint (which carries the key in its URL) is never emitted at all.
    expect(serialized).not.toContain("generativelanguage.googleapis.com");
    // The redaction marker is present where a secret was masked.
    expect(serialized).toContain("<REDACTED>");
  });

  it("keeps ordinary prose with key-ish substrings intact (no false redaction)", () => {
    // "task-", "risk-" contain "sk-" mid-word; the \b anchor must leave them alone.
    const user = "The task-tracking risk-assessment work is not a security concern here.";
    const env = buildEnvelope(
      [entry({ type: "request", callId: "c1", payload: { system: SYS, user } })],
      new Map()
    );
    const call = env.log.find((r) => r.kind === "call") as CallRecord;
    expect(call.user).toBe(user);
    expect(call.user).not.toContain("<REDACTED>");
  });
});

describe("buildEnvelope — triggers, archives, produced", () => {
  it("emits trigger and archive records inline and chronologically", () => {
    const entries = [
      entry({ type: "trigger", triggerKind: "doc-idle", evalId: "E1" }),
      entry({ type: "request", callId: "c1", evalId: "E1", payload: { system: SYS, user: "u" } }),
      entry({
        type: "response",
        callId: "c1",
        evalId: "E1",
        statusCode: 200,
        payload: { system: SYS, user: "u" },
        response: "{}",
      }),
      entry({
        type: "archive",
        evalId: "E1",
        archive: {
          observationId: "o9",
          obsType: "clarity",
          scope: "span",
          blockId: "b1",
          text: "vague",
          reason: "resolved_prior",
          actor: "system",
        },
      }),
    ];
    const env = buildEnvelope(entries, new Map());
    expect(env.log.map((r) => r.kind)).toEqual(["trigger", "call", "archive"]);

    const trig = env.log[0] as TriggerRecord;
    expect(trig.triggerKind).toBe("doc-idle");

    const arch = env.log[2] as ArchiveRecord;
    expect(arch.actor).toBe("system");
    expect(arch.reason).toBe("resolved_prior");
    expect(arch.observationId).toBe("o9");

    expect(env.meta.counts).toMatchObject({ triggers: 1, calls: 1, archives: 1 });
    expect(env.meta.triggerKinds).toEqual(["doc-idle"]);
  });

  it("attaches produced effects to the call by callId", () => {
    const produced = new Map<string, CallProduced>([
      ["c1", { observations: ["clarity", "clarity"], ledgerWrites: 3, resolvedPrior: [0] }],
    ]);
    const entries = [
      entry({ type: "request", callId: "c1", payload: { system: SYS, user: "u" } }),
      entry({
        type: "response",
        callId: "c1",
        statusCode: 200,
        payload: { system: SYS, user: "u" },
        response: "{}",
      }),
    ];
    const env = buildEnvelope(entries, produced);
    const call = env.log.find((r) => r.kind === "call") as CallRecord;
    expect(call.produced).toMatchObject({ ledgerWrites: 3, resolvedPrior: [0] });
    expect(call.produced?.observations).toEqual(["clarity", "clarity"]);
  });
});

// ---------------------------------------------------------------------------
// The BYOA blind spot. A dogfood session with a connected agent — 7 accepted
// observations and several retractions — exported
// `{ triggers: 88, calls: 0, archives: 0 }`: 88 triggers from the *idle*
// built-in engine and not one event from the engine that did the work. The
// export is what a user sends when something goes wrong; for an agent session
// it contained no evidence at all.
// ---------------------------------------------------------------------------

describe("buildEnvelope — agent (BYOA) records", () => {
  it("projects each bridge event into the log stream", () => {
    const entries = [
      entry({ type: "agent", agent: { event: "pairing", state: "connected", agentName: "Claude Code" } }),
      entry({ type: "agent", agent: { event: "snapshot", docVersion: 4 } }),
      entry({ type: "agent", agent: { event: "pull", docVersion: 4 } }),
    ];
    const env = buildEnvelope(entries, new Map());
    const agents = env.log.filter((r) => r.kind === "agent") as AgentRecord[];
    expect(agents.map((a) => a.event)).toEqual(["pairing", "snapshot", "pull"]);
    expect(agents[0].agentName).toBe("Claude Code");
    expect(agents[1].docVersion).toBe(4);
  });

  it("carries a submission's verdict, including why a rejection was rejected", () => {
    const entries = [
      entry({
        type: "agent",
        agent: {
          event: "submission",
          obsType: "clarity",
          scope: "span",
          result: "rejected",
          code: "register_violation",
          rule: "prescriptive",
        },
      }),
    ];
    const env = buildEnvelope(entries, new Map());
    const rec = env.log.find((r) => r.kind === "agent") as AgentRecord;
    expect(rec).toMatchObject({ result: "rejected", code: "register_violation", rule: "prescriptive" });
  });

  // The whole point of the counter: a BYOA session must not export as if
  // nothing happened.
  it("a submit/retract round-trip is legible after the fact, with a non-zero archive", () => {
    const entries = [
      entry({ type: "agent", agent: { event: "pull", docVersion: 1 } }),
      entry({
        type: "agent",
        agent: { event: "submission", obsType: "contradiction", scope: "span", result: "accepted", observationId: "obs-1" },
      }),
      entry({ type: "agent", agent: { event: "retract", observationId: "obs-1", applied: true } }),
      entry({
        type: "archive",
        archive: {
          observationId: "obs-1",
          obsType: "contradiction",
          scope: "span",
          text: "This section commits to Q3; the Timeline section commits the same work to Q2.",
          reason: "retracted",
          actor: "system",
        },
      }),
    ];
    const env = buildEnvelope(entries, new Map());
    expect(env.meta.counts.agentEvents).toBe(3);
    // `archives: 0` was wrong on its own terms — a retraction closes a card.
    expect(env.meta.counts.archives).toBe(1);
    const archive = env.log.find((r) => r.kind === "archive") as ArchiveRecord;
    expect(archive.reason).toBe("retracted");
  });

  it("counts zero agent events on an ordinary keyed session", () => {
    const entries = [entry({ type: "trigger", triggerKind: "pause" })];
    expect(buildEnvelope(entries, new Map()).meta.counts.agentEvents).toBe(0);
  });
});
