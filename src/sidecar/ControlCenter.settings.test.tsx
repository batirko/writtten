/** @vitest-environment jsdom */

/**
 * The Settings modal's information architecture (rework 2026-07-25).
 *
 * The screen had accreted a block per feature and ranked none of them, so nothing
 * told a first-run visitor which control was the on-ramp and which was maintenance.
 * The fix was subtraction plus folding, not section headers — labelled sections were
 * built here in July 2026 and rejected as over-structured, and this file exists partly
 * so that decision is not quietly undone by a later "let's group these" pass.
 *
 * What is pinned here is the behaviour that is easy to regress and invisible until a
 * user hits it: a stored credential must never be hidden inside a closed fold, and a
 * model name must never be asserted on a screen where nothing can run it.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

import { ControlCenter } from "./ControlCenter";
import { openSettings } from "./settingsGate";
import { __resetEngine } from "../services/evalEngine";

// Without this React logs "the current testing environment is not configured to
// support act(...)" on every render below. The renders are already act-wrapped;
// React just needs telling that this is a test environment.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const containers: HTMLDivElement[] = [];

function openWith(props: Record<string, unknown>): HTMLDivElement {
  const div = document.createElement("div");
  document.body.appendChild(div);
  containers.push(div);
  act(() => {
    createRoot(div).render(
      createElement(ControlCenter, {
        apiKey: "",
        onApiKeyChange: () => {},
        onClearWorkspace: () => {},
        ...props,
      } as Parameters<typeof ControlCenter>[0])
    );
  });
  act(() => openSettings());
  return div;
}

afterEach(() => {
  for (const c of containers) act(() => c.remove());
  containers.length = 0;
  __resetEngine();
  vi.unstubAllGlobals();
});

describe("what a first-run visitor is shown", () => {
  /**
   * The muted "What will run" preview named two models on the one screen where
   * nothing can run them. It was the clearest case of a block that existed because
   * it could, not because the reader needed it there.
   */
  it("asserts no running models before a key exists", () => {
    const div = openWith({ apiKey: "" });
    expect(div.querySelector(".running-card")).toBeNull();
    expect(div.textContent).not.toMatch(/what will run/i);
  });

  it("shows what is running once a key exists, and says why", () => {
    const div = openWith({ apiKey: "AIzaSyTestKeyForRenderingOnly" });
    const card = div.querySelector(".running-card");
    expect(card).not.toBeNull();
    expect(card?.textContent).toMatch(/what.s running/i);
    expect(card?.textContent).toMatch(/and why/i);
  });

  /**
   * The get-a-key affordance is onboarding, not a selector, and it is the one thing
   * a keyless visitor can act on — so it never folds. Pinned because the fold pass
   * that removed the Ping button and the preview card ran right past it.
   */
  it("keeps the provider strip and the key-acquisition help on the resting layer", () => {
    const div = openWith({ apiKey: "" });
    expect(div.querySelector('[data-testid="provider-select"]')).not.toBeNull();
    expect(div.querySelector('[data-testid="api-key-input"]')).not.toBeNull();
    expect(div.textContent).toMatch(/get a key/i);
    expect(div.textContent).toMatch(/AIza/);
  });

  /**
   * The button restated what the field's own subtitle already says — a debounced
   * auto-verify runs on every key change and prints the decoded outcome per field.
   */
  it("no longer offers a separate Ping control", () => {
    const div = openWith({ apiKey: "AIzaSyTestKeyForRenderingOnly" });
    expect(div.querySelector('[data-testid="ping-model"]')).toBeNull();
    expect(div.querySelector('[data-testid="ping-verdict"]')).toBeNull();
    expect(div.textContent).not.toMatch(/ping model/i);
  });
});

describe("the paid-key fold", () => {
  it("is closed with its pitch on the summary when no paid key is stored", () => {
    const div = openWith({ apiKey: "AIzaSyTestKeyForRenderingOnly", geminiPaidKey: "" });
    const fold = div.querySelector<HTMLDetailsElement>('[data-testid="paid-key-fold"]');
    expect(fold).not.toBeNull();
    expect(fold?.open).toBe(false);
    // The offer stays readable while the field is away — folding the control must
    // not fold the reason to want it.
    expect(fold?.querySelector("summary")?.textContent).toMatch(/add a paid key/i);
    expect(fold?.querySelector("summary")?.textContent).toMatch(/stronger model/i);
  });

  /**
   * The one that matters. A stored credential hidden behind a closed fold is a
   * setting the owner cannot see they hold — and the summary would still be
   * inviting them to add the key they already added.
   */
  it("is open, and stops inviting, once a paid key is stored", () => {
    const div = openWith({
      apiKey: "AIzaSyTestKeyForRenderingOnly",
      geminiPaidKey: "AIzaSyPaidKeyForRenderingOnly",
    });
    const fold = div.querySelector<HTMLDetailsElement>('[data-testid="paid-key-fold"]');
    expect(fold?.open).toBe(true);
    expect(fold?.querySelector("summary")?.textContent).not.toMatch(/add a paid key/i);
    expect(fold?.querySelector("summary")?.textContent).toMatch(/stored/i);
    expect(div.querySelector('[data-testid="gemini-paid-key-input"]')).not.toBeNull();
  });

  /**
   * Every fold in this modal is a real <details>. A phone has no hover, and iOS does
   * not reliably focus a `<div tabindex>` on tap — the BYOK settings were unreachable
   * there once already, which is why this is asserted rather than assumed.
   */
  it("is a real details element, so it opens by tap without hover or focus", () => {
    const div = openWith({ apiKey: "AIzaSyTestKeyForRenderingOnly" });
    for (const sel of ['[data-testid="paid-key-fold"]', '[data-testid="settings-about"]']) {
      expect(div.querySelector(sel)?.tagName).toBe("DETAILS");
      expect(div.querySelector(`${sel} > summary`)).not.toBeNull();
    }
  });
});

describe("the About fold", () => {
  it("keeps the build stamp readable while closed, and holds the links inside", () => {
    const div = openWith({ apiKey: "" });
    const about = div.querySelector<HTMLDetailsElement>('[data-testid="settings-about"]');
    expect(about?.open).toBe(false);
    // A bug report needs the exact build, so the stamp stays on the summary rather
    // than costing a click.
    expect(div.querySelector('[data-testid="build-version"]')?.textContent).toMatch(/writtten v/i);
    // Still rendered (and so still findable by search / screen reader), just folded.
    expect(div.querySelector('[data-testid="oss-link"]')).not.toBeNull();
    expect(div.querySelector('[data-testid="legal-link"]')).not.toBeNull();
  });
});
