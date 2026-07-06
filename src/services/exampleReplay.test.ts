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
});
