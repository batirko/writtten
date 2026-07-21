/** @vitest-environment node */
import { describe, it, expect, afterEach } from "vitest";
import { toAgentObservation, AGENT_OBSERVATION_FIELDS, snapshotMaturity } from "./agentSnapshot";
import { agentCalibrationBlock, classifyDocumentClass } from "./documentClass";
import type { SectionMember } from "./types";
import { registerDocSnapshotReader, readLiveDoc } from "../model/docSnapshotSource";
import type { Observation } from "../store/db";

const fullObservation: Observation = {
  id: "obs-1",
  docId: "default",
  type: "contradiction",
  scope: "span",
  kind: "problem",
  severity: "high",
  confidence: "high",
  priority: 2.4,
  text: "This section commits to Q3; the Timeline section commits the same work to Q2.",
  status: "active",
  blockId: "blk-secret",
  startOffset: 12,
  endOffset: 44,
  anchorText: "ship by the end of Q3",
  anchorQuote: "…ship by the end of Q3",
  conflictingBlockId: "blk-other",
  conflictingStartOffset: 3,
  conflictingEndOffset: 9,
};

/** A lens card is the only observation that populates every optional projected
 *  field, so it is the fixture that can assert the allowlist EXACTLY. */
const lensObservation: Observation = {
  ...fullObservation,
  id: "obs-2",
  type: "user_lens",
  kind: "opportunity",
  severity: "low",
  confidence: "medium",
  priority: 0.75,
  text: "This passage runs on parallel clauses and em-dash rhythm.",
  lens: "sounds AI-written",
  source: { kind: "agent", name: "Claude Code", sessionId: "sess-1" },
};

describe("agent observation projection", () => {
  it("exposes exactly the allowlisted fields", () => {
    // The invariant this guards: the agent must never learn block identity. A spread
    // (`{...o, source}`) would leak blockId/offsets the moment anyone adds a field to
    // Observation, with every existing test still green.
    const projected = toAgentObservation(lensObservation);
    expect(Object.keys(projected).sort()).toEqual([...AGENT_OBSERVATION_FIELDS].sort());
  });

  it("never projects a field outside the allowlist, whichever fields are set", () => {
    // The "exactly" case above needs a fully-populated observation, but the leak
    // being guarded against is an EXTRA key — so every shape must be checked,
    // including the common one where the optional fields are absent.
    for (const o of [fullObservation, lensObservation]) {
      for (const key of Object.keys(toAgentObservation(o))) {
        expect(AGENT_OBSERVATION_FIELDS).toContain(key);
      }
    }
  });

  it("projects the lens label, and only on lens cards", () => {
    // The next pass needs to see which active cards came from which lens, or it
    // re-files hits the feed already carries.
    expect(toAgentObservation(lensObservation).lens).toBe("sounds AI-written");
    expect(toAgentObservation(fullObservation).lens).toBeUndefined();
  });

  it("attributes each active observation to the critic that produced it", () => {
    // The snapshot exists so the agent doesn't re-file what the feed already
    // shows; that only works if it can tell its own prior cards from ours.
    expect(toAgentObservation(fullObservation).source).toBe("writtten");
    expect(
      toAgentObservation({
        ...fullObservation,
        source: { kind: "agent", name: "Claude Code", sessionId: "sess-1" },
      }).source
    ).toBe("Claude Code");
  });

  it("gives the agent a source name but never a sessionId", () => {
    // sessionId is internal identity — it is what revoke and retract scope on,
    // and the agent has no use for another session's.
    const serialized = JSON.stringify(
      toAgentObservation({
        ...fullObservation,
        source: { kind: "agent", name: "Codex", sessionId: "sess-secret" },
      })
    );
    expect(serialized).toContain("Codex");
    expect(serialized).not.toContain("sess-secret");
  });

  it("leaks no internal identifier or offset", () => {
    const serialized = JSON.stringify(toAgentObservation(fullObservation));
    for (const leak of [
      "blk-secret",
      "blk-other",
      "blockId",
      "startOffset",
      "endOffset",
      "conflictingBlockId",
      "priority",
      "obs-1",
    ]) {
      expect(serialized, `${leak} must not reach the agent`).not.toContain(leak);
    }
  });

  it("omits anchorText entirely for a doc-scope observation", () => {
    const docScope = { ...fullObservation, scope: "document" as const, anchorText: undefined };
    expect(toAgentObservation(docScope)).not.toHaveProperty("anchorText");
  });
});

describe("snapshotMaturity — the band the agent is handed (UX-029)", () => {
  const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
  const block = (text: string, extra: Partial<SectionMember> = {}): SectionMember => ({
    blockId: `b${Math.random()}`,
    text,
    ...extra,
  });

  it("reads an untouched document as unformed", () => {
    // The starting condition that produced UX-029: connect first, write afterwards.
    expect(snapshotMaturity([])).toBe("unformed");
  });

  it("still reads an opening line or two as unformed", () => {
    expect(snapshotMaturity([block(words(20))])).toBe("unformed");
  });

  it("leaves unformed once there is a draft to react to", () => {
    expect(snapshotMaturity([block(words(200))])).toBe("forming");
  });

  it("reaches mature on a developed draft", () => {
    const blocks = Array.from({ length: 8 }, () => block(words(60)));
    expect(snapshotMaturity(blocks)).toBe("mature");
  });

  it("counts only prose the agent can actually see, not table text", () => {
    // The D2 guard. buildCombined drops table text from the sections[] the agent
    // receives, so counting it here would let the snapshot claim `mature` over a
    // document whose visible prose is two sentences — the agent would then run a full
    // pass on material it was never shown, and file absence observations about it.
    const tableHeavy = [
      block(words(15)),
      ...Array.from({ length: 6 }, () => block(words(80), { isTable: true })),
    ];
    expect(snapshotMaturity(tableHeavy)).toBe("unformed");
  });
});

/**
 * OBS-039. The boundary validates taxonomy and register; it has no way to notice that a
 * PRD-grade observation landed on someone's personal essay, because such a card is
 * register-clean and taxonomy-valid and is therefore accepted. The snapshot is the only
 * channel that can calibrate an agent, so what it carries is load-bearing in a way nothing
 * downstream can compensate for.
 */
describe("calibration handed to the agent (OBS-039)", () => {
  it("is empty on a PRD or spec — the strict anchor", () => {
    // Must stay empty rather than becoming a "be strict" instruction: the paste tells the
    // agent that empty means the strict baseline, and the two have to agree.
    expect(agentCalibrationBlock(classifyDocumentClass("internal PRD"))).toBe("");
    expect(agentCalibrationBlock(classifyDocumentClass("product spec for launch"))).toBe("");
  });

  it("relaxes unsupported_claim and PRD structure on a personal essay", () => {
    const block = agentCalibrationBlock(classifyDocumentClass("a personal essay about burnout"));
    expect(block).toMatch(/personal or reflective essay/);
    expect(block).toMatch(/first-person reflection/);
    expect(block).toMatch(/do not raise missing_topic or structure_flow/i);
  });

  it("softens the cold open when the author never set a stage", () => {
    // The common first-run case: unstaged documents used to take full PRD strictness on
    // the very first pass (OBS-036), which is exactly when an agent is forming its
    // impression of what this product is for.
    const block = agentCalibrationBlock(classifyDocumentClass(""));
    expect(block).toMatch(/not yet identified/);
    expect(block).toMatch(/do not assume this is a PRD or spec/i);
  });

  it("never relaxes the checks that hold across every genre", () => {
    for (const stage of ["a blog post", "a work memo", "a personal essay", ""]) {
      const block = agentCalibrationBlock(classifyDocumentClass(stage));
      // Calibration is a strictness dial, not a licence to switch checks off. If a future
      // edit relaxes contradiction, the agent stops doing the one job users value most.
      expect(block).toMatch(/contradiction, clarity, and undefined_jargon are unchanged/i);
    }
  });

  it("speaks the agent's vocabulary, not the internal pipeline's", () => {
    // The two built-in blocks spend most of their words on what to extract into the claim
    // ledger. An agent has no extraction stage and no ledger, so that guidance would be
    // describing machinery it cannot see.
    const block = agentCalibrationBlock(classifyDocumentClass("a personal essay"));
    expect(block).not.toMatch(/extract/i);
    expect(block).not.toMatch(/claim ledger/i);
  });
});

describe("docSnapshotSource", () => {
  afterEach(() => registerDocSnapshotReader(() => ({ title: "", stage: "", sections: [], members: [] }))());

  it("returns null when no editor is mounted", () => {
    expect(readLiveDoc()).toBeNull();
  });

  it("reads through the registered reader and unregisters cleanly", () => {
    const unregister = registerDocSnapshotReader(() => ({
      title: "Fraud PRD",
      stage: "internal PRD",
      sections: [{ heading: "Goals", text: "Cut chargebacks." }],
      members: [{ blockId: "b1", text: "Cut chargebacks." }],
    }));
    expect(readLiveDoc()?.title).toBe("Fraud PRD");
    unregister();
    expect(readLiveDoc()).toBeNull();
  });

  it("a stale cleanup does not clobber a newer registration", () => {
    const stale = registerDocSnapshotReader(() => ({ title: "old", stage: "", sections: [], members: [] }));
    registerDocSnapshotReader(() => ({ title: "new", stage: "", sections: [], members: [] }));
    stale();
    expect(readLiveDoc()?.title).toBe("new");
  });
});
