/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { ConnectAgent } from "./ConnectAgent";
import type { AgentBridgeView } from "./useAgentBridge";
import type { BridgeState } from "../services/agentBridgeClient";
import { EMPTY_PASS } from "./agentActivityView";

let container: HTMLDivElement;

function render(view: Partial<AgentBridgeView> & { state: BridgeState }) {
  const { state, ...rest } = view;
  const props: AgentBridgeView = {
    enabled: true,
    support: rest.support ?? { supported: true },
    // An explicit `status` wins wholesale — merging with `??` would silently override a
    // deliberate `agentName: null`, which is the case one of these tests exercises.
    status: rest.status ?? {
      state,
      agentName: "Claude Code",
      port: 8787,
      error: null,
      docVersion: null,
      sessionId: "sess-1",
      pass: EMPTY_PASS,
    },
    prompt: rest.prompt ?? null,
    promptError: rest.promptError ?? null,
    connect: rest.connect ?? vi.fn(),
    cancel: rest.cancel ?? vi.fn(),
    activeFromSource: rest.activeFromSource ?? 0,
    revoke: rest.revoke ?? vi.fn(async () => undefined),
  };
  act(() => {
    createRoot(container).render(createElement(ConnectAgent, props));
  });
  return container.textContent ?? "";
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

describe("ConnectAgent — states", () => {
  it("idle offers the connect action and names the browser limitation", () => {
    const text = render({ state: "idle" });
    expect(container.querySelector('[data-testid="connect-agent-start"]')).not.toBeNull();
    // The Safari limit is said plainly rather than discovered by a failed pairing.
    expect(text).toMatch(/Safari/);
    expect(container.querySelector('[data-testid="connect-agent-prompt"]')).toBeNull();
  });

  // UX-025: the panel used to offer the button, start an infinite port probe,
  // and park the user on "Waiting for your agent…" forever — against a
  // limitation already knowable at render time.
  it("refuses up front on a browser that cannot reach a bridge", () => {
    const text = render({ state: "idle", support: { supported: false, reason: "webkit_loopback" } });
    expect(container.querySelector('[data-testid="connect-agent-unsupported"]')).not.toBeNull();
    // No CTA into a dead end, and no spinner that can never resolve.
    expect(container.querySelector('[data-testid="connect-agent-start"]')).toBeNull();
    expect(text).not.toMatch(/Waiting for your agent/);
    // Names the working route rather than only the broken one.
    expect(text).toMatch(/Chrome, Edge, or Firefox/);
  });

  it("an unsupported browser is told the key route still works", () => {
    const text = render({ state: "idle", support: { supported: false, reason: "webkit_loopback" } });
    expect(text).toMatch(/API key still works/);
  });

  it("waiting shows the prompt and a copy affordance", () => {
    const text = render({ state: "waiting", prompt: "# Review a writtten document\nbody" });
    expect(text).toMatch(/Waiting for your agent/);
    expect(container.querySelector('[data-testid="connect-agent-copy"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="connect-agent-prompt"]')?.textContent).toContain(
      "Review a writtten document"
    );
  });

  it("waiting disables copy until the prompt is built", () => {
    render({ state: "waiting", prompt: null });
    const btn = container.querySelector<HTMLButtonElement>('[data-testid="connect-agent-copy"]');
    expect(btn?.disabled).toBe(true);
  });

  it("surfaces a stale-bridge protocol mismatch as a re-copy instruction", () => {
    const text = render({
      state: "waiting",
      prompt: "x",
      status: {
        state: "waiting",
        agentName: null,
        port: null,
        error: "version_mismatch",
        docVersion: null,
        sessionId: null,
        pass: EMPTY_PASS,
      },
    });
    expect(text).toMatch(/older protocol/);
  });

  it("connected names the agent and the loopback address", () => {
    const text = render({ state: "connected" });
    expect(text).toContain("Connected · Claude Code");
    // The port is the honest privacy proof — the user can see it is loopback.
    expect(text).toContain("127.0.0.1:8787");
  });

  it("disconnected keeps the agent's name and says the cards survive", () => {
    const text = render({ state: "disconnected" });
    expect(text).toContain("Disconnected · Claude Code");
    // Silence here would read as data loss.
    expect(text).toMatch(/cards stay in your feed/);
  });

  it("falls back to a neutral label when the agent reported no name", () => {
    const text = render({
      state: "connected",
      status: {
        state: "connected",
        agentName: null,
        port: 8788,
        error: null,
        docVersion: null,
        sessionId: null,
        pass: EMPTY_PASS,
      },
    });
    expect(text).toContain("Connected · agent");
  });
});

// ---------------------------------------------------------------------------
// BYOA (PR3) — teardown when the source left observations behind.
//
// Disconnecting is only a decision when there are cards to strand. The archive
// option is opt-in: the observations belong to the user, not to the connection.
// ---------------------------------------------------------------------------

describe("ConnectAgent — teardown", () => {
  it("disconnects immediately when the source submitted nothing", () => {
    const cancel = vi.fn();
    const revoke = vi.fn(async () => undefined);
    render({ state: "connected", activeFromSource: 0, cancel, revoke });

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="connect-agent-disconnect"]')!.click();
    });

    expect(cancel).toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="connect-agent-confirm"]')).toBeNull();
  });

  it("asks first when the source has active cards, and names how many", () => {
    render({ state: "connected", activeFromSource: 4 });

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="connect-agent-disconnect"]')!.click();
    });

    const confirm = container.querySelector('[data-testid="connect-agent-confirm"]');
    expect(confirm).not.toBeNull();
    expect(confirm?.textContent).toContain("4 observations");
  });

  it("keeps the cards by default", () => {
    const revoke = vi.fn(async () => undefined);
    render({ state: "connected", activeFromSource: 2, revoke });

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="connect-agent-disconnect"]')!.click();
    });
    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="connect-agent-confirm-ok"]')!.click();
    });

    expect(revoke).toHaveBeenCalledWith(false);
  });

  it("archives them only when the option is checked", () => {
    const revoke = vi.fn(async () => undefined);
    render({ state: "connected", activeFromSource: 2, revoke });

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="connect-agent-disconnect"]')!.click();
    });
    act(() => {
      container
        .querySelector<HTMLInputElement>('[data-testid="connect-agent-archive-opt"]')!
        .click();
    });
    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="connect-agent-confirm-ok"]')!.click();
    });

    expect(revoke).toHaveBeenCalledWith(true);
  });

  it("cancelling the confirm leaves the pairing alone", () => {
    const cancel = vi.fn();
    const revoke = vi.fn(async () => undefined);
    render({ state: "connected", activeFromSource: 3, cancel, revoke });

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="connect-agent-disconnect"]')!.click();
    });
    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="connect-agent-confirm-cancel"]')!
        .click();
    });

    expect(revoke).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="connect-agent-confirm"]')).toBeNull();
  });

  it("offers the same choice from the disconnected state's Forget action", () => {
    // A dropped bridge still leaves its cards behind, so Forget has the same
    // decision attached to it as Disconnect.
    render({ state: "disconnected", activeFromSource: 1 });

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="connect-agent-forget"]')!.click();
    });

    const confirm = container.querySelector('[data-testid="connect-agent-confirm"]');
    expect(confirm?.textContent).toContain("1 observation ");
  });
});
