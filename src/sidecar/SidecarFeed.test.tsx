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
