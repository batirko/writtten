/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { useAgentBridge } from "./useAgentBridge";
import type { LoopbackPermission } from "../services/agentLocalNetworkPermission";

// A resumed pairing must consult the local-network permission the same way a fresh
// connect does. The first build reattached blind, so a permission blocked *between*
// sessions resumed straight into a probe that could never answer — the bug this file
// pins. We drive the real hook through a probe component (no renderHook in this repo)
// and control only the permission reading, the stored pairing, and the bridge start.

const startAgentBridge = vi.fn((config: { pairing: { token: string } }) => {
  void config; // typed so `.mock.calls[0][0]` is inspectable; not otherwise needed here
  return { subscribe: () => () => {}, stop: () => {}, getStatus: () => ({}) as never };
});
const createPairing = vi.fn((origin: string) => ({
  token: "fresh-token",
  ports: [1],
  origin,
  createdAt: 0,
}));
const loadPairing = vi.fn();
const clearPairing = vi.fn();

vi.mock("../services/agentBridgeClient", () => ({
  startAgentBridge: (cfg: { pairing: { token: string } }) => startAgentBridge(cfg),
  createPairing: (origin: string) => createPairing(origin),
  loadPairing: () => loadPairing(),
  clearPairing: () => clearPairing(),
}));

const currentLoopbackPermission = vi.fn<() => Promise<LoopbackPermission>>();
vi.mock("../services/agentLocalNetworkPermission", async (importActual) => {
  const actual = await importActual<typeof import("../services/agentLocalNetworkPermission")>();
  return { ...actual, currentLoopbackPermission: () => currentLoopbackPermission() };
});

vi.mock("../services/agentPrompt", () => ({ buildAgentPrompt: () => Promise.resolve("prompt") }));
vi.mock("../services/agentSnapshot", () => ({ buildAgentSnapshot: () => Promise.resolve(null) }));
vi.mock("../services/featureFlags", () => ({ agentBridgeEnabled: () => true }));
vi.mock("../services/evalEngine", () => ({ releaseAgentEngine: () => {} }));
vi.mock("../services/agentBrowserSupport", () => ({
  currentAgentBrowserSupport: () => ({ supported: true }),
}));
vi.mock("../services/externalObservations", () => ({
  submitExternalObservation: () => ({ ok: false }),
  sanitizeSourceName: (s: string) => s,
}));
vi.mock("../model/docSnapshotSource", () => ({ readLiveDoc: () => null }));
vi.mock("../model/observationsSignal", () => ({
  notifyObservationsChanged: () => {},
  subscribeObservationsChanged: () => () => {},
}));
vi.mock("../model/agentSourceSignal", () => ({ setAgentSourceStatus: () => {} }));
vi.mock("../services/externalObservationLifecycle", () => ({
  archiveExternalSource: () => Promise.resolve(),
  countActiveFromSource: () => 0,
  retractExternalObservation: () => Promise.resolve(false),
}));
vi.mock("../store/db", () => ({
  saveObservation: () => Promise.resolve(),
  loadActiveObservationsForDocument: () => Promise.resolve([]),
  loadSuppressionsForDocument: () => Promise.resolve([]),
}));

function reading(state: string, confirmed = true): LoopbackPermission {
  return {
    state: state as LoopbackPermission["state"],
    name: confirmed ? "local-network-access" : "local-network",
    confirmed,
    status: { state, addEventListener() {}, removeEventListener() {} },
  };
}

let captured: ReturnType<typeof useAgentBridge>;
function Probe() {
  captured = useAgentBridge();
  return null;
}

let container: HTMLDivElement;
let root: Root;

async function mount() {
  await act(async () => {
    root.render(createElement(Probe));
    // Flush the resume effect's async permission read.
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  startAgentBridge.mockClear();
  createPairing.mockClear();
  loadPairing.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

describe("useAgentBridge — resuming a stored pairing consults the permission", () => {
  it("shows the blocked recovery instead of probing, when the permission is denied", async () => {
    loadPairing.mockReturnValue({ token: "stored", ports: [1], origin: "o", createdAt: 0 });
    currentLoopbackPermission.mockResolvedValue(reading("denied"));

    await mount();

    // The whole point: it does NOT reattach into a blind wait.
    expect(startAgentBridge).not.toHaveBeenCalled();
    expect(captured.preflight).toBe("blocked");
  });

  it("reattaches the existing pairing (not a fresh one) when granted", async () => {
    loadPairing.mockReturnValue({ token: "stored", ports: [1], origin: "o", createdAt: 0 });
    currentLoopbackPermission.mockResolvedValue(reading("granted"));

    await mount();

    expect(startAgentBridge).toHaveBeenCalledTimes(1);
    // Resumed the stored token, never minted a new pairing.
    expect(startAgentBridge.mock.calls[0][0]).toMatchObject({ pairing: { token: "stored" } });
    expect(createPairing).not.toHaveBeenCalled();
    expect(captured.preflight).toBe("none");
  });

  it("explains before reattaching when the state is prompt (would raise the dialog cold)", async () => {
    loadPairing.mockReturnValue({ token: "stored", ports: [1], origin: "o", createdAt: 0 });
    currentLoopbackPermission.mockResolvedValue(reading("prompt"));

    await mount();

    expect(startAgentBridge).not.toHaveBeenCalled();
    expect(captured.preflight).toBe("asking");
  });

  it("resumes straight through when the permission is unreadable (no false block)", async () => {
    loadPairing.mockReturnValue({ token: "stored", ports: [1], origin: "o", createdAt: 0 });
    currentLoopbackPermission.mockResolvedValue(reading("denied", false)); // unconfirmed → unknown

    await mount();

    expect(startAgentBridge).toHaveBeenCalledTimes(1);
    expect(captured.preflight).toBe("none");
    expect(captured.permissionUnreadable).toBe(true);
  });

  it("does nothing when there is no stored pairing", async () => {
    loadPairing.mockReturnValue(null);
    currentLoopbackPermission.mockResolvedValue(reading("denied"));

    await mount();

    expect(startAgentBridge).not.toHaveBeenCalled();
    expect(captured.preflight).toBe("none");
  });
});
