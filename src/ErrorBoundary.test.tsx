/** @vitest-environment jsdom */

import { describe, it, expect, afterEach, vi } from "vitest";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { ErrorBoundary } from "./ErrorBoundary";

function Boom(): never {
  throw new Error("kaboom");
}

function Fine() {
  return createElement("p", { className: "ok" }, "all good");
}

describe("ErrorBoundary", () => {
  const containers: HTMLDivElement[] = [];

  function render(child: React.ReactNode): HTMLDivElement {
    const div = document.createElement("div");
    document.body.appendChild(div);
    containers.push(div);
    act(() => {
      createRoot(div).render(createElement(ErrorBoundary, null, child));
    });
    return div;
  }

  afterEach(() => {
    for (const c of containers) act(() => c.remove());
    containers.length = 0;
  });

  it("renders children unchanged when nothing throws", () => {
    const div = render(createElement(Fine));
    expect(div.querySelector(".ok")).not.toBeNull();
    expect(div.querySelector(".error-boundary")).toBeNull();
  });

  it("shows the calm recovery surface when a child render throws", () => {
    // React logs the caught error to console.error — silence it for a clean run.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const div = render(createElement(Boom));
    spy.mockRestore();

    const fallback = div.querySelector(".error-boundary");
    expect(fallback).not.toBeNull();
    expect(fallback?.getAttribute("role")).toBe("alert");
    expect(div.querySelector(".error-boundary-btn")?.textContent).toBe("Reload");
    // The error message is available for diagnosis.
    expect(div.querySelector(".error-boundary-details pre")?.textContent).toContain("kaboom");
  });
});
