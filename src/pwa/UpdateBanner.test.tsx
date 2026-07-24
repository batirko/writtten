/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { UpdateBanner } from "./UpdateBanner";

let container: HTMLDivElement;

function render(props: Parameters<typeof UpdateBanner>[0]) {
  act(() => {
    createRoot(container).render(createElement(UpdateBanner, props));
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

describe("UpdateBanner", () => {
  it("renders nothing until a new build is ready", () => {
    render({ show: false, onReload: () => {}, onDismiss: () => {} });
    expect(container.querySelector('[data-testid="update-banner"]')).toBeNull();
  });

  it("offers reload when a build is ready", () => {
    render({ show: true, onReload: () => {}, onDismiss: () => {} });
    expect(container.querySelector('[data-testid="update-banner"]')).not.toBeNull();
    expect(container.textContent).toContain("A new version of writtten is ready");
    // No fabricated target version — we can't know it before reloading.
    expect(container.textContent).not.toMatch(/v0\.\d/);
  });

  it("Reload applies the update, Later dismisses", () => {
    const onReload = vi.fn();
    const onDismiss = vi.fn();
    render({ show: true, onReload, onDismiss });

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="update-banner-reload"]')!.click();
    });
    expect(onReload).toHaveBeenCalledOnce();

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="update-banner-later"]')!.click();
    });
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
