import { describe, it, expect, afterEach } from "vitest";
import {
  activateExampleReplay,
  deactivateExampleReplay,
  onKeyBecameAvailable,
  isExampleReplayActive,
} from "./exampleReplay";
import { EXAMPLE_DOC_RECORDING } from "./exampleDocRecording";
import { getLlmMode, setLlmMode, recordingsSize, fallbackSize } from "../model/mock";

const RECORDING_SIZE = Object.keys(EXAMPLE_DOC_RECORDING).length;

afterEach(() => {
  // Never leave a test with the router stuck in mock mode or a fallback armed.
  deactivateExampleReplay();
  setLlmMode("live");
});

describe("exampleReplay", () => {
  it("keyless: routes to mock replay and arms the fallback", () => {
    expect(isExampleReplayActive()).toBe(false);
    activateExampleReplay({ keyless: true });
    expect(isExampleReplayActive()).toBe(true);
    expect(getLlmMode()).toBe("mock");
    expect(recordingsSize()).toBe(RECORDING_SIZE);
    expect(fallbackSize()).toBe(RECORDING_SIZE);
  });

  it("keyed: stays live but arms the error fallback", () => {
    activateExampleReplay({ keyless: false });
    expect(isExampleReplayActive()).toBe(true);
    expect(getLlmMode()).toBe("live");
    expect(recordingsSize()).toBe(0);
    expect(fallbackSize()).toBe(RECORDING_SIZE);
  });

  it("deactivate returns to live and clears both replay and fallback", () => {
    activateExampleReplay({ keyless: true });
    deactivateExampleReplay();
    expect(isExampleReplayActive()).toBe(false);
    expect(getLlmMode()).toBe("live");
    expect(recordingsSize()).toBe(0);
    expect(fallbackSize()).toBe(0);
  });

  it("onKeyBecameAvailable exits keyless mock replay (but is a no-op when live)", () => {
    activateExampleReplay({ keyless: true });
    onKeyBecameAvailable();
    expect(getLlmMode()).toBe("live");
    expect(isExampleReplayActive()).toBe(false);

    // A keyed demo (already live) is untouched by a key-available signal.
    activateExampleReplay({ keyless: false });
    onKeyBecameAvailable();
    expect(isExampleReplayActive()).toBe(true);
    expect(fallbackSize()).toBe(RECORDING_SIZE);
  });

  it("deactivate is idempotent and won't clobber a mode it didn't set", () => {
    setLlmMode("record");
    deactivateExampleReplay(); // never activated → no-op
    expect(getLlmMode()).toBe("record");
  });
});

describe("exampleDocRecording", () => {
  it("bundles the planted contradiction so the hero can replay", () => {
    const values = Object.values(EXAMPLE_DOC_RECORDING);
    expect(values.length).toBeGreaterThan(0);
    const withContradiction = values.filter((v) => {
      try {
        const parsed = JSON.parse(v);
        return Array.isArray(parsed.contradictions) && parsed.contradictions.length > 0;
      } catch {
        return false;
      }
    });
    expect(withContradiction.length).toBeGreaterThan(0);
    for (const v of values) expect(() => JSON.parse(v)).not.toThrow();
  });

  it("curates to one clean exemplar per type — the demo's variety spread", () => {
    // The whole point of the 2026-07-07 revision: the demo shows the product's
    // RANGE — each observation a different type, exactly once — instead of
    // clustering on clarity and re-flagging the contradiction. This tallies the
    // observations the bundled recordings would produce and locks the spread.
    // See docs/projects/onboarding_first_run.md § Revision 2026-07-07.
    const tally: Record<string, number> = {};
    const bump = (k: string, n: number) => (tally[k] = (tally[k] ?? 0) + n);
    for (const v of Object.values(EXAMPLE_DOC_RECORDING)) {
      const p = JSON.parse(v);
      bump("contradiction", (p.contradictions ?? []).length);
      bump("tension", (p.tensions ?? []).length);
      bump("clarity", (p.clarity_observations ?? []).length);
      bump("unsupported_claim", (p.unsupported_claim_observations ?? []).length);
      bump("undefined_jargon", (p.undefined_jargon_observations ?? []).length);
      bump("missing_topic", (p.missing_topic_observations ?? []).length);
      bump("underexposed_topic", (p.underexposed_topic_observations ?? []).length);
      bump("audience_mismatch", (p.audience_mismatch_observations ?? []).length);
      bump("structure_flow", (p.structure_flow_observations ?? []).length);
    }
    // Six distinct capabilities, each demonstrated exactly once.
    expect(tally.contradiction).toBe(1);
    expect(tally.tension).toBe(1);
    expect(tally.clarity).toBe(1);
    expect(tally.unsupported_claim).toBe(1);
    expect(tally.undefined_jargon).toBe(1);
    expect(tally.missing_topic).toBe(1);
    // Dropped from the spread (overlap / redundant re-flag / surface nits).
    expect(tally.underexposed_topic ?? 0).toBe(0);
    expect(tally.audience_mismatch ?? 0).toBe(0);
    expect(tally.structure_flow ?? 0).toBe(0);
  });
});
