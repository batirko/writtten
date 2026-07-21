/** @vitest-environment jsdom */

/**
 * UX-044 — writtten must not offer Safari the agent path it cannot take.
 *
 * Three surfaces offered it, each gated on the preview flag alone: the first-run
 * welcome modal, the keyless banner, and the Engine control. The expensive half was
 * invisible — every route called `setEngine("agent")`, and under engine exclusivity
 * that gates the built-in evaluator off for the rest of the session against a slot
 * WebKit can never serve. The user was told the agent was unavailable and was *not*
 * told the engine that works had just been paused.
 *
 * The whole file runs as a WebKit-on-https session: the support module is mocked
 * unsupported, which is also what `agentOffer` and `useAgentBridge` read. The
 * supported case keeps its existing coverage in `SidecarFeed.test.tsx` (jsdom serves
 * `http:`, so the real predicate answers "supported" there by design — the scope is
 * WebKit **and** https:, so a self-hoster on http://localhost keeps a path that
 * genuinely works).
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

vi.mock("../services/agentBrowserSupport", () => ({
  currentAgentBrowserSupport: () => ({ supported: false, reason: "webkit_loopback" }),
  agentBrowserSupport: () => ({ supported: false, reason: "webkit_loopback" }),
}));

import { SidecarFeed } from "./SidecarFeed";
import { ControlCenter } from "./ControlCenter";
import { WelcomeModal } from "./WelcomeModal";
import { openSettings } from "./settingsGate";
import { agentPathOffered } from "../services/agentOffer";
import { isBuiltinEngineActive, __resetEngine } from "../services/evalEngine";
import { __resetAgentSourceStatus } from "../model/agentSourceSignal";

// The preview flag is runtime (`?agent=1` remembered in localStorage), and this
// tree's Node exposes an inert localStorage — so drive the store directly, or the
// flag-on branch silently never runs and every assertion below passes vacuously.
function enableAgentPreview() {
  const map = new Map<string, string>([["writtten_agent_preview", "1"]]);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  });
}

const containers: HTMLDivElement[] = [];

function render(node: ReturnType<typeof createElement>): HTMLDivElement {
  const div = document.createElement("div");
  document.body.appendChild(div);
  containers.push(div);
  act(() => {
    createRoot(div).render(node);
  });
  return div;
}

afterEach(() => {
  for (const c of containers) act(() => c.remove());
  containers.length = 0;
  __resetEngine();
  __resetAgentSourceStatus();
  vi.unstubAllGlobals();
});

const feedProps = {
  observations: [] as never[],
  apiKey: "",
  onApiKeyChange: () => {},
  stage: "",
  onStageChange: () => {},
  hoveredObservationId: null,
  onHoverObservation: () => {},
  onDismissObservation: async () => undefined,
  onClearWorkspace: () => {},
  hasKey: false,
};

const controlProps = {
  apiKey: "",
  onApiKeyChange: () => {},
  onClearWorkspace: () => {},
};

describe("the offer predicate", () => {
  it("is false on WebKit even with the preview flag on", () => {
    enableAgentPreview();
    expect(agentPathOffered()).toBe(false);
  });
});

describe("keyless banner", () => {
  it("drops the agent link, and the 'or' that framed it as an equal route", () => {
    enableAgentPreview();
    const div = render(createElement(SidecarFeed, feedProps));
    expect(div.querySelector('[data-testid="keyless-banner-settings"]')?.textContent).toMatch(
      /add your key/i
    );
    expect(div.querySelector('[data-testid="keyless-banner-connect"]')).toBeNull();
    expect(div.querySelector(".keyless-banner-or")).toBeNull();
  });

  /**
   * The prose half. A promise in the copy is the same offer as a button — dropping
   * the link while keeping "an agent keeps it on your machine entirely" would leave
   * the reader hunting for a route that does not exist on this browser.
   */
  it("drops the agent clause from the copy, not just the link", () => {
    enableAgentPreview();
    const div = render(createElement(SidecarFeed, feedProps));
    const banner = div.querySelector('[data-testid="keyless-banner"]')?.textContent ?? "";
    expect(banner).toMatch(/add a key to read your own writing/i);
    expect(banner).not.toMatch(/agent/i);
  });
});

describe("welcome modal", () => {
  it("shows no agent CTA when the app withholds the handler", () => {
    const div = render(
      createElement(WelcomeModal, {
        onClose: () => {},
        onAddKey: () => {},
        onLoadExample: () => {},
        canLoadExample: true,
        // What `App.tsx` passes on WebKit: `agentPathOffered() ? handler : undefined`.
        onConnectAgent: undefined,
      })
    );
    expect(div.textContent).not.toMatch(/connect your agent/i);
  });
});

describe("engine control", () => {
  it("renders no agent tab, and says why in its place", () => {
    enableAgentPreview();
    render(createElement(ControlCenter, controlProps));
    act(() => openSettings());

    // The segmented control is gone entirely rather than left showing one option —
    // a choice of one is noise, which is already why the group hides when the flag
    // is off. Not a disabled tab: on iOS every browser is WebKit, so most affected
    // users are on touch, where a disabled control gives no reason on tap.
    expect(document.querySelector('[data-testid="engine-select"]')).toBeNull();
    const note = document.querySelector('[data-testid="engine-agent-unavailable"]');
    expect(note?.textContent).toMatch(/chrome, edge, or firefox/i);
    // Somewhere to land for the user who has heard of the feature. Trailing slash is
    // load-bearing — the SW denylist covers the no-slash form.
    expect(note?.querySelector("a")?.getAttribute("href")).toBe("/agent/");
  });

  /**
   * The defect this whole entry exists for. Reaching the agent information surface
   * on WebKit must leave the built-in evaluator holding the slot — otherwise the fix
   * moves the bug instead of removing it, and with the CTAs gone the Engine control
   * becomes the *only* way to reach it.
   */
  it("leaves the built-in engine active after Settings is opened", () => {
    enableAgentPreview();
    render(createElement(ControlCenter, controlProps));
    act(() => openSettings());
    expect(isBuiltinEngineActive()).toBe(true);
  });

  it("ignores a connect-agent deep link rather than handing over the slot", () => {
    enableAgentPreview();
    render(createElement(ControlCenter, controlProps));
    act(() => openSettings("connect-agent"));
    // Settings still opens — the intent is not an error, it just cannot be honoured
    // here — but the slot does not move and no pairing starts.
    expect(document.querySelector('[data-testid="settings-panel"]')).not.toBeNull();
    expect(isBuiltinEngineActive()).toBe(true);
    expect(document.querySelector('[data-testid="connect-agent"]')).toBeNull();
  });
});
