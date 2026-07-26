/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { ConnectAgent } from "./ConnectAgent";
import type { AgentBridgeView } from "./useAgentBridge";
import type { BridgeState } from "../services/agentBridgeClient";
import { EMPTY_PASS } from "./agentActivityView";
import { AGENT_CAPABILITY_ASKS } from "./agentCapabilities";

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
    //
    // It still passes under the UX-042 fold, and that is the point rather than a
    // loophole: the fold is a max-height on the box, so the whole string stays in the
    // DOM, selectable and copyable, at every moment. Only the visible height changes.
    // If someone "implements the peek" by slicing the string, this goes red — which is
    // exactly the difference between a peek and the preview UX-032 threw out.
    const tail = "the last line the user must be able to read";
    const long = `${"a filler line of prompt text\n".repeat(40)}${tail}`;
    render({ state: "waiting", prompt: long });
    const pre = container.querySelector('[data-testid="connect-agent-prompt"]');
    expect(pre?.textContent).toContain(tail);
    expect(pre?.textContent?.length).toBe(long.length);
  });

  it("rests folded and unfolds on click, with the whole prompt present throughout (UX-042)", () => {
    // ~300 lines rendered at full height left no room for anything else in the panel.
    // The unfold is a real button with aria-expanded — not a hover reveal, not a fade
    // that merely suggests there is more.
    const tail = "the last line the user must be able to read";
    const long = `${"a filler line of prompt text\n".repeat(40)}${tail}`;
    render({ state: "waiting", prompt: long });
    const box = container.querySelector('[data-testid="connect-agent-prompt-box"]')!;
    const unfold = container.querySelector<HTMLButtonElement>(
      '[data-testid="connect-agent-prompt-unfold"]'
    )!;
    const pre = container.querySelector('[data-testid="connect-agent-prompt"]');

    expect(unfold.tagName).toBe("BUTTON");
    expect(unfold.getAttribute("aria-expanded")).toBe("false");
    expect(box.className).not.toContain("is-open");
    // Folded, the text is already all there — the fold is height, not content.
    expect(pre?.textContent?.length).toBe(long.length);

    act(() => {
      unfold.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(unfold.getAttribute("aria-expanded")).toBe("true");
    expect(box.className).toContain("is-open");
    expect(pre?.textContent?.length).toBe(long.length);
  });

  it("answers what the paste does in place, with the article as the longer read (UX-042)", () => {
    // The link used to be the only answer, one level off-surface. It stays, demoted to
    // the deep read; the sentence beside it now carries the short true version — including
    // the reassurance that nothing lands in the user's project, which used to sit inside
    // the collapsed "Not working?" disclosure, i.e. after the doubt rather than before it.
    const text = render({ state: "waiting", prompt: "x" });
    expect(text).toMatch(/temp folder/i);
    expect(text).toMatch(/nothing is written to your project/i);
    const meta = container.querySelector(".connect-meta")!;
    expect(meta.querySelector('[data-testid="connect-agent-explain"]')).not.toBeNull();
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

  // UX-043: every capability a connected agent has was documented only in the file
  // addressed to the agent, which the user pastes without reading. The connected state
  // reported an address and a cadence and never said what the connection was for.
  it("connected says what the agent can be asked for, in a person's words", () => {
    const text = render({ state: "connected" });
    for (const { ask } of AGENT_CAPABILITY_ASKS) {
      expect(text, `the connected panel never renders "${ask}"`).toContain(ask);
    }
    // The reach line — the one quality lever on this path, and the only place the product
    // admits that the agent knows things this document doesn't say.
    expect(text).toMatch(/folder on your machine/i);
    // The honest edge is half the point and is the half a future trim would drop first.
    expect(text).toMatch(/your reader only gets the document/i);
    expect(
      container.querySelector('[data-testid="connect-agent-capabilities"]')
    ).not.toBeNull();
  });

  it("keeps the capability block out of the states before a connection exists", () => {
    // The waiting state was just trimmed for saying everything at once (UX-042), and idle
    // is a decision surface. Naming capability in either is the same aggregate failure one
    // surface earlier — and in idle it would advertise what the user has not yet got.
    for (const state of ["idle", "waiting"] as const) {
      const text = render({ state, prompt: "x" });
      expect(text, `${state} leaked the capability block`).not.toContain(
        AGENT_CAPABILITY_ASKS[0].ask
      );
    }
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

  // The pre-flight and blocked callouts render app-level (`AgentPreflightCallout`),
  // covered in that component's own test. Here we only cover the waiting-state
  // copy this section still owns.
  describe("the waiting-state permission line", () => {
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

  /**
   * What the lede is for, and what it must not repeat (UX-030, fixed 2026-07-26).
   *
   * Two rules, and they pull in opposite directions, which is why both are pinned.
   *
   * 1. The lede must NOT restate where the document goes. The engine help one control
   *    up already says it, and until this fix both lines ended in the same eleven
   *    words about 60px apart — two components each introducing the same feature
   *    because neither knew the other had rendered. The privacy claim belongs at the
   *    moment of choosing, so it lives in the engine help (guarded in
   *    `ControlCenter.engine.test.ts`) and not here.
   * 2. The retired "never leaves this machine" claim must never come back anywhere.
   *    It is false — the agent forwards the writing to whatever model it runs — and
   *    it is warm and reads well, so it is exactly the line a copy pass re-adds.
   *
   * Rule 1 could be satisfied by deleting the lede outright, so each case also
   * asserts the thing the lede uniquely carries: which agents this works with.
   */
  describe("the lede says its own thing, once", () => {
    for (const [name, view] of [
      ["idle", { state: "idle" as const }],
      [
        "unsupported",
        { state: "idle" as const, support: { supported: false, reason: "webkit_loopback" } },
      ],
    ] as const) {
      it(`${name}: names the agents without restating where the document goes`, () => {
        const text = render(view);
        expect(text).toMatch(/Claude Code, Codex, or another/);
        // Both phrasings the duplicated clause has worn: the pre-2026-07-25 wording and
        // the #281 rewrite. A guard pinned to one string is how this regressed the first
        // time — the words changed and the duplication rode straight through.
        expect(text).not.toMatch(/not to a (writtten )?server( of ours)?/i);
        expect(text).not.toMatch(/no api key/i);
        expect(text).not.toMatch(/never leaves (this|your) machine/i);
      });
    }

    /** The caps section title titled a peer section over the body of a choice the
     *  user had just made one control up. */
    it("does not head itself as a section", () => {
      render({ state: "idle" });
      expect(container.querySelector(".setting-section-title")).toBeNull();
    });

    /** The button and this sentence were inline siblings, so the sentence wrapped
     *  around the button instead of sitting under it. */
    it("stacks the CTA above its qualifying sentence", () => {
      render({ state: "idle" });
      const cta = container.querySelector(".connect-cta");
      expect(cta).not.toBeNull();
      expect(cta?.querySelector('[data-testid="connect-agent-start"]')).not.toBeNull();
      expect(cta?.querySelector(".setting-help")).not.toBeNull();
    });
  });
});
