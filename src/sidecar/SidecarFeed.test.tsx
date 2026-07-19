/** @vitest-environment jsdom */

/**
 * L7 regression tests — prod prompt-leak.
 *
 * The debug panel shows full LLM prompts (user's document text). It must:
 *   1. Default to hidden (the drawer is collapsed by default — debugExpanded
 *      starts false — so the prompt content isn't rendered at rest).
 *   2. Only be accessible in DEV builds (import.meta.env.DEV gate).
 *
 * These tests guard the default-off invariant. The DEV-gate itself is a
 * build-time dead-code-elimination guarantee, not something we can toggle
 * in a test environment, but the default-off state is the primary guard.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { SidecarFeed } from "./SidecarFeed";
import { ControlCenter } from "./ControlCenter";
import { openSettings } from "./settingsGate";
import type { Observation } from "../store/db";
import { setAgentSourceStatus, __resetAgentSourceStatus } from "../model/agentSourceSignal";
import { FEATURE_AGENT_BRIDGE } from "../services/featureFlags";

const minProps = {
  observations: [] as never[],
  apiKey: "",
  onApiKeyChange: () => {},
  stage: "",
  onStageChange: () => {},
  hoveredObservationId: null,
  onHoverObservation: () => {},
  onDismissObservation: async () => undefined,
  onClearWorkspace: () => {},
  // Default to the keyed state so the quiet empty state renders as before; the
  // keyless-banner tests opt into hasKey: false explicitly.
  hasKey: true,
};

describe("SidecarFeed debug panel (L7 — prod prompt-leak)", () => {
  const containers: HTMLDivElement[] = [];

  function render() {
    const div = document.createElement("div");
    document.body.appendChild(div);
    containers.push(div);
    act(() => {
      // The debug panel now lives in ControlCenter (always-visible, lifted out
      // of the collapsible feed). This guards its default-off invariant.
      createRoot(div).render(createElement(ControlCenter, minProps));
    });
    return div;
  }

  afterEach(() => {
    for (const c of containers) {
      act(() => {
        // Unmount by rendering null is not straightforward; just remove from DOM.
        c.remove();
      });
    }
    containers.length = 0;
  });

  it("debug panel is hidden on initial render (drawer is collapsed by default)", () => {
    const div = render();
    // The debug drawer is now always mounted in DEV (no Settings toggle), but its
    // prompt content (className="debug-panel") only renders once `debugExpanded`
    // is true — which defaults to false, so nothing leaks at rest.
    // Regression: if this fails, someone set debugExpanded's useState(true).
    expect(div.querySelector(".debug-panel")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Settings deep-link (settingsGate) — the welcome modal + keyless banner open
// the BYOK Settings modal without owning ControlCenter's state. This guards the
// event seam end-to-end: an openSettings() call reveals ControlCenter's panel.
// ---------------------------------------------------------------------------

describe("ControlCenter — opens Settings on the open-settings event", () => {
  const containers: HTMLDivElement[] = [];

  afterEach(() => {
    for (const c of containers) act(() => c.remove());
    containers.length = 0;
  });

  it("reveals the settings panel when openSettings() fires", () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    containers.push(div);
    act(() => {
      createRoot(div).render(createElement(ControlCenter, minProps));
    });
    // Settings modal is closed by default.
    expect(document.querySelector('[data-testid="settings-panel"]')).toBeNull();
    act(() => openSettings());
    expect(document.querySelector('[data-testid="settings-panel"]')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// UX-015 — the rendered feed shows the priority-banded order end-to-end.
//
// Unit tests cover partitionFeed in isolation; this renders the real SidecarFeed
// and asserts the DOM card order, proving the renderer maps `visible` (already
// band-then-doc ordered) unchanged. The scenario is the exact 2026-07-02 bug: a
// doc-scoped missing_topic (priority 1.5) that pure document-order pinned BELOW
// low-priority clarity nits (0.75) now renders ABOVE them (Key band first).
// ---------------------------------------------------------------------------

function obs(over: Partial<Observation> & { id: string }): Observation {
  return {
    docId: "default",
    type: "clarity",
    scope: "span",
    kind: "problem",
    severity: "low",
    confidence: "medium",
    priority: 0.75,
    text: "",
    status: "active",
    ...over,
  };
}

describe("SidecarFeed — priority-banded render order (UX-015)", () => {
  const containers: HTMLDivElement[] = [];

  function renderWith(observations: Observation[]): HTMLDivElement {
    const div = document.createElement("div");
    document.body.appendChild(div);
    containers.push(div);
    act(() => {
      createRoot(div).render(createElement(SidecarFeed, { ...minProps, observations }));
    });
    return div;
  }

  afterEach(() => {
    for (const c of containers) act(() => c.remove());
    containers.length = 0;
  });

  it("a doc-scoped missing_topic (1.5) renders above low-priority clarity nits (0.75)", () => {
    const clarityEarly = obs({
      id: "c1",
      type: "clarity",
      priority: 0.75,
      blockId: "b1",
      startOffset: 0,
      endOffset: 10,
      text: "'non-invasive way' is vague.",
    });
    const clarityLate = obs({
      id: "c2",
      type: "clarity",
      priority: 0.75,
      blockId: "b2",
      startOffset: 0,
      endOffset: 10,
      text: "'native way' is vague.",
    });
    const missingTopic = obs({
      id: "m1",
      type: "missing_topic",
      scope: "document",
      severity: "medium",
      priority: 1.5,
      blockId: undefined,
      text: "No competitor positioning.",
    });

    // Input order deliberately puts the doc-scoped note last (its DB/insertion
    // position) — the OLD pure-document-order path would keep it at the bottom.
    const div = renderWith([clarityEarly, clarityLate, missingTopic]);

    const types = Array.from(div.querySelectorAll('[data-testid="obs-card"]')).map((el) =>
      el.getAttribute("data-obs-type")
    );

    expect(types).toEqual(["missing_topic", "clarity", "clarity"]);
  });
});

// ---------------------------------------------------------------------------
// UX-008 — quoted-text subtitle on cards.
//
// A span observation quotes its stored `anchorText` back at the user between the
// type tag and the body (serif-italic, muted) so the passage is legible without
// eye-travel to the editor. When there is no anchorText to quote (doc-scope
// observations, or span cards missing anchorText) the subtitle is simply absent
// — only the message shows.
// ---------------------------------------------------------------------------

describe("SidecarFeed — quoted-text subtitle (UX-008)", () => {
  const containers: HTMLDivElement[] = [];

  function renderWith(observations: Observation[]): HTMLDivElement {
    const div = document.createElement("div");
    document.body.appendChild(div);
    containers.push(div);
    act(() => {
      createRoot(div).render(createElement(SidecarFeed, { ...minProps, observations }));
    });
    return div;
  }

  afterEach(() => {
    for (const c of containers) act(() => c.remove());
    containers.length = 0;
  });

  it("quotes a span observation's anchorText as the subtitle", () => {
    const div = renderWith([
      obs({
        id: "s1",
        type: "clarity",
        blockId: "b1",
        startOffset: 0,
        endOffset: 15,
        anchorText: "non-invasive way",
        text: "'non-invasive way' is vague.",
      }),
    ]);
    const anchor = div.querySelector('[data-testid="obs-anchor"]');
    expect(anchor).not.toBeNull();
    // A span check's anchorText is the user's verbatim words — a mid-sentence,
    // lowercase clause — so it leads and trails with an ellipsis (UX-008).
    expect(anchor?.textContent).toBe("“…non-invasive way…”");
    // The full span stays reachable — the truncated quote carries a title tooltip
    // with the raw excerpt (no formatting ellipses).
    expect(anchor?.getAttribute("title")).toBe("non-invasive way");
    // Doc-scope label must not appear for a span card.
    expect(div.querySelector('[data-testid="obs-anchor-doc"]')).toBeNull();
  });

  it("renders no subtitle for a doc-scope observation with no anchorText", () => {
    const div = renderWith([
      obs({
        id: "m1",
        type: "missing_topic",
        scope: "document",
        blockId: undefined,
        text: "No competitor positioning.",
      }),
    ]);
    // No quote to show → no subtitle at all, just the message.
    expect(div.querySelector('[data-testid="obs-anchor-doc"]')).toBeNull();
    expect(div.querySelector('[data-testid="obs-anchor"]')).toBeNull();
  });

  it("renders no subtitle for a span observation lacking anchorText", () => {
    const div = renderWith([
      obs({ id: "s2", type: "clarity", blockId: "b1", startOffset: 0, endOffset: 5 }),
    ]);
    expect(div.querySelector('[data-testid="obs-anchor"]')).toBeNull();
    expect(div.querySelector('[data-testid="obs-anchor-doc"]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// UX-006 — reverse-hover focus in the open feed.
//
// When a span is dwelled on, every card dims in place (no reorder) — the focused
// card is surfaced by the floating SpanPeek pinned to the gutter top, so it's
// always on-screen even if the feed is scrolled. Releasing restores full opacity.
// ---------------------------------------------------------------------------

describe("SidecarFeed — reverse-hover focus (UX-006)", () => {
  const containers: HTMLDivElement[] = [];

  function renderWith(observations: Observation[], spanFocusObsId: string | null): HTMLDivElement {
    const div = document.createElement("div");
    document.body.appendChild(div);
    containers.push(div);
    act(() => {
      createRoot(div).render(
        createElement(SidecarFeed, {
          ...minProps,
          observations,
          spanFocusObsId,
        })
      );
    });
    return div;
  }

  afterEach(() => {
    for (const c of containers) act(() => c.remove());
    containers.length = 0;
  });

  const three = [
    obs({ id: "a", type: "clarity", blockId: "b1", startOffset: 0, endOffset: 5, priority: 1 }),
    obs({ id: "b", type: "clarity", blockId: "b2", startOffset: 0, endOffset: 5, priority: 1 }),
    obs({ id: "c", type: "clarity", blockId: "b3", startOffset: 0, endOffset: 5, priority: 1 }),
  ];

  function cardIds(div: HTMLDivElement): string[] {
    return Array.from(div.querySelectorAll('[data-testid="obs-card"]')).map(
      (el) => el.getAttribute("data-obs-id") ?? ""
    );
  }

  it("dims every card in place (no reorder) when a span is focused", () => {
    const div = renderWith(three, "c");
    // Order is unchanged — the focused card is surfaced by the float, not moved.
    expect(cardIds(div)).toEqual(["a", "b", "c"]);
    // No card rises; all three (including the focused one) recede.
    expect(div.querySelector(".observation-card-spotlit")).toBeNull();
    const dimmed = Array.from(div.querySelectorAll(".observation-card-dimmed")).map((el) =>
      el.getAttribute("data-obs-id")
    );
    expect(dimmed.sort()).toEqual(["a", "b", "c"]);
  });

  it("restores full opacity when nothing is focused", () => {
    const div = renderWith(three, null);
    expect(cardIds(div)).toEqual(["a", "b", "c"]);
    expect(div.querySelector(".observation-card-dimmed")).toBeNull();
  });

  it("dims uniformly even for co-located spans (C9 set stacks in the float, not the feed)", () => {
    // The whole covering set surfaces together in the SpanPeek float; the feed
    // stays uniformly dimmed so no un-dimmed card collides with the float.
    const div = renderWith(three, "c");
    const dimmed = Array.from(div.querySelectorAll(".observation-card-dimmed"))
      .map((el) => el.getAttribute("data-obs-id"))
      .sort();
    expect(dimmed).toEqual(["a", "b", "c"]);
  });
});

// ---------------------------------------------------------------------------
// C2 — click a card to locate its span. Clicking the card body dispatches
// `obs-card-activate`; clicking the dismiss button does NOT (it dismisses).
// ---------------------------------------------------------------------------

describe("SidecarFeed — click-to-locate (C2)", () => {
  const containers: HTMLDivElement[] = [];

  function renderOne(): HTMLDivElement {
    const div = document.createElement("div");
    document.body.appendChild(div);
    containers.push(div);
    act(() => {
      createRoot(div).render(
        createElement(SidecarFeed, {
          ...minProps,
          observations: [
            obs({ id: "x", type: "clarity", blockId: "b1", startOffset: 0, endOffset: 5 }),
          ],
        })
      );
    });
    return div;
  }

  afterEach(() => {
    for (const c of containers) act(() => c.remove());
    containers.length = 0;
  });

  it("dispatches obs-card-activate when the card body is clicked", () => {
    const div = renderOne();
    const events: string[] = [];
    const handler = (e: Event) => events.push((e as CustomEvent<{ id: string }>).detail.id);
    window.addEventListener("obs-card-activate", handler);
    act(() => {
      div.querySelector('[data-testid="obs-card"]')?.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });
    window.removeEventListener("obs-card-activate", handler);
    expect(events).toEqual(["x"]);
  });

  it("does NOT activate when the dismiss button is clicked", () => {
    const div = renderOne();
    const events: string[] = [];
    const handler = (e: Event) => events.push((e as CustomEvent<{ id: string }>).detail.id);
    window.addEventListener("obs-card-activate", handler);
    act(() => {
      div.querySelector('[data-testid="obs-dismiss"]')?.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });
    window.removeEventListener("obs-card-activate", handler);
    expect(events).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// First-run activation — the standing keyless banner + the empty-state split.
// The welcome MODAL itself lives in WelcomeModal.tsx (WelcomeModal.test.tsx);
// the feed's job here is the standing banner and reserving the quiet empty
// state for the keyed state. (onboarding_first_run.md § Revision 2026-07-07.)
// ---------------------------------------------------------------------------

describe("SidecarFeed — keyless banner + empty-state split", () => {
  const containers: HTMLDivElement[] = [];

  function renderWith(props: Record<string, unknown>): HTMLDivElement {
    const div = document.createElement("div");
    document.body.appendChild(div);
    containers.push(div);
    act(() => {
      createRoot(div).render(createElement(SidecarFeed, { ...minProps, ...props }));
    });
    return div;
  }

  afterEach(() => {
    for (const c of containers) act(() => c.remove());
    containers.length = 0;
  });

  it("shows the standing keyless banner only when there is no key", () => {
    expect(renderWith({ hasKey: true }).querySelector('[data-testid="keyless-banner"]')).toBeNull();
    expect(
      renderWith({ hasKey: false }).querySelector('[data-testid="keyless-banner"]')
    ).not.toBeNull();
  });

  it("reserves the quiet empty state for the keyed state (keyless shows the banner instead)", () => {
    // Keyed + no observations → the calm empty state.
    const keyed = renderWith({ hasKey: true, observations: [] });
    expect(keyed.querySelector(".sidecar-empty")).not.toBeNull();
    expect(keyed.querySelector('[data-testid="keyless-banner"]')).toBeNull();

    // Keyless + no observations → the honest banner, NOT the quiet empty copy.
    const keyless = renderWith({ hasKey: false, observations: [] });
    expect(keyless.querySelector(".sidecar-empty")).toBeNull();
    expect(keyless.querySelector('[data-testid="keyless-banner"]')).not.toBeNull();
  });

  it("the banner's Settings link deep-links into Settings (fires the open-settings event)", () => {
    const div = renderWith({ hasKey: false });
    let opened = 0;
    const handler = () => (opened += 1);
    window.addEventListener("writtten:open-settings", handler);
    act(() => {
      div.querySelector('[data-testid="keyless-banner-settings"]')?.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });
    window.removeEventListener("writtten:open-settings", handler);
    expect(opened).toBe(1);
  });

  // The banner is the only re-entry point once the welcome modal is dismissed,
  // so it carries both on-ramps too (spec decision 3). Asserted against the live
  // flag so the test stays honest whichever way the flag is set.
  it("offers the agent path alongside the key path exactly when the flag allows it", () => {
    const div = renderWith({ hasKey: false });
    const connect = div.querySelector('[data-testid="keyless-banner-connect"]');
    const key = div.querySelector('[data-testid="keyless-banner-settings"]');

    // The key path is unconditional.
    expect(key?.textContent).toMatch(/add your key/i);

    if (FEATURE_AGENT_BRIDGE) {
      expect(connect).not.toBeNull();
      expect(div.querySelector(".keyless-banner-or")?.textContent).toBe("or");
      // Neither route may look like the lesser one: both take the arrow.
      expect(key?.textContent).toContain("→");
      expect(connect?.textContent).toContain("→");
    } else {
      expect(connect).toBeNull();
      expect(div.querySelector(".keyless-banner-or")).toBeNull();
    }
  });

  it("the agent link deep-links with the connect-agent intent, not a bare open", () => {
    if (!FEATURE_AGENT_BRIDGE) return;
    const div = renderWith({ hasKey: false });
    const intents: (string | undefined)[] = [];
    const handler = (e: Event) => intents.push((e as CustomEvent<string | undefined>).detail);
    window.addEventListener("writtten:open-settings", handler);
    act(() => {
      div
        .querySelector('[data-testid="keyless-banner-connect"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      div
        .querySelector('[data-testid="keyless-banner-settings"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    window.removeEventListener("writtten:open-settings", handler);
    // Order matters: the agent link must carry the intent and the key link must not,
    // or the key path would start a pairing nobody asked for. (A CustomEvent with
    // no detail reports `null`, not `undefined` — assert "absent", not a literal.)
    expect(intents).toHaveLength(2);
    expect(intents[0]).toBe("connect-agent");
    expect(intents[1] ?? undefined).toBeUndefined();
  });

  it("tunes the banner copy for the demo vs. the general keyless state", () => {
    const demo = renderWith({ hasKey: false, demoActive: true });
    expect(demo.querySelector(".keyless-banner-lead")?.textContent).toMatch(/demo/i);

    const plain = renderWith({ hasKey: false, demoActive: false });
    expect(plain.querySelector(".keyless-banner-lead")?.textContent).toMatch(/add a key/i);
  });
});

// ---------------------------------------------------------------------------
// First-settle micro-moment (onboarding_first_run.md § First-settle). The hand-
// off to R3c: the empty→first-card transition must not be change-blind (arriving
// animation + "new" badge) yet stay calm (no celebratory toast/confetti).
// ---------------------------------------------------------------------------

describe("SidecarFeed — first-settle micro-moment (empty → first card)", () => {
  const containers: HTMLDivElement[] = [];

  afterEach(() => {
    for (const c of containers) act(() => c.remove());
    containers.length = 0;
  });

  const firstObs: Observation = {
    id: "first-1",
    docId: "doc-1",
    type: "clarity",
    scope: "span",
    kind: "problem",
    severity: "low",
    confidence: "medium",
    priority: 0.75,
    text: "Vague phrase",
    status: "active",
    blockId: "b1",
    startOffset: 0,
    endOffset: 8,
    anchorText: "the moon",
  };

  it("marks the very first observation as arriving (not change-blind) and stays calm", () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    containers.push(div);
    const root = createRoot(div);

    // Empty feed first — the quiet state, no cards.
    act(() => root.render(createElement(SidecarFeed, { ...minProps, observations: [] })));
    expect(div.querySelector(".sidecar-empty")).not.toBeNull();
    expect(div.querySelector('[data-testid="obs-card"]')).toBeNull();

    // First observation settles: the transition must be marked so the user
    // isn't change-blind — arriving class + a quiet "new" badge (R3c).
    act(() =>
      root.render(
        createElement(SidecarFeed, {
          ...minProps,
          observations: [firstObs],
          blockOrder: ["b1"],
        })
      )
    );
    const card = div.querySelector('[data-testid="obs-card"]');
    expect(card).not.toBeNull();
    expect(card?.classList.contains("observation-card-arriving")).toBe(true);
    expect(div.querySelector(".obs-new-badge")).not.toBeNull();
    // Calm: a single first card must not trigger the batch "+N new" indicator.
    expect(div.querySelector(".arrival-indicator")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// C3 — dismiss + in-place Undo placeholder (deferred commit). Dismissing a card
// replaces it IN PLACE with a "Dismissed · Undo" ghost slot. The dismissal is
// deferred: the observation stays live until the placeholder fades (~3s), at
// which point onDismissObservation finalizes it. Undo before then is a pure
// local cancel — nothing is written (which strengthens the G1 guarantee). Each
// dismissal gets its own placeholder.
// ---------------------------------------------------------------------------

describe("SidecarFeed — in-place dismiss + Undo (C3)", () => {
  const containers: HTMLDivElement[] = [];

  afterEach(() => {
    for (const c of containers) act(() => c.remove());
    containers.length = 0;
    vi.useRealTimers();
  });

  function renderWith(props: Record<string, unknown>): HTMLDivElement {
    const div = document.createElement("div");
    document.body.appendChild(div);
    containers.push(div);
    act(() => {
      createRoot(div).render(createElement(SidecarFeed, { ...minProps, ...props }));
    });
    return div;
  }

  function clickDismissAt(div: HTMLDivElement, i = 0) {
    act(() => {
      div.querySelectorAll('[data-testid="obs-dismiss"]')[i]?.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });
  }

  it("replaces the card in place with a placeholder; nothing is written yet", () => {
    vi.useFakeTimers();
    const dismissed: string[] = [];
    const div = renderWith({
      observations: [
        obs({
          id: "d1",
          type: "contradiction",
          kind: "problem",
          severity: "high",
          blockId: "b1",
          startOffset: 0,
          endOffset: 5,
        }),
      ],
      onDismissObservation: (id: string) => {
        dismissed.push(id);
      },
    });

    clickDismissAt(div);
    // In-place: the card is gone from its slot, the placeholder stands there,
    // and — crucially — the dismissal is NOT committed (deferred).
    expect(div.querySelector('[data-testid="obs-card"]')).toBeNull();
    expect(div.querySelector('[data-testid="undo-placeholder"]')).not.toBeNull();
    expect(dismissed).toEqual([]);
  });

  it("Undo restores the card in place and never writes the dismissal", () => {
    vi.useFakeTimers();
    const dismissed: string[] = [];
    const div = renderWith({
      observations: [obs({ id: "u1", blockId: "b1", startOffset: 0, endOffset: 3 })],
      onDismissObservation: (id: string) => {
        dismissed.push(id);
      },
    });

    clickDismissAt(div);
    expect(div.querySelector('[data-testid="undo-placeholder"]')).not.toBeNull();

    act(() => {
      div.querySelector('[data-testid="undo-action"]')?.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });

    // Card back in its slot, placeholder gone, and onDismissObservation never fired.
    expect(div.querySelector('[data-testid="undo-placeholder"]')).toBeNull();
    expect(div.querySelector('[data-testid="obs-card"]')).not.toBeNull();
    expect(dismissed).toEqual([]);
  });

  it("finalizes the dismissal (writes each member) after the ~3s fade", async () => {
    vi.useFakeTimers();
    const dismissed: string[] = [];
    const div = renderWith({
      // Same span → aggregated into one group (primary + others).
      observations: [
        obs({ id: "g1", type: "clarity", blockId: "b1", startOffset: 2, endOffset: 8, priority: 0.9 }),
        obs({
          id: "g2",
          type: "undefined_jargon",
          blockId: "b1",
          startOffset: 2,
          endOffset: 8,
          priority: 0.5,
        }),
      ],
      onDismissObservation: async (id: string) => {
        dismissed.push(id);
      },
    });

    clickDismissAt(div);
    // Not yet: still within the pending window.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(dismissed).toEqual([]);
    expect(div.querySelector('[data-testid="undo-placeholder"]')).not.toBeNull();

    // Past the ~3s lifetime + the fade → every group member is finalized.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3300);
    });
    expect(dismissed.sort()).toEqual(["g1", "g2"]);
    expect(div.querySelector('[data-testid="undo-placeholder"]')).toBeNull();
  });

  it("each dismissal gets its own in-place placeholder", () => {
    vi.useFakeTimers();
    const div = renderWith({
      // Two different spans → two separate cards.
      observations: [
        obs({ id: "p1", blockId: "b1", startOffset: 0, endOffset: 4 }),
        obs({ id: "p2", blockId: "b2", startOffset: 0, endOffset: 4 }),
      ],
      onDismissObservation: () => {},
    });

    expect(div.querySelectorAll('[data-testid="obs-card"]').length).toBe(2);
    clickDismissAt(div, 0);
    clickDismissAt(div, 0); // the remaining card's dismiss is now index 0
    expect(div.querySelectorAll('[data-testid="undo-placeholder"]').length).toBe(2);
    expect(div.querySelectorAll('[data-testid="obs-card"]').length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Truncation-honesty note (heading-cliff facet 2) — while any section exceeds
// MAX_SECTION_CHARS the feed says so; dismissal is per truncated-set (the note
// returns only when the SET changes — new information, not a re-nag).
// ---------------------------------------------------------------------------

describe("SidecarFeed — truncation-honesty note", () => {
  const containers: HTMLDivElement[] = [];

  function renderWith(props: Record<string, unknown>): HTMLDivElement {
    const div = document.createElement("div");
    document.body.appendChild(div);
    containers.push(div);
    act(() => {
      createRoot(div).render(createElement(SidecarFeed, { ...minProps, ...props }));
    });
    return div;
  }

  afterEach(() => {
    for (const c of containers) act(() => c.remove());
    containers.length = 0;
  });

  it("is absent when no section is truncated", () => {
    expect(
      renderWith({ truncatedSections: [] }).querySelector('[data-testid="trunc-note"]')
    ).toBeNull();
  });

  it("states the single-unbroken-section mechanism for a headingless doc", () => {
    const div = renderWith({
      truncatedSections: [{ sectionId: "b1", headingText: "" }],
      totalSections: 1,
    });
    const note = div.querySelector('[data-testid="trunc-note"]');
    expect(note).not.toBeNull();
    expect(note?.textContent).toMatch(/single unbroken section/i);
    expect(note?.textContent).toMatch(/~1,300 words/);
    // Register discipline: the note must state the limit, never prescribe a move.
    expect(note?.textContent).not.toMatch(/add (a )?heading/i);
  });

  it("names the unheaded intro of a SECTIONED doc — never a false single-unbroken claim", () => {
    const div = renderWith({
      truncatedSections: [{ sectionId: "b1", headingText: "" }],
      totalSections: 3,
    });
    const note = div.querySelector('[data-testid="trunc-note"]');
    expect(note?.textContent).toMatch(/opening section/i);
    expect(note?.textContent).not.toMatch(/single unbroken section/i);
  });

  it("names the section when the truncated section has a heading", () => {
    const div = renderWith({
      truncatedSections: [{ sectionId: "h1", headingText: "Background" }],
    });
    expect(div.querySelector('[data-testid="trunc-note"]')?.textContent).toContain("Background");
  });

  it("dismiss hides the note; it returns only when the truncated set changes", () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    containers.push(div);
    const root = createRoot(div);
    const renderSet = (truncatedSections: { sectionId: string; headingText: string }[]) =>
      act(() => {
        root.render(createElement(SidecarFeed, { ...minProps, truncatedSections }));
      });

    const setA = [{ sectionId: "b1", headingText: "" }];
    renderSet(setA);
    expect(div.querySelector('[data-testid="trunc-note"]')).not.toBeNull();

    act(() => {
      div
        .querySelector('[data-testid="trunc-note-dismiss"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(div.querySelector('[data-testid="trunc-note"]')).toBeNull();

    // Same set re-rendered → still hidden (no re-nag).
    renderSet([...setA]);
    expect(div.querySelector('[data-testid="trunc-note"]')).toBeNull();

    // A different section crosses the cap → new information, note returns.
    renderSet([{ sectionId: "h2", headingText: "Appendix" }]);
    expect(div.querySelector('[data-testid="trunc-note"]')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// BYOA (PR3) — source attribution on cards.
//
// External observations are first-class in lifecycle but visibly second-party in
// origin: the user must always be able to tell which critic is speaking, because
// an agent's output is not covered by the precision floors and fixture ratchets
// that guard our own. These tests pin that the chip is present when it should
// be, absent when it shouldn't, and that grouping never hides it.
// ---------------------------------------------------------------------------

describe("SidecarFeed — source attribution (BYOA)", () => {
  const containers: HTMLDivElement[] = [];

  const AGENT = { kind: "agent" as const, name: "Claude Code", sessionId: "sess-1" };

  function renderWith(observations: Observation[]): HTMLDivElement {
    const div = document.createElement("div");
    document.body.appendChild(div);
    containers.push(div);
    act(() => {
      createRoot(div).render(createElement(SidecarFeed, { ...minProps, observations }));
    });
    return div;
  }

  afterEach(() => {
    for (const c of containers) act(() => c.remove());
    containers.length = 0;
    __resetAgentSourceStatus();
  });

  it("names the agent on an external card and shows nothing on a built-in one", () => {
    const div = renderWith([
      obs({
        id: "ext-1",
        source: AGENT,
        blockId: "b1",
        startOffset: 0,
        endOffset: 10,
        text: "No evidence is given for the adoption figure.",
      }),
    ]);
    expect(div.querySelector('[data-testid="obs-source"]')?.textContent).toContain("Claude Code");
    expect(div.querySelector('[data-testid="obs-card"]')?.getAttribute("data-obs-source")).toBe(
      "agent"
    );

    const nativeDiv = renderWith([
      obs({ id: "n1", blockId: "b1", startOffset: 0, endOffset: 10, text: "Vague." }),
    ]);
    expect(nativeDiv.querySelector('[data-testid="obs-source"]')).toBeNull();
    expect(
      nativeDiv.querySelector('[data-testid="obs-card"]')?.getAttribute("data-obs-source")
    ).toBeNull();
  });

  it("reads live while that session is connected and flips to disconnected when the bridge drops", () => {
    act(() => {
      setAgentSourceStatus({ state: "connected", name: "Claude Code", sessionId: "sess-1" });
    });
    const div = renderWith([
      obs({ id: "ext-1", source: AGENT, blockId: "b1", startOffset: 0, endOffset: 10, text: "x" }),
    ]);
    expect(div.querySelector('[data-testid="obs-source"]')?.getAttribute("data-source-state")).toBe(
      "live"
    );

    // The card survives the disconnect — only its chip changes state.
    act(() => {
      setAgentSourceStatus({ state: "disconnected", name: "Claude Code", sessionId: "sess-1" });
    });
    expect(div.querySelector('[data-testid="obs-source"]')?.getAttribute("data-source-state")).toBe(
      "disconnected"
    );
    expect(div.querySelectorAll('[data-testid="obs-card"]')).toHaveLength(1);
  });

  it("a doc-scoped external card carries both the scope marker and the source chip", () => {
    const div = renderWith([
      obs({
        id: "ext-doc",
        source: AGENT,
        scope: "document",
        type: "missing_topic",
        priority: 1.5,
        blockId: undefined,
        text: "Nothing covers the support handoff.",
      }),
    ]);
    expect(div.querySelector('[data-testid="obs-scope"]')).not.toBeNull();
    expect(div.querySelector('[data-testid="obs-source"]')).not.toBeNull();
  });

  it("never groups an external card under a built-in primary — attribution can't hide in 'N more'", () => {
    // Same span, same type. Pre-BYOA these collapsed into one card whose
    // collapsed rows render bare tag+text, so the agent's observation would have
    // shown with no attribution at all until expanded.
    const span = { blockId: "b1", startOffset: 0, endOffset: 24 };
    const div = renderWith([
      obs({ id: "native", ...span, priority: 2.0, text: "The metric is undefined." }),
      obs({ id: "ext-1", source: AGENT, ...span, priority: 1.0, text: "No baseline is given." }),
    ]);

    expect(div.querySelectorAll('[data-testid="obs-card"]')).toHaveLength(2);
    expect(div.querySelectorAll('[data-testid="obs-source"]')).toHaveLength(1);
    expect(div.querySelector('[data-testid="obs-group-also"]')).toBeNull();
  });

  it("the archive names the source that retracted a card", () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    containers.push(div);
    act(() => {
      createRoot(div).render(
        createElement(SidecarFeed, {
          ...minProps,
          observations: [],
          archivedObservations: [
            obs({
              id: "ext-1",
              source: AGENT,
              status: "auto_closed",
              closureReason: "retracted",
              blockId: "b1",
              text: "Withdrawn.",
            }),
          ],
        })
      );
    });
    act(() => {
      div.querySelector<HTMLButtonElement>(".drawer-toggle")?.click();
    });
    expect(div.querySelector('[data-testid="archive-list"]')?.textContent).toContain(
      "retracted by Claude Code"
    );
  });
});
