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
      createRoot(div).render(createElement(SidecarFeed, minProps));
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
