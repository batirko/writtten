/** @vitest-environment jsdom */

import { describe, it, expect, afterEach } from "vitest";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { WelcomeModal } from "./WelcomeModal";

// ---------------------------------------------------------------------------
// WelcomeModal — the first-run blocking modal. Value-first copy, closable, one
// accent CTA ("Add your key"), the keyless witnessing path ("See it in action").
// (onboarding_first_run.md § Revision 2026-07-07.)
// ---------------------------------------------------------------------------

const noop = () => {};

const baseProps = {
  onClose: noop,
  onAddKey: noop,
  onLoadExample: noop,
  canLoadExample: true,
};

describe("WelcomeModal", () => {
  const containers: HTMLDivElement[] = [];

  function renderWith(props: Partial<typeof baseProps> = {}): HTMLDivElement {
    const div = document.createElement("div");
    document.body.appendChild(div);
    containers.push(div);
    act(() => {
      createRoot(div).render(createElement(WelcomeModal, { ...baseProps, ...props }));
    });
    return div;
  }

  afterEach(() => {
    for (const c of containers) act(() => c.remove());
    containers.length = 0;
  });

  it("renders as a blocking dialog with value-first copy order (framing before the key ask)", () => {
    const div = renderWith();
    const card = div.querySelector('[data-testid="welcome-modal"]');
    expect(card).not.toBeNull();
    expect(card?.getAttribute("role")).toBe("dialog");
    expect(card?.getAttribute("aria-modal")).toBe("true");

    const title = div.querySelector(".welcome-modal-title");
    const keynote = div.querySelector(".welcome-modal-keynote");
    expect(title?.textContent).toMatch(/you write/i);
    expect(keynote?.textContent).toMatch(/api key/i);
    // Value framing must appear before the key ask in DOM order.
    expect(
      title!.compareDocumentPosition(keynote!) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("moves focus to the dialog container on open (not an actionable button)", () => {
    // Focusing the container owns focus for the trap/SR without rendering a
    // :focus-visible ring on a button (which read as "pre-selected" on load).
    const div = renderWith();
    const card = div.querySelector('[data-testid="welcome-modal"]');
    expect(document.activeElement).toBe(card);
    expect(document.activeElement).not.toBe(div.querySelector('[data-testid="welcome-add-key"]'));
  });

  it("'Add your key' is the accent primary and fires onAddKey", () => {
    let added = 0;
    const div = renderWith({ onAddKey: () => (added += 1) });
    const primary = div.querySelector('[data-testid="welcome-add-key"]');
    expect(primary?.className).toContain("welcome-modal-primary");
    act(() => {
      primary?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(added).toBe(1);
  });

  it("'See it in action' fires onLoadExample and is disabled off a blank doc", () => {
    let loaded = 0;
    const div = renderWith({ onLoadExample: () => (loaded += 1) });
    act(() => {
      div
        .querySelector('[data-testid="see-example"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(loaded).toBe(1);

    const guarded = renderWith({ canLoadExample: false });
    expect(
      (guarded.querySelector('[data-testid="see-example"]') as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it("closes on ×, 'Maybe later', and Escape", () => {
    let closed = 0;
    const div = renderWith({ onClose: () => (closed += 1) });
    act(() => {
      div
        .querySelector('[data-testid="welcome-dismiss"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    act(() => {
      div
        .querySelector('[data-testid="welcome-later"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(closed).toBe(3);
  });
});
