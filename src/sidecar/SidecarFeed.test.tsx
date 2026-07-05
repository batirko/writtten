/** @vitest-environment jsdom */

/**
 * L7 regression tests — prod prompt-leak.
 *
 * The debug panel shows full LLM prompts (user's document text). It must:
 *   1. Default to hidden (debugMode starts false).
 *   2. Only be accessible in DEV builds (import.meta.env.DEV gate).
 *
 * These tests guard the default-off invariant. The DEV-gate itself is a
 * build-time dead-code-elimination guarantee, not something we can toggle
 * in a test environment, but the default-off state is the primary guard.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { SidecarFeed } from "./SidecarFeed";
import { ControlCenter } from "./ControlCenter";
import type { Observation } from "../store/db";

const minProps = {
  observations: [] as never[],
  apiKey: "",
  onApiKeyChange: () => {},
  stage: "",
  onStageChange: () => {},
  hoveredObservationId: null,
  onHoverObservation: () => {},
  onDismissObservation: () => {},
  onClearWorkspace: () => {},
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

  it("debug panel is hidden on initial render (debugMode defaults to false)", () => {
    const div = render();
    // The debug panel renders with className="debug-panel" only when debugMode=true.
    // Regression: if this fails, someone set useState(true) again.
    expect(div.querySelector(".debug-panel")).toBeNull();
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
// eye-travel to the editor. Doc-scope cards have no anchorText → the quiet
// "Whole document" label instead. Span cards missing anchorText render neither.
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
    expect(anchor?.textContent).toBe("“non-invasive way”");
    // The full span stays reachable — the truncated quote carries a title tooltip.
    expect(anchor?.getAttribute("title")).toBe("non-invasive way");
    // Doc-scope label must not appear for a span card.
    expect(div.querySelector('[data-testid="obs-anchor-doc"]')).toBeNull();
  });

  it('shows "Whole document" for a doc-scope observation with no anchorText', () => {
    const div = renderWith([
      obs({
        id: "m1",
        type: "missing_topic",
        scope: "document",
        blockId: undefined,
        text: "No competitor positioning.",
      }),
    ]);
    const docLabel = div.querySelector('[data-testid="obs-anchor-doc"]');
    expect(docLabel).not.toBeNull();
    expect(docLabel?.textContent).toBe("Whole document");
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
// UX-006 — reverse-hover spotlight in the open feed.
//
// When a span is dwelled on, its card rises to the top (ephemeral lens) and
// stays opaque (`observation-card-spotlit`) while the rest recede
// (`observation-card-dimmed`). Releasing restores document order with no dim.
// ---------------------------------------------------------------------------

describe("SidecarFeed — reverse-hover spotlight (UX-006)", () => {
  const containers: HTMLDivElement[] = [];

  function renderWith(observations: Observation[], spanFocusObsId: string | null): HTMLDivElement {
    const div = document.createElement("div");
    document.body.appendChild(div);
    containers.push(div);
    act(() => {
      createRoot(div).render(
        createElement(SidecarFeed, { ...minProps, observations, spanFocusObsId })
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

  it("lifts the focused card to the top and dims the rest", () => {
    const div = renderWith(three, "c");
    // 'c' rises to the front despite being last in document order.
    expect(cardIds(div)).toEqual(["c", "a", "b"]);
    const spotlit = div.querySelector(".observation-card-spotlit");
    expect(spotlit?.getAttribute("data-obs-id")).toBe("c");
    // Exactly the two non-focused cards are dimmed; the spotlit one is not.
    const dimmed = Array.from(div.querySelectorAll(".observation-card-dimmed")).map((el) =>
      el.getAttribute("data-obs-id")
    );
    expect(dimmed.sort()).toEqual(["a", "b"]);
    expect(div.querySelector('.observation-card-spotlit.observation-card-dimmed')).toBeNull();
  });

  it("restores document order with no dim when nothing is focused", () => {
    const div = renderWith(three, null);
    expect(cardIds(div)).toEqual(["a", "b", "c"]);
    expect(div.querySelector(".observation-card-spotlit")).toBeNull();
    expect(div.querySelector(".observation-card-dimmed")).toBeNull();
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
