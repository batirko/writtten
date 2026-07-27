/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { applyUpdate } from "./applyUpdate";

/**
 * A stand-in for the waiting worker, with the one thing the code depends on:
 * `state` plus a `statechange` event when it activates. `activate()` is what the
 * real worker does in response to SKIP_WAITING.
 */
function fakeWaitingWorker() {
  const target = new EventTarget();
  const worker = {
    state: "installed" as ServiceWorker["state"],
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    activate() {
      worker.state = "activated";
      target.dispatchEvent(new Event("statechange"));
    },
    /** A worker superseded by a newer one changes state without ever activating. */
    becomeRedundant() {
      worker.state = "redundant";
      target.dispatchEvent(new Event("statechange"));
    },
  };
  return worker as unknown as ServiceWorker & {
    activate: () => void;
    becomeRedundant: () => void;
  };
}

function registrationWith(waiting: ServiceWorker | null) {
  return { waiting } as unknown as ServiceWorkerRegistration;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("applyUpdate", () => {
  it("reloads immediately when no worker is waiting", () => {
    // The state that shipped a dead button: a worker that found no controlled
    // client activates instead of waiting, so there is nothing left to message.
    const reload = vi.fn();
    const requestSkipWaiting = vi.fn();

    applyUpdate({ registration: registrationWith(null), requestSkipWaiting, reload });

    expect(reload).toHaveBeenCalledOnce();
  });

  it("reloads even when the app never registered a worker at all", () => {
    const reload = vi.fn();
    applyUpdate({ registration: undefined, requestSkipWaiting: vi.fn(), reload });
    expect(reload).toHaveBeenCalledOnce();
  });

  it("hands over first, then reloads once the waiting worker activates", () => {
    const reload = vi.fn();
    const waiting = fakeWaitingWorker();
    const requestSkipWaiting = vi.fn();

    applyUpdate({ registration: registrationWith(waiting), requestSkipWaiting, reload });

    // Reloading before the hand-over would re-serve the old precache.
    expect(requestSkipWaiting).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();

    waiting.activate();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("reloads anyway when the hand-over never completes", () => {
    // An uncontrolled tab gets no controllerchange, and a worker that goes
    // redundant never activates. Neither may leave the button doing nothing.
    const reload = vi.fn();

    applyUpdate({
      registration: registrationWith(fakeWaitingWorker()),
      requestSkipWaiting: vi.fn(),
      reload,
    });

    expect(reload).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3_000);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("reloads exactly once when the hand-over and the timeout both land", () => {
    const reload = vi.fn();
    const waiting = fakeWaitingWorker();

    applyUpdate({ registration: registrationWith(waiting), requestSkipWaiting: vi.fn(), reload });

    waiting.activate();
    vi.advanceTimersByTime(10_000);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("ignores state changes that are not activation", () => {
    const reload = vi.fn();
    const waiting = fakeWaitingWorker();

    applyUpdate({ registration: registrationWith(waiting), requestSkipWaiting: vi.fn(), reload });

    waiting.becomeRedundant();
    expect(reload).not.toHaveBeenCalled();

    // ...and the timeout is what saves the button in that case.
    vi.advanceTimersByTime(3_000);
    expect(reload).toHaveBeenCalledOnce();
  });
});
