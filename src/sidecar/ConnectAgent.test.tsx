/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { ConnectAgent } from "./ConnectAgent";
import type { AgentBridgeView } from "./useAgentBridge";
import type { BridgeState } from "../services/agentBridgeClient";

let container: HTMLDivElement;

function render(view: Partial<AgentBridgeView> & { state: BridgeState }) {
  const { state, ...rest } = view;
  const props: AgentBridgeView = {
    enabled: true,
    // An explicit `status` wins wholesale — merging with `??` would silently override a
    // deliberate `agentName: null`, which is the case one of these tests exercises.
    status: rest.status ?? {
      state,
      agentName: "Claude Code",
      port: 8787,
      error: null,
      docVersion: null,
    },
    prompt: rest.prompt ?? null,
    promptError: rest.promptError ?? null,
    connect: rest.connect ?? vi.fn(),
    cancel: rest.cancel ?? vi.fn(),
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
      status: { state: "waiting", agentName: null, port: null, error: "version_mismatch", docVersion: null },
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
      status: { state: "connected", agentName: null, port: 8788, error: null, docVersion: null },
    });
    expect(text).toContain("Connected · agent");
  });
});
