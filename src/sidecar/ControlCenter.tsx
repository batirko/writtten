import { useState, useRef, useEffect } from "react";
import { llmLogger, type LLMLogEntry, type SessionStats } from "../model/logger";
import type { ModelTier } from "../model/capability";
import type { ProviderId } from "../model/provider";
import {
  catalogFor,
  defaultModels,
  geminiRunningModels,
  pingModelFor,
  PROVIDER_IDS,
} from "../model/registry";
import { pingProvider, detectGeminiTier, type PingResult, type GeminiTier } from "../model/ping";
import { buildEnvelope } from "../model/debugLog";
import { getLlmMode } from "../model/mock";
import { subscribeStall } from "../model/stallSignal";

// Per-provider settings copy: how to get a key, the key shape, and the one-line
// plain-English job of each tier for the "what's running" card. See
// docs/projects/multi_provider_router.md §D.
type ProviderMeta = {
  label: string;
  keyLabel: string;
  placeholder: string;
  keyUrl: string;
  keyUrlText: string;
  shape: string;
  tierNote: string;
  paid: boolean;
  fastJob: string;
  strongJob: string;
  /** Shown when both tiers resolve to the same model (e.g. Gemini free), so the
   *  legibility card reads as one honest row instead of a duplicated name. */
  sameModelJob: string;
  cost: string;
  trust: string;
};

const PROVIDER_META: Record<ProviderId, ProviderMeta> = {
  gemini: {
    label: "Gemini",
    keyLabel: "Gemini API key",
    placeholder: "Paste your Gemini API key…",
    keyUrl: "https://aistudio.google.com/app/apikey",
    keyUrlText: "aistudio.google.com",
    shape: "AIza…",
    tierNote: "Free tier available — no card needed",
    paid: false,
    fastJob: "Watches for contradictions and unclear passages as you write.",
    strongJob: "The deeper adjudication when checks conflict.",
    sameModelJob:
      "Your free-tier workhorse — it watches as you write and handles the deeper checks too. A paid key unlocks a stronger adjudicator.",
    cost: "",
    trust: "",
  },
  openai: {
    label: "OpenAI",
    keyLabel: "OpenAI API key",
    placeholder: "Paste your OpenAI API key…",
    keyUrl: "https://platform.openai.com/api-keys",
    keyUrlText: "platform.openai.com/api-keys",
    shape: "sk-…",
    tierNote: "Paid API account required",
    paid: true,
    fastJob: "Watches for contradictions and unclear passages as you write.",
    strongJob: "Steps in for the deeper adjudication when checks conflict.",
    sameModelJob: "Handles every check.",
    cost: "Roughly 20–40 calls per PRD session, mostly on the cheap model.",
    trust: "",
  },
  anthropic: {
    label: "Anthropic",
    keyLabel: "Anthropic API key",
    placeholder: "Paste your Anthropic API key…",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyUrlText: "console.anthropic.com",
    shape: "sk-ant-…",
    tierNote: "Paid API account required",
    paid: true,
    fastJob: "Watches for contradictions and unclear passages as you write.",
    strongJob: "Steps in for the deeper adjudication when checks conflict.",
    sameModelJob: "Handles every check.",
    cost: "Roughly 20–40 calls per PRD session, mostly on the cheap model.",
    trust:
      "Your key goes straight from this browser to Anthropic, and is stored only on this device.",
  },
};

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function DismissIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  );
}

const ICON_PROPS = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// Export = download (arrow DOWN into the tray → save a file out to disk).
function DownloadIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
  );
}
// Import = upload (arrow UP out of the tray → bring a file in from disk).
function UploadIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="17 8 12 3 7 8"></polyline>
      <line x1="12" y1="3" x2="12" y2="15"></line>
    </svg>
  );
}
function GearIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="3"></circle>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg {...ICON_PROPS}>
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
      <path d="M10 11v6"></path>
      <path d="M14 11v6"></path>
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// ControlCenter — always-visible (feed folded or not), fixed bottom-right.
// At rest = just the activity/model dot; hover/focus reveals process detail
// (up) + actions (left). Owns the settings + clear-confirm modals and the dev
// debug panel. (feed_surface.md § 2 / § 3 / § 5)
// ---------------------------------------------------------------------------

interface ControlCenterProps {
  pending?: number;
  activeProvider?: string;
  sessionStats?: SessionStats;
  documentIsEmpty?: boolean;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  keyTier?: ModelTier;
  onKeyTierChange?: (tier: ModelTier) => void;
  providerId?: ProviderId;
  onProviderChange?: (id: ProviderId) => void;
  models?: Record<string, { fast: string; strong: string }>;
  onModelsChange?: (m: Record<string, { fast: string; strong: string }>) => void;
  onImportFile?: (file: File) => void;
  onClearWorkspace: () => void;
  onExportMarkdown?: () => void;
  onExportPdf?: () => void;
  onCopyMarkdown?: () => void;
  onCopyRichText?: () => void;
  logs?: LLMLogEntry[];
}

export function ControlCenter({
  pending = 0,
  activeProvider = "",
  sessionStats,
  documentIsEmpty = false,
  apiKey,
  onApiKeyChange,
  keyTier = "weak",
  onKeyTierChange,
  providerId = "gemini",
  onProviderChange,
  models = {},
  onModelsChange,
  onImportFile,
  onClearWorkspace,
  onExportMarkdown,
  onExportPdf,
  onCopyMarkdown,
  onCopyRichText,
  logs = [],
}: ControlCenterProps) {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [debugExpanded, setDebugExpanded] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [stalled, setStalled] = useState(false);
  useEffect(() => subscribeStall(setStalled), []);

  // Touch open: the actions reveal on hover / focus-within on desktop, but a
  // phone has neither — tapping the anchor pins the control-center open so its
  // actions (Settings, export, clear) are reachable. Tapping outside closes it.
  const [tapOpen, setTapOpen] = useState(false);
  const controlCenterRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!tapOpen) return;
    const onOutside = (e: PointerEvent) => {
      if (!controlCenterRef.current?.contains(e.target as Node)) setTapOpen(false);
    };
    document.addEventListener("pointerdown", onOutside);
    return () => document.removeEventListener("pointerdown", onOutside);
  }, [tapOpen]);

  // "Ping model" verdict. Reset whenever the provider or key changes so a stale
  // verdict never lingers over a different key.
  const [ping, setPing] = useState<PingResult | null>(null);
  const [pinging, setPinging] = useState(false);
  useEffect(() => setPing(null), [providerId, apiKey]);

  // Auto-detected Gemini tier (replaces the manual "paid tier" checkbox). We
  // probe `gemini-2.5-pro` once — debounced — whenever a Gemini key is present,
  // and set the capability tier from the result. See ping.ts → detectGeminiTier.
  const [geminiTier, setGeminiTier] = useState<GeminiTier | "detecting" | "idle">("idle");
  useEffect(() => {
    if (providerId !== "gemini" || !apiKey.trim()) {
      setGeminiTier("idle");
      return;
    }
    let cancelled = false;
    setGeminiTier("detecting");
    const t = setTimeout(async () => {
      const tier = await detectGeminiTier(apiKey);
      if (cancelled) return;
      setGeminiTier(tier);
      // Only set capability on a decisive read — never over/under-claim on a
      // network failure or a bad key.
      if (tier === "paid") onKeyTierChange?.("strong");
      else if (tier === "free") onKeyTierChange?.("weak");
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId, apiKey]);

  const meta = PROVIDER_META[providerId];
  const catalog = catalogFor(providerId);
  // Is the active Gemini key on the paid tier? Prefer the live detection; before
  // it resolves (or on a network failure) fall back to the persisted keyTier.
  const geminiPaid =
    geminiTier === "paid"
      ? true
      : geminiTier === "free" || geminiTier === "invalid"
        ? false
        : keyTier === "strong";
  // The "what's running" card must reflect what actually runs. For Gemini that's
  // tier-dependent (free = one model; paid = flash-lite + gemini-2.5-pro), so
  // derive it from the router's real pools rather than the free-only catalog.
  const selectedModels =
    providerId === "gemini"
      ? geminiRunningModels(geminiPaid)
      : (models[providerId] ?? defaultModels(providerId));
  // Collapse the legibility card to one row when both tiers run the same model
  // (Gemini free), so it never shows a duplicated name.
  const runningRows =
    selectedModels.fast === selectedModels.strong
      ? [{ model: selectedModels.fast, job: meta.sameModelJob }]
      : [
          { model: selectedModels.fast, job: meta.fastJob },
          { model: selectedModels.strong, job: meta.strongJob },
        ];
  const setModel = (tier: "fast" | "strong", value: string) => {
    onModelsChange?.({ ...models, [providerId]: { ...selectedModels, [tier]: value } });
  };
  const runPing = async () => {
    setPinging(true);
    setPing(null);
    if (providerId === "gemini") {
      // Gemini's ping doubles as the tier probe (pro-model), so the verdict is
      // tier-aware and the capability tier is (re)set from the same call.
      setGeminiTier("detecting");
      const tier = await detectGeminiTier(apiKey);
      setGeminiTier(tier);
      if (tier === "paid") {
        onKeyTierChange?.("strong");
        setPing({ status: "ok", label: "Key works — paid tier." });
      } else if (tier === "free") {
        onKeyTierChange?.("weak");
        setPing({ status: "ok", label: "Key works — free tier." });
      } else if (tier === "invalid") {
        setPing({ status: "invalid", label: "Invalid key." });
      } else {
        setPing({
          status: "network",
          label: "Couldn't reach the provider — check your network or CORS.",
        });
      }
    } else {
      const result = await pingProvider(providerId, apiKey, pingModelFor(providerId));
      setPing(result);
    }
    setPinging(false);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleImportClick = () => fileInputRef.current?.click();
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onImportFile) onImportFile(file);
    e.target.value = "";
  };

  const handleCopyLogs = async () => {
    try {
      const envelope = buildEnvelope(llmLogger.getLogs(), llmLogger.getProducedByCall(), {
        llmMode: getLlmMode(),
        activeProvider: llmLogger.getActiveProvider(),
      });
      await navigator.clipboard.writeText(JSON.stringify(envelope, null, 2));
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error("Failed to copy logs:", err);
    }
  };

  const isPaid = activeProvider.includes("[paid]");
  const modelName = activeProvider.replace(" [paid]", "") || "…";
  const anchorState = stalled ? "stalled" : pending > 0 ? "working" : "idle";
  const statusText = stalled ? "still working…" : pending > 0 ? `evaluating · ${pending}` : "idle";

  // Keep the cluster revealed while any menu/modal is open (so it doesn't
  // collapse out from under the pointer).
  const forceOpen = showExportMenu;

  return (
    <>
      {showClearConfirm && (
        <div
          className="modal-scrim"
          data-testid="clear-modal"
          onClick={() => setShowClearConfirm(false)}
        >
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <p style={{ margin: "0 0 var(--space-md)" }}>
              Clear the workspace? This erases all text, observations, and history.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                className="modal-ghost-btn"
                data-testid="clear-cancel"
                onClick={() => setShowClearConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="modal-danger-btn"
                data-testid="clear-confirm"
                onClick={() => {
                  setShowClearConfirm(false);
                  onClearWorkspace();
                }}
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="modal-scrim" onClick={() => setShowSettings(false)}>
          <div
            className="modal-card"
            data-testid="settings-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-title-row">
              <span className="modal-title">Settings</span>
              <button
                className="dismiss-btn"
                aria-label="Close settings"
                onClick={() => setShowSettings(false)}
              >
                <DismissIcon />
              </button>
            </div>
            <div className="setting-group">
              <label>Provider</label>
              <div
                className="provider-seg"
                data-testid="provider-select"
                role="group"
                aria-label="Provider"
              >
                {PROVIDER_IDS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={id === providerId ? "is-active" : undefined}
                    aria-pressed={id === providerId}
                    onClick={() => onProviderChange?.(id)}
                  >
                    {PROVIDER_META[id].label}
                  </button>
                ))}
              </div>
              <span className="setting-help">{meta.tierNote}</span>
            </div>

            <div className="setting-group" style={{ marginTop: "var(--space-sm)" }}>
              <label htmlFor="api-key-input">{meta.keyLabel}</label>
              <input
                id="api-key-input"
                data-testid="api-key-input"
                type="password"
                placeholder={meta.placeholder}
                value={apiKey}
                onChange={(e) => onApiKeyChange(e.target.value)}
              />
              <span className="setting-help">
                {apiKey ? "✓ Key set. " : "No key set. "}
                Get a key{" "}
                <a className="setting-link" href={meta.keyUrl} target="_blank" rel="noreferrer">
                  {meta.keyUrlText} ↗
                </a>{" "}
                · starts with <code className="key-shape">{meta.shape}</code>
              </span>

              <div className="ping-row">
                <button
                  type="button"
                  className="ping-btn"
                  data-testid="ping-model"
                  disabled={pinging || !apiKey}
                  onClick={runPing}
                >
                  {pinging ? "Pinging…" : "Ping model"}
                </button>
                {ping && (
                  <span
                    className={`ping-verdict ping-${ping.status}`}
                    data-testid="ping-verdict"
                    role="status"
                  >
                    {ping.label}
                  </span>
                )}
              </div>
              <span className="setting-help">
                Decodes failures too: invalid key · needs billing · network / CORS
              </span>

              {providerId === "gemini" && apiKey && geminiTier !== "idle" && (
                <div className={`gemini-tier gemini-tier-${geminiTier}`} data-testid="gemini-tier">
                  {geminiTier === "detecting" && <span>Detecting your tier…</span>}
                  {geminiTier === "paid" && (
                    <span>
                      <strong>Paid key detected.</strong> The stronger adjudicator (
                      <code className="key-shape">gemini-2.5-pro</code>) is enabled for the deeper
                      checks.
                    </span>
                  )}
                  {geminiTier === "free" && (
                    <span>
                      <strong>Free key detected.</strong> Runs the flash-lite pool. Enable billing
                      on your Google Cloud project for the stronger adjudicator.
                    </span>
                  )}
                  {geminiTier === "invalid" && (
                    <span>Key not recognized — double-check the paste.</span>
                  )}
                  {geminiTier === "unknown" && (
                    <span>Couldn&apos;t detect your tier — Ping to retry.</span>
                  )}
                </div>
              )}
            </div>

            <div className="running-card">
              <div className="running-head">
                <span>What&apos;s running</span>
                <span className="running-why">and why</span>
              </div>
              {runningRows.map((row) => (
                <div className="running-row" key={row.model}>
                  <code className="running-model">{row.model}</code>
                  <span>{row.job}</span>
                </div>
              ))}
            </div>

            {meta.paid ? (
              <div className="setting-group" style={{ marginTop: "var(--space-md)" }}>
                <label htmlFor="model-select-fast">
                  Fast model <span className="model-tier-note">· frequent</span>
                </label>
                <select
                  id="model-select-fast"
                  className="model-select"
                  data-testid="model-select-fast"
                  value={selectedModels.fast}
                  onChange={(e) => setModel("fast", e.target.value)}
                >
                  {catalog.fast.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <label htmlFor="model-select-strong" style={{ marginTop: "var(--space-sm)" }}>
                  Strong model <span className="model-tier-note">· rare adjudicator</span>
                </label>
                <select
                  id="model-select-strong"
                  className="model-select"
                  data-testid="model-select-strong"
                  value={selectedModels.strong}
                  onChange={(e) => setModel("strong", e.target.value)}
                >
                  {catalog.strong.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="setting-group" style={{ marginTop: "var(--space-md)" }}>
                <label>Models</label>
                <div className="model-note">
                  Free tier rotates a fixed pool to spread your daily quota. Picking a single model
                  comes later.
                </div>
              </div>
            )}

            {meta.paid && meta.cost && <div className="pay-note">{meta.cost}</div>}
            {meta.trust && (
              <div className="trust-note" data-testid="trust-note">
                {meta.trust}
              </div>
            )}
            {import.meta.env.DEV && (
              <div className="setting-group" style={{ marginTop: "var(--space-sm)" }}>
                <label
                  style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={debugMode}
                    onChange={(e) => setDebugMode(e.target.checked)}
                  />
                  Enable LLM debug mode
                </label>
              </div>
            )}
          </div>
        </div>
      )}

      <div
        ref={controlCenterRef}
        className={`control-center${forceOpen || tapOpen ? " is-open" : ""}`}
      >
        {/* Reserved seam: the future R2c noisiness switch (Key issues / Balanced /
            Everything) drops in here — the process/up axis is an extensible stack,
            not a fixed list. No filter UI is shipped now (feed_surface.md § Reserved
            seams · smart_feed_curation.md). */}
        <div className="control-process">
          <div className="control-process-label">process</div>
          <div className="control-process-row">
            <span data-testid="provider-chip">{modelName}</span>
            {isPaid && <span className="paid">paid</span>}
          </div>
          <div className="control-process-row">
            <span>status</span>
            <span
              data-testid="sidecar-status"
              role="status"
              aria-live="polite"
              data-pending={pending}
              data-stalled={stalled}
              className={anchorState !== "idle" ? "working" : undefined}
            >
              {statusText}
            </span>
          </div>
          {sessionStats && sessionStats.totalCalls > 0 && (
            <div className="control-process-row">
              <span>this session</span>
              <span>
                {sessionStats.fastCalls}f · {sessionStats.strongCalls}s
              </span>
            </div>
          )}

          {import.meta.env.DEV && debugMode && (
            <div className="control-debug">
              <button
                className="control-debug-toggle"
                aria-expanded={debugExpanded}
                onClick={() => setDebugExpanded((v) => !v)}
              >
                <span>
                  debug logs
                  {logs.length > 0 && <span className="control-debug-count">{logs.length}</span>}
                </span>
                <span aria-hidden="true">{debugExpanded ? "▾" : "▸"}</span>
              </button>
              {debugExpanded && (
                <div className="debug-panel">
                  <div className="debug-panel-head">
                    {copySuccess && (
                      <span style={{ color: "#4caf50", fontSize: "0.7rem" }}>Copied!</span>
                    )}
                    <button
                      onClick={handleCopyLogs}
                      style={{ fontSize: "0.7rem", padding: "2px 8px" }}
                    >
                      Copy All
                    </button>
                  </div>
                  {sessionStats && sessionStats.totalCalls > 0 && (
                    <div data-testid="session-stats" className="debug-session-stats">
                      Session: {sessionStats.fastCalls}f + {sessionStats.strongCalls}s calls
                      {sessionStats.avgLatencyMs > 0 && ` · avg ${sessionStats.avgLatencyMs}ms`}
                    </div>
                  )}
                  {logs.length === 0 ? (
                    <div style={{ color: "#888" }}>No logs yet.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      {logs.map((log) => {
                        if (log.type === "trigger") {
                          return (
                            <div
                              key={log.id}
                              data-testid="debug-entry"
                              data-log-type="trigger"
                              className="debug-entry debug-entry-trigger"
                            >
                              <span>
                                ▶ trigger={log.triggerKind} block={log.blockId?.slice(0, 8)}
                              </span>
                              <span style={{ opacity: 0.7 }}>
                                {log.timestamp.toLocaleTimeString()}
                              </span>
                            </div>
                          );
                        }
                        if (log.type === "archive" && log.archive) {
                          const a = log.archive;
                          return (
                            <div
                              key={log.id}
                              data-testid="debug-entry"
                              data-log-type="archive"
                              data-archive-actor={a.actor}
                              data-archive-reason={a.reason}
                              className="debug-entry debug-entry-archive"
                              title={a.text}
                            >
                              <span className="debug-entry-ellipsis">
                                ✕ {a.actor} {a.reason} · {a.obsType}
                              </span>
                              <span style={{ opacity: 0.7, flexShrink: 0 }}>
                                {log.timestamp.toLocaleTimeString()}
                              </span>
                            </div>
                          );
                        }
                        const isExpanded = expandedLogId === log.id;
                        return (
                          <div
                            key={log.id}
                            data-testid="debug-entry"
                            data-log-type={log.type}
                            className={`debug-entry debug-entry-${log.type}`}
                          >
                            <div
                              className="debug-entry-head"
                              onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                            >
                              <span>
                                [{log.type.toUpperCase()}] {log.model}
                              </span>
                              <span>{log.timestamp.toLocaleTimeString()}</span>
                            </div>
                            {log.errorMessage && (
                              <div style={{ color: "red", marginTop: "4px" }}>
                                {log.errorMessage}
                              </div>
                            )}
                            {isExpanded && (
                              <div className="debug-entry-detail">
                                <div>
                                  <strong>Latency:</strong> {log.latencyMs}ms
                                </div>
                                <div>
                                  <strong>Payload:</strong>{" "}
                                  <pre>{JSON.stringify(log.payload, null, 2)}</pre>
                                </div>
                                {log.response && (
                                  <div>
                                    <strong>Response:</strong> <pre>{log.response}</pre>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="control-actions-row">
          <div className="control-actions-extra">
            <input
              type="file"
              accept=".md,.txt"
              style={{ display: "none" }}
              ref={fileInputRef}
              onChange={handleFileChange}
              data-testid="import-input"
            />
            <div className="control-export-wrap">
              <button
                className="control-btn"
                data-testid="export-menu-btn"
                onClick={() => setShowExportMenu(!showExportMenu)}
                disabled={documentIsEmpty}
                title="Export or copy document"
                aria-label="Export or copy document"
              >
                <DownloadIcon />
              </button>
              {showExportMenu && (
                <div className="export-menu">
                  <button
                    data-testid="export-md"
                    onClick={() => {
                      onExportMarkdown?.();
                      setShowExportMenu(false);
                    }}
                  >
                    Download Markdown
                  </button>
                  <button
                    data-testid="export-pdf"
                    onClick={() => {
                      onExportPdf?.();
                      setShowExportMenu(false);
                    }}
                  >
                    Print / Save as PDF
                  </button>
                  <button
                    data-testid="copy-md"
                    onClick={() => {
                      onCopyMarkdown?.();
                      setShowExportMenu(false);
                    }}
                  >
                    Copy Markdown
                  </button>
                  <button
                    data-testid="copy-rtf"
                    onClick={() => {
                      onCopyRichText?.();
                      setShowExportMenu(false);
                    }}
                  >
                    Copy Rich Text
                  </button>
                </div>
              )}
            </div>
            <button
              className="control-btn"
              data-testid="import-button"
              onClick={handleImportClick}
              title="Import document (.md, .txt)"
              aria-label="Import document"
            >
              <UploadIcon />
            </button>
            <button
              className="control-btn"
              onClick={() => setShowSettings(true)}
              title="Settings"
              aria-label="Settings"
            >
              <GearIcon />
            </button>
            <button
              className="control-btn"
              data-testid="clear-workspace"
              onClick={() => setShowClearConfirm(true)}
              title="Clear workspace"
              aria-label="Clear workspace"
            >
              <TrashIcon />
            </button>
          </div>
          <div
            className="control-anchor"
            data-testid="control-anchor"
            data-state={anchorState}
            data-paid={isPaid ? "true" : undefined}
            tabIndex={0}
            role="button"
            aria-expanded={forceOpen || tapOpen}
            aria-label={`Model ${modelName}${isPaid ? " (paid)" : ""} — ${statusText}. Tap to open controls.`}
            onClick={() => setTapOpen((o) => !o)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setTapOpen((o) => !o);
              }
            }}
          >
            <span className="control-dot" />
          </div>
        </div>
      </div>
    </>
  );
}
