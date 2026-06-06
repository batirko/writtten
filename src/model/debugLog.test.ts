import { describe, it, expect } from "vitest";
import { buildEnvelope, type CallRecord, type ArchiveRecord, type TriggerRecord } from "./debugLog";
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
      entry({ type: "request", callId: "c1", promptRef: "doc-quality", payload: { system: SYS, user: "u" } }),
      entry({ type: "response", callId: "c1", promptRef: "doc-quality", statusCode: 200, payload: { system: SYS, user: "u" }, response: "{}" }),
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
      entry({ type: "request", callId: "c1", model: "model-a", payload: { system: SYS, user: "u" } }),
      entry({ type: "error", callId: "c1", model: "model-a", statusCode: 429, errorMessage: "rate", payload: { system: SYS, user: "u" } }),
      entry({ type: "retry", callId: "c1", model: "model-b", latencyMs: 500, payload: { system: SYS, user: "u" } }),
      entry({ type: "request", callId: "c1", model: "model-b", payload: { system: SYS, user: "u" } }),
      entry({ type: "response", callId: "c1", model: "model-b", statusCode: 200, latencyMs: 900, payload: { system: SYS, user: "u" }, response: "{}" }),
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

describe("buildEnvelope — triggers, archives, produced", () => {
  it("emits trigger and archive records inline and chronologically", () => {
    const entries = [
      entry({ type: "trigger", triggerKind: "doc-idle", evalId: "E1" }),
      entry({ type: "request", callId: "c1", evalId: "E1", payload: { system: SYS, user: "u" } }),
      entry({ type: "response", callId: "c1", evalId: "E1", statusCode: 200, payload: { system: SYS, user: "u" }, response: "{}" }),
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
      entry({ type: "response", callId: "c1", statusCode: 200, payload: { system: SYS, user: "u" }, response: "{}" }),
    ];
    const env = buildEnvelope(entries, produced);
    const call = env.log.find((r) => r.kind === "call") as CallRecord;
    expect(call.produced).toMatchObject({ ledgerWrites: 3, resolvedPrior: [0] });
    expect(call.produced?.observations).toEqual(["clarity", "clarity"]);
  });
});
