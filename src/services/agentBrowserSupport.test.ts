import { describe, it, expect } from "vitest";
import { agentBrowserSupport } from "./agentBrowserSupport";

const APPLE = "Apple Computer, Inc.";
const GOOGLE = "Google Inc.";

describe("agentBrowserSupport", () => {
  it("refuses WebKit-on-Apple served over HTTPS — the writtten.com case", () => {
    expect(agentBrowserSupport(APPLE, "https:")).toEqual({
      supported: false,
      reason: "webkit_loopback",
    });
  });

  // iOS Chrome and iOS Firefox are WebKit underneath and equally blocked; the
  // vendor check catches them, a "Safari" UA-token check would not.
  it("refuses every iOS browser, not just the one named Safari", () => {
    expect(agentBrowserSupport(APPLE, "https:").supported).toBe(false);
  });

  it("allows Chrome, whose UA carries a Safari token for historical reasons", () => {
    expect(agentBrowserSupport(GOOGLE, "https:")).toEqual({ supported: true });
  });

  it("allows Firefox, which reports an empty vendor", () => {
    expect(agentBrowserSupport("", "https:")).toEqual({ supported: true });
    expect(agentBrowserSupport(undefined, "https:")).toEqual({ supported: true });
  });

  // The block is mixed content, not WebKit per se. From an http origin the
  // loopback request is same-scheme, so refusing would deny a path that works.
  it("allows Safari on an http origin — the self-hoster's localhost", () => {
    expect(agentBrowserSupport(APPLE, "http:")).toEqual({ supported: true });
  });
});
