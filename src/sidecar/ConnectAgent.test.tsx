/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
    preflight: rest.preflight ?? "none",
    proceed: rest.proceed ?? vi.fn(),
    recheckPermission: rest.recheckPermission ?? vi.fn(),
    stalled: rest.stalled ?? false,
    // Defaults to the unreadable branch so the existing cases keep asserting the
    // old unconditional warning; the branch-specific cases opt out explicitly.
    permissionUnreadable: rest.permissionUnreadable ?? true,
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

  it("shows the prompt whole rather than a clipped preview (UX-032)", () => {
    // The panel used to render `prompt.slice(0, 420)` behind a fade, because the prompt
    // was 33k characters. Slimming removed the reason, and a user asked to relay
    // instructions to their own agent should be able to read them first. A future change
    // that reintroduces truncation to "tidy up" the panel should fail here.
    const tail = "the last line the user must be able to read";
    const long = `${"a filler line of prompt text\n".repeat(40)}${tail}`;
    render({ state: "waiting", prompt: long });
    const pre = container.querySelector('[data-testid="connect-agent-prompt"]');
    expect(pre?.textContent).toContain(tail);
    expect(pre?.textContent?.length).toBe(long.length);
  });

  it("points at the public explanation of what the paste does (UX-032)", () => {
    // The explanation existed at /agent from the day BYOA shipped, and nothing in the app
    // linked to it — so the one place a user might want it was the one place it was absent.
    render({ state: "waiting", prompt: "x" });
    const link = container.querySelector<HTMLAnchorElement>(
      '[data-testid="connect-agent-explain"]'
    );
    expect(link?.getAttribute("href")).toBe("/agent/");
  });

  it("no longer tells the user to delete a file it does not create (UX-039)", () => {
    // The script is fetched to the OS temp directory now. The old disclosure told the user
    // to go find and delete it, which would send them hunting for nothing.
    const text = render({ state: "waiting", prompt: "x" });
    expect(text).not.toMatch(/delete it when you/i);
    expect(text).toMatch(/temp folder/i);
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

  describe("the local-network permission pre-flight", () => {
    it("asks before probing, and Continue is what starts the probe", () => {
      // The probe is what raises the browser dialog, so the explanation has to be
      // a separate step ahead of it — not something rendered alongside it.
      const proceed = vi.fn();
      const text = render({ state: "idle", preflight: "asking", proceed });

      expect(text).toContain("your browser will ask to reach your local network");
      // The connect button is replaced, not accompanied.
      expect(container.querySelector('[data-testid="connect-agent-start"]')).toBeNull();

      act(() => {
        container
          .querySelector<HTMLButtonElement>('[data-testid="connect-agent-preflight-continue"]')!
          .click();
      });
      expect(proceed).toHaveBeenCalledOnce();
    });

    it("answers why a writing tool wants the local network, in a disclosure", () => {
      render({ state: "idle", preflight: "asking" });
      const why = container.querySelector(".connect-preflight-why");
      // A <details>, not a link — the first build styled it as an underlined
      // accent link, which read as navigation to another page.
      expect(why?.tagName).toBe("DETAILS");
      expect(why?.textContent).toContain("127.0.0.1");
    });

    it("on denied, refuses to probe and offers the recovery path instead", () => {
      const recheckPermission = vi.fn();
      const text = render({ state: "idle", preflight: "blocked", recheckPermission });

      expect(text).toContain("allowing writtten to reach your local network");
      expect(container.querySelector('[data-testid="connect-agent-start"]')).toBeNull();

      act(() => {
        container.querySelector<HTMLButtonElement>('[data-testid="connect-agent-recheck"]')!.click();
      });
      expect(recheckPermission).toHaveBeenCalledOnce();
    });

    it("leaves a way out of the blocked state", () => {
      // Found in the browser: the block replaces the connect button, so without a
      // dismiss anyone who can't change the setting is stranded in this section
      // with no route back to its own starting state.
      const cancel = vi.fn();
      render({ state: "idle", preflight: "blocked", cancel });

      const back = [...container.querySelectorAll("button")].find(
        (b) => b.textContent === "Not now"
      );
      act(() => back!.click());
      expect(cancel).toHaveBeenCalledOnce();
    });

    it("points recovery at a browser-support section that actually exists", () => {
      render({ state: "idle", preflight: "blocked" });
      const href = container
        .querySelector('[data-testid="connect-agent-blocked"] a')
        ?.getAttribute("href");
      expect(href).toBe("/agent/#browsers");

      // Assert the target, not just the link. A deep link to a heading nobody
      // kept is a silently broken promise — and the page is hand-written HTML
      // with no other anchors, so nothing else would catch its removal.
      // Resolved from cwd, not `import.meta.url`: this file runs under jsdom,
      // where `import.meta.url` is an http URL and `readFileSync` rejects it.
      const page = readFileSync(join(process.cwd(), "public/agent/index.html"), "utf8");
      expect(page).toContain('id="browsers"');
    });

    it("says nothing about permissions once the state is readable", () => {
      // `granted` is every repeat connect. Repeating the warning there is the
      // noise that sinks a warning nobody needs.
      const text = render({ state: "waiting", permissionUnreadable: false });
      expect(text).not.toContain("Your browser will ask for permission");
    });

    it("keeps the unconditional warning when the permission is unreadable", () => {
      // Firefox and anything else we can't vouch for. Saying the generic true
      // thing beats saying nothing.
      const text = render({ state: "waiting", permissionUnreadable: true });
      expect(text).toContain("Your browser will ask for permission");
    });
  });

  describe("the wait that isn't going anywhere", () => {
    it("stays quiet until the wait has actually run long", () => {
      const text = render({ state: "waiting", stalled: false });
      expect(text).not.toContain("Still nothing");
    });

    it("names all three causes without claiming to know which", () => {
      // Every detection built here can still be wrong — a suppressed dialog, a
      // force-denying shell, an allow followed by no bridge. This is the net.
      const text = render({ state: "waiting", stalled: true });
      expect(text).toContain("Still nothing on 127.0.0.1");
      expect(text).toContain("the local-network prompt");
      expect(text).toContain("started the bridge yet");
      expect(text).toContain("every candidate port was busy");
    });
  });
});
