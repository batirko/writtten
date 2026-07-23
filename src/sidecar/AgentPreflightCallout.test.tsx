/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { AgentPreflightCallout } from "./AgentPreflightCallout";
import type { AgentBridgeView } from "./useAgentBridge";
import type { PreflightPhase } from "./useAgentBridge";
import { EMPTY_PASS } from "./agentActivityView";

let host: HTMLDivElement;
let root: Root;

function render(view: Partial<AgentBridgeView> & { preflight: PreflightPhase }) {
  const props: AgentBridgeView = {
    enabled: true,
    support: { supported: true },
    status: {
      state: "idle",
      agentName: null,
      port: null,
      error: null,
      docVersion: null,
      sessionId: null,
      pass: EMPTY_PASS,
    },
    prompt: null,
    promptError: null,
    connect: vi.fn(),
    cancel: view.cancel ?? vi.fn(),
    activeFromSource: 0,
    revoke: vi.fn(async () => undefined),
    preflight: view.preflight,
    proceed: view.proceed ?? vi.fn(),
    recheckPermission: view.recheckPermission ?? vi.fn(),
    stalled: false,
    permissionUnreadable: true,
  };
  act(() => {
    root.render(createElement(AgentPreflightCallout, props));
  });
  // Portals to <body>, so read from the document, not the host node.
  return document.body.textContent ?? "";
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("AgentPreflightCallout", () => {
  it("renders nothing when there is no pre-flight", () => {
    render({ preflight: "none" });
    expect(document.querySelector(".agent-preflight-callout")).toBeNull();
  });

  it("portals out of its parent, to <body> — it must escape the Settings modal", () => {
    render({ preflight: "asking" });
    const callout = document.querySelector('[data-testid="agent-preflight-asking"]');
    expect(callout).not.toBeNull();
    // Rendered under <body>, not inside the component's own host node.
    expect(host.contains(callout)).toBe(false);
    expect(document.body.contains(callout)).toBe(true);
  });

  describe("asking", () => {
    it("names what's about to happen and its action is distinct from Connect", () => {
      const proceed = vi.fn();
      const text = render({ preflight: "asking", proceed });

      expect(text).toContain("Your browser will ask to reach your local network");
      // The action is a separate element from the connect button, not it relabelled.
      expect(document.querySelector('[data-testid="connect-agent-start"]')).toBeNull();
      act(() => {
        document
          .querySelector<HTMLButtonElement>('[data-testid="agent-preflight-proceed"]')!
          .click();
      });
      expect(proceed).toHaveBeenCalledOnce();
    });

    it("answers why, in a disclosure rather than a link", () => {
      render({ preflight: "asking" });
      const why = document.querySelector(".connect-preflight-why");
      expect(why?.tagName).toBe("DETAILS");
      expect(why?.textContent).toContain("127.0.0.1");
    });

    it("backs out via the scrim as well as Cancel", () => {
      const cancel = vi.fn();
      render({ preflight: "asking", cancel });
      act(() => {
        document.querySelector<HTMLElement>(".agent-preflight-scrim")!.click();
      });
      expect(cancel).toHaveBeenCalled();
    });
  });

  describe("blocked", () => {
    it("shows recovery and retries on demand", () => {
      const recheckPermission = vi.fn();
      const text = render({ preflight: "blocked", recheckPermission });

      expect(text).toContain("Local network access is off");
      act(() => {
        document
          .querySelector<HTMLButtonElement>('[data-testid="agent-preflight-recheck"]')!
          .click();
      });
      expect(recheckPermission).toHaveBeenCalledOnce();
    });

    it("always leaves a way out", () => {
      const cancel = vi.fn();
      render({ preflight: "blocked", cancel });
      const back = [...document.querySelectorAll("button")].find((b) => b.textContent === "Not now");
      act(() => back!.click());
      expect(cancel).toHaveBeenCalledOnce();
    });

    it("deep-links recovery to a browser-support section that actually exists", () => {
      render({ preflight: "blocked" });
      const href = document
        .querySelector('[data-testid="agent-preflight-blocked"] a')
        ?.getAttribute("href");
      expect(href).toBe("/agent/#browsers");
      // Assert the target too — a link to a heading nobody kept is a silent break,
      // and the page is hand-written HTML with no other anchor to catch it.
      const page = readFileSync(join(process.cwd(), "public/agent/index.html"), "utf8");
      expect(page).toContain('id="browsers"');
    });
  });
});
