import { describe, it, expect, afterEach } from "vitest";
import {
  activateExampleReplay,
  deactivateExampleReplay,
  isExampleReplayActive,
} from "./exampleReplay";
import { EXAMPLE_DOC_RECORDING } from "./exampleDocRecording";
import { getLlmMode, setLlmMode, recordingsSize } from "../model/mock";

afterEach(() => {
  // Never leave a test with the router stuck in mock mode.
  deactivateExampleReplay();
  setLlmMode("live");
});

describe("exampleReplay", () => {
  it("activate installs the recordings and routes to mock replay", () => {
    expect(isExampleReplayActive()).toBe(false);
    activateExampleReplay();
    expect(isExampleReplayActive()).toBe(true);
    expect(getLlmMode()).toBe("mock");
    expect(recordingsSize()).toBe(Object.keys(EXAMPLE_DOC_RECORDING).length);
  });

  it("deactivate returns the router to live and clears the recordings", () => {
    activateExampleReplay();
    deactivateExampleReplay();
    expect(isExampleReplayActive()).toBe(false);
    expect(getLlmMode()).toBe("live");
    expect(recordingsSize()).toBe(0);
  });

  it("deactivate is idempotent and won't clobber a mode it didn't set", () => {
    // Simulate the dev harness putting the router in record mode.
    setLlmMode("record");
    deactivateExampleReplay(); // never activated → no-op
    expect(getLlmMode()).toBe("record");
  });
});

describe("exampleDocRecording", () => {
  it("bundles the planted contradiction so the keyless hero can replay", () => {
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
    // Every entry must be valid JSON (a real captured response), not truncated.
    for (const v of values) expect(() => JSON.parse(v)).not.toThrow();
  });
});
