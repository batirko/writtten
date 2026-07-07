/** @vitest-environment jsdom */

/**
 * C8 — pin-on-click. SpanPeek renders the dwelled/pinned span's card as a float.
 * When pinned it must (1) show a × close control wired to onClosePin, and
 * (2) ignore pointer-leave (onClose) so it stays put while the pointer travels
 * to it. When not pinned it behaves as the transient reverse-hover float.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { SpanPeek } from "./SpanPeek";
import type { GroupedObservation } from "./obsAggregation";
import type { Observation } from "../store/db";

const obs: Observation = {
  id: "o1",
  docId: "default",
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
  endOffset: 5,
  anchorText: "world",
};

const group: GroupedObservation = {
  id: "o1",
  primary: obs,
  others: [],
  priority: 0.75,
  hasContradiction: false,
  blockId: "b1",
  startOffset: 0,
  endOffset: 5,
};

const containers: HTMLDivElement[] = [];
function render(props: Record<string, unknown>): HTMLDivElement {
  const div = document.createElement("div");
  document.body.appendChild(div);
  containers.push(div);
  act(() => {
    createRoot(div).render(
      createElement(SpanPeek, {
        group,
        onDismiss: () => {},
        onKeepOpen: () => {},
        onClose: () => {},
        ...props,
      })
    );
  });
  return div;
}

afterEach(() => {
  for (const c of containers) act(() => c.remove());
  containers.length = 0;
});

describe("SpanPeek — pin-on-click (C8)", () => {
  it("shows no close control in the transient (unpinned) float", () => {
    const div = render({ pinned: false });
    expect(div.querySelector('[data-testid="span-peek-close"]')).toBeNull();
    expect(div.querySelector('[data-testid="span-peek"]')?.getAttribute("data-pinned")).toBeNull();
  });

  it("shows a × close control when pinned and calls onClosePin", () => {
    const onClosePin = vi.fn();
    const div = render({ pinned: true, onClosePin });
    const close = div.querySelector('[data-testid="span-peek-close"]') as HTMLButtonElement | null;
    expect(close).not.toBeNull();
    expect(div.querySelector('[data-testid="span-peek"]')?.getAttribute("data-pinned")).toBe("true");
    act(() => close!.click());
    expect(onClosePin).toHaveBeenCalledTimes(1);
  });

  it("carries the pinned class so it can ignore pointer-leave (styling + leave-guard)", () => {
    // The onMouseLeave→onClose release is gated on `!pinned` in the component;
    // the pinned marker class is the structural witness (the leave behaviour
    // itself is exercised end-to-end in the browser, where React's synthetic
    // enter/leave events fire — a raw dispatched `mouseleave` does not).
    const div = render({ pinned: true });
    const peek = div.querySelector('[data-testid="span-peek"]') as HTMLElement;
    expect(peek.classList.contains("span-peek-pinned")).toBe(true);

    const div2 = render({ pinned: false });
    const peek2 = div2.querySelectorAll('[data-testid="span-peek"]');
    // The just-rendered (last) peek is unpinned.
    expect(peek2[peek2.length - 1].classList.contains("span-peek-pinned")).toBe(false);
  });
});
