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
import { fetchModelCatalog, cachedCatalog } from "../model/modelList";
import type { ModelCatalog } from "../model/provider";
import {
  pingProvider,
  detectGeminiTier,
  type PingResult,
  type PingStatus,
  type GeminiTier,
} from "../model/ping";
import { buildEnvelope } from "../model/debugLog";
import { getLlmMode } from "../model/mock";
import { subscribeStall } from "../model/stallSignal";
import { subscribeOpenSettings } from "./settingsGate";

// Whether the LLM debug drawer renders. Historically DEV-only (dead-code-
// eliminated from production via import.meta.env.DEV); as of 2026-07-09 it ships
// in production too, by owner decision. Kept as a single named flag so it's one
// obvious toggle point — flip to `import.meta.env.DEV` to restore dev-only, or
// wire to a setting later. The underlying call log already records in prod; only
// its sessionStorage persistence stays dev-only (see logger.ts `canPersist`).
const DEBUG_PANEL_ENABLED = true;

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
      "Your free-tier workhorse — watches as you write and handles the deeper checks, rotated to spread your daily quota.",
    cost: "",
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
  },
};

// The expected leading characters of each provider's key. Used for a cheap,
// synchronous "does this even look like the right provider's key?" check before
// we spend a network round-trip verifying it. Not a validity guarantee — a
// well-shaped key can still be revoked/wrong; that's what the live verify is for.
const KEY_PREFIX: Record<ProviderId, string> = {
  gemini: "AIza",
  openai: "sk-",
  anthropic: "sk-ant-",
};

/** True when the key is empty (don't nag before typing) or starts with the
 *  provider's expected prefix. Catches an obviously wrong-provider paste (a
 *  Gemini `AIza…` key in the OpenAI field) without a doomed network call.
 *  Exported for unit testing. */
export function keyShapeOk(providerId: ProviderId, key: string): boolean {
  const k = key.trim();
  if (!k) return true;
  return k.startsWith(KEY_PREFIX[providerId]);
}

// The verification state a key field can be in: not-yet-checked ("idle"),
// in-flight ("checking"), or a settled ping outcome.
export type KeyCheckStatus = "idle" | "checking" | PingStatus;

// Fold Gemini's tier-detection signal into the same vocabulary the OpenAI/
// Anthropic live check produces, so one subtitle helper serves every provider.
export function geminiTierToCheck(tier: GeminiTier | "detecting" | "idle"): KeyCheckStatus {
  switch (tier) {
    case "idle":
      return "idle";
    case "detecting":
      return "checking";
    case "paid":
    case "free":
      return "ok"; // reachable & authenticated → verified
    case "invalid":
      return "invalid";
    case "unknown":
      return "network"; // couldn't reach the provider — can't claim verified
  }
}

// One honest read for a single key field's subtitle: maps "is there a key",
// "does it look right", and "what did verification say" into a label + a
// `.status-*` class. Exported for unit testing the mapping matrix.
export type KeyStatusView = { cls: "ok" | "bad" | "warn" | "checking" | "muted"; text: string };
export function keyStatusView(args: {
  hasKey: boolean;
  shapeOk: boolean;
  check: KeyCheckStatus;
  shape: string;
}): KeyStatusView {
  const { hasKey, shapeOk, check, shape } = args;
  if (!hasKey) return { cls: "muted", text: "No key set" };
  // A wrong-shaped key is a local certainty — surface it before any verify state.
  if (!shapeOk) return { cls: "bad", text: `✗ Doesn't look like a ${shape} key` };
  switch (check) {
    case "checking":
      return { cls: "checking", text: "Key stored · checking…" };
    case "ok":
      return { cls: "ok", text: "✓ Key verified" };
    case "invalid":
      return { cls: "bad", text: "✗ Key rejected" };
    case "billing":
      return { cls: "warn", text: "✓ Key valid · billing not enabled" };
    case "rate_limited":
      return { cls: "warn", text: "✓ Key valid · rate-limited" };
    // network / error / not-yet-checked: the key is stored but we can't assert
    // it works. Say exactly that rather than a green "set" that over-claims.
    default:
      return { cls: "warn", text: "✓ Key stored · not verified" };
  }
}

// The combined honest read of a two-field Gemini setup. Returned as a
// {cls, node} pair so the panel can style it with the existing `.gemini-tier-*`
// classes. Exported for unit testing of the copy-selection matrix.
type GeminiKeyState = { cls: "paid" | "free" | "invalid" | "detecting"; node: React.ReactNode };
export function geminiKeyStatus(args: {
  hasFree: boolean;
  hasPaid: boolean;
  geminiTier: GeminiTier | "detecting" | "idle";
  geminiPaidTier: GeminiTier | "detecting" | "idle";
  keyTier: ModelTier;
}): GeminiKeyState {
  const { hasFree, hasPaid, geminiTier, geminiPaidTier, keyTier } = args;
  // Paid-field problems first — the strong adjudicator depends on that key.
  if (hasPaid && geminiPaidTier === "invalid") {
    return { cls: "invalid", node: <span>Paid key not recognized — double-check the paste.</span> };
  }
  if (hasPaid && geminiPaidTier === "free") {
    return {
      cls: "invalid",
      node: (
        <span>
          That paid key looks like a <strong>free-tier</strong> key — the stronger adjudicator (
          <code className="key-shape">gemini-2.5-pro</code>) needs a billed key.
        </span>
      ),
    };
  }
  if (hasFree && hasPaid) {
    return {
      cls: "paid",
      node: (
        <span>
          <strong>Free + paid.</strong> Cheap checks stay on the free daily budget; the deeper
          adjudication and any overflow ride the paid key.
        </span>
      ),
    };
  }
  if (hasPaid) {
    return {
      cls: "paid",
      node: (
        <span>
          <strong>Paid key only.</strong> One key does everything — every check bills to it,
          including the frequent cheap ones. Add a free key to offload those.
        </span>
      ),
    };
  }
  // Free field only — lean on its live detection.
  if (geminiTier === "detecting")
    return { cls: "detecting", node: <span>Detecting your tier…</span> };
  if (
    geminiTier === "paid" ||
    (geminiTier !== "free" && geminiTier !== "invalid" && keyTier === "strong")
  ) {
    return {
      cls: "paid",
      node: (
        <span>
          <strong>Paid key.</strong> The stronger adjudicator (
          <code className="key-shape">gemini-2.5-pro</code>) is enabled for the deeper checks.
        </span>
      ),
    };
  }
  if (geminiTier === "invalid") {
    return { cls: "invalid", node: <span>Key not recognized — double-check the paste.</span> };
  }
  return {
    cls: "free",
    node: (
      <span>
        <strong>Free key only.</strong> Runs the flash-lite pool. Add a paid key for the stronger
        adjudicator and to keep working past the daily budget.
      </span>
    ),
  };
}

// One attributable verdict for a "Ping model" that may have checked one or both
// Gemini keys. Names each field's outcome and picks the worst status for color.
// Exported for unit testing.
export function summarizePing(checks: { field: "free" | "paid"; tier: GeminiTier }[]): PingResult {
  if (checks.length === 0) return { status: "invalid", label: "Enter a key first." };
  const word = (t: GeminiTier) =>
    t === "paid"
      ? "reachable"
      : t === "free"
        ? "reachable (free tier)"
        : t === "invalid"
          ? "not recognized"
          : "unreachable";
  const label =
    checks.map((c) => `${c.field === "free" ? "Free" : "Paid"} key ${word(c.tier)}`).join(" · ") +
    ".";
  const hasInvalid = checks.some((c) => c.tier === "invalid");
  const hasUnknown = checks.some((c) => c.tier === "unknown");
  const paidIsFree = checks.some((c) => c.field === "paid" && c.tier === "free");
  const status: PingStatus = hasInvalid
    ? "invalid"
    : hasUnknown
      ? "network"
      : paidIsFree
        ? "billing"
        : "ok";
  return { status, label };
}

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
  /** Optional second Gemini key — a billed key for the stronger adjudicator +
   *  overflow. Only surfaced when the active provider is Gemini. */
  geminiPaidKey?: string;
  onGeminiPaidKeyChange?: (key: string) => void;
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
  geminiPaidKey = "",
  onGeminiPaidKeyChange,
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
  // Debug switch persisted (L9, lifecycle_integrity.md § L9): a remount must not
  // reset it to off mid-diagnosis, alongside the LLM debug log. localStorage
  // keeps it sticky across a reload.
  // The LLM debug drawer now ships in production too (owner decision,
  // 2026-07-09) — see DEBUG_PANEL_ENABLED. It sits collapsed at rest and expands
  // on click, so it's reachable without cluttering Settings, and shows the live
  // in-session call log. Prompt content stays hidden until a row is expanded, and
  // the entries are still only *persisted* to sessionStorage in dev (logger.ts
  // `canPersist`), so prod never adds the user's prompt text as data-at-rest.
  const [debugExpanded, setDebugExpanded] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [stalled, setStalled] = useState(false);
  useEffect(() => subscribeStall(setStalled), []);

  // Activity-dot tier cue (feed_surface.md §5a): reflect the real tier of the
  // in-flight call on the dot while it works. The logger tags each call's served
  // tier; subscribing re-reads it on every log event.
  const [inflightTier, setInflightTier] = useState<"fast" | "strong" | null>(null);
  useEffect(
    () => llmLogger.subscribe(() => setInflightTier(llmLogger.getInflightTier())),
    []
  );
  // Strong calls are brief and rare (contradiction adjudication), so hold the
  // strong hue for a min-visible floor once shown — otherwise a quick burst reads
  // as a flicker rather than a deliberate colour change. `displayTier` is the
  // floored view of `inflightTier`.
  const STRONG_FLOOR_MS = 600;
  const [displayTier, setDisplayTier] = useState<"fast" | "strong" | null>(null);
  const inflightTierRef = useRef(inflightTier);
  inflightTierRef.current = inflightTier;
  const strongHoldRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (inflightTier === "strong") {
      // Strong is live — show it now, cancel any pending drop.
      if (strongHoldRef.current) clearTimeout(strongHoldRef.current);
      strongHoldRef.current = undefined;
      setDisplayTier("strong");
    } else {
      // Not strong (fast-only or idle): if we're currently showing strong, hold
      // it for the floor, then fall to whatever is in flight *then*.
      setDisplayTier((prev) => {
        if (prev === "strong") {
          if (strongHoldRef.current) clearTimeout(strongHoldRef.current);
          strongHoldRef.current = setTimeout(() => {
            strongHoldRef.current = undefined;
            setDisplayTier(inflightTierRef.current);
          }, STRONG_FLOOR_MS);
          return "strong";
        }
        return inflightTier;
      });
    }
  }, [inflightTier]);
  useEffect(() => () => strongHoldRef.current && clearTimeout(strongHoldRef.current), []);
  // Deep-link seam: the first-run welcome modal + the standing keyless banner
  // open Settings without owning its state. See sidecar/settingsGate.ts.
  useEffect(() => subscribeOpenSettings(() => setShowSettings(true)), []);

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
  useEffect(() => setPing(null), [providerId, apiKey, geminiPaidKey]);

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

  // The paid field is meant for a *billed* key. Probe it the same way, purely to
  // give an honest inline check — if the user pastes a free-tier key here we say
  // so, rather than silently under-serving the strong adjudicator. It does not
  // drive capability (a paid key present already does that at the App boundary).
  const [geminiPaidTier, setGeminiPaidTier] = useState<GeminiTier | "detecting" | "idle">("idle");
  useEffect(() => {
    if (providerId !== "gemini" || !geminiPaidKey.trim()) {
      setGeminiPaidTier("idle");
      return;
    }
    let cancelled = false;
    setGeminiPaidTier("detecting");
    const t = setTimeout(async () => {
      const tier = await detectGeminiTier(geminiPaidKey);
      if (!cancelled) setGeminiPaidTier(tier);
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [providerId, geminiPaidKey]);

  // Live verification for the non-Gemini providers (Gemini has its own tier
  // probe above). Debounced the same way: once a shape-plausible key settles,
  // ping it once so the subtitle can say "verified" / "rejected" without the
  // user pressing the button. A wrong-shaped key never fires — the local shape
  // check already tells the truth, and the request would only 401.
  const [keyCheck, setKeyCheck] = useState<KeyCheckStatus>("idle");
  useEffect(() => {
    if (providerId === "gemini" || !apiKey.trim() || !keyShapeOk(providerId, apiKey)) {
      setKeyCheck("idle");
      return;
    }
    let cancelled = false;
    setKeyCheck("checking");
    const t = setTimeout(async () => {
      const result = await pingProvider(providerId, apiKey, pingModelFor(providerId));
      if (!cancelled) setKeyCheck(result.status);
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [providerId, apiKey]);

  const meta = PROVIDER_META[providerId];
  // Live per-provider model list for the picker: fetch the real models a key
  // grants (replacing the hardcoded catalog), falling back to the preset when
  // keyless or unreachable. Never blocks the modal — presets show immediately,
  // the live list swaps in when it resolves. Only paid providers show a picker.
  const [liveCatalog, setLiveCatalog] = useState<ModelCatalog | null>(null);
  useEffect(() => {
    if (!showSettings || !meta.paid || !apiKey) {
      setLiveCatalog(null);
      return;
    }
    // Seed synchronously from the session cache to avoid a preset→live flash.
    setLiveCatalog(cachedCatalog(providerId, apiKey));
    let cancelled = false;
    fetchModelCatalog(providerId, apiKey).then((c) => {
      if (!cancelled) setLiveCatalog(c);
    });
    return () => {
      cancelled = true;
    };
    // meta.paid is derived from providerId, so it's covered by the providerId dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId, apiKey, showSettings]);
  const catalog = liveCatalog ?? catalogFor(providerId);
  // Is a paid Gemini tier in play? A key in the paid field settles it outright;
  // otherwise fall back to the free field's live detection (a paid key pasted
  // there still counts) and finally the persisted keyTier.
  const geminiPaid =
    geminiPaidKey.trim().length > 0
      ? true
      : geminiTier === "paid"
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
  // The persisted choice must stay selectable even if it isn't in the (live or
  // preset) catalog — otherwise the <select> would render blank. Surface it as an
  // extra option at the top.
  const withSelected = (options: string[], selected: string) =>
    options.includes(selected) ? options : [selected, ...options];
  // Does the active provider have a key that can actually run a check? Keyless,
  // nothing runs (the evaluator skips), so the legibility card must not assert a
  // live model — it becomes a muted "what *will* run" preview instead. Gemini can
  // be keyed via either the free or the paid field.
  const hasActiveKey =
    providerId === "gemini"
      ? apiKey.trim().length > 0 || geminiPaidKey.trim().length > 0
      : apiKey.trim().length > 0;
  // On Gemini free, the single "running" model is really the primary of a rotated
  // pool (flash-lite + 3 fallbacks) that spreads the daily quota. Signal that on
  // the row itself so it can't contradict a separate pool note (which is removed).
  const geminiFreeRotating = providerId === "gemini" && !geminiPaid;
  // Collapse the legibility card to one row when both tiers run the same model
  // (Gemini free), so it never shows a duplicated name.
  const runningRows =
    selectedModels.fast === selectedModels.strong
      ? [
          {
            model: selectedModels.fast,
            job: meta.sameModelJob,
            rotation: geminiFreeRotating ? "+3 fallbacks" : undefined,
          },
        ]
      : [
          { model: selectedModels.fast, job: meta.fastJob, rotation: undefined },
          { model: selectedModels.strong, job: meta.strongJob, rotation: undefined },
        ];
  const setModel = (tier: "fast" | "strong", value: string) => {
    onModelsChange?.({ ...models, [providerId]: { ...selectedModels, [tier]: value } });
  };

  // One honest read of the whole Gemini key setup — replaces the single-key tier
  // line now that there are two fields. Paid-field problems take priority (the
  // strong adjudicator depends on it); otherwise we describe the free/paid split.
  const hasFree = apiKey.trim().length > 0;
  const hasPaid = geminiPaidKey.trim().length > 0;
  const geminiStatus =
    providerId !== "gemini" || (!hasFree && !hasPaid)
      ? null
      : geminiKeyStatus({ hasFree, hasPaid, geminiTier, geminiPaidTier, keyTier });
  const canPing = hasFree || (providerId === "gemini" && hasPaid);

  // Honest per-field subtitle state. The primary field's verification signal is
  // Gemini's tier probe when on Gemini, else the non-Gemini live check. The paid
  // field always reads off its own tier probe.
  const primaryView = keyStatusView({
    hasKey: hasFree,
    shapeOk: keyShapeOk(providerId, apiKey),
    check: providerId === "gemini" ? geminiTierToCheck(geminiTier) : keyCheck,
    shape: meta.shape,
  });
  const paidView = keyStatusView({
    hasKey: hasPaid,
    shapeOk: keyShapeOk("gemini", geminiPaidKey),
    check: geminiTierToCheck(geminiPaidTier),
    shape: "AIza…",
  });

  const runPing = async () => {
    setPinging(true);
    setPing(null);
    if (providerId === "gemini") {
      // Gemini's ping doubles as the tier probe (pro-model). With two fields we
      // check whichever keys are set and report one attributable verdict; the
      // capability tier is (re)set from the free field's read.
      const checks: { field: "free" | "paid"; tier: GeminiTier }[] = [];
      if (hasFree) {
        setGeminiTier("detecting");
        const tier = await detectGeminiTier(apiKey);
        setGeminiTier(tier);
        if (tier === "paid") onKeyTierChange?.("strong");
        else if (tier === "free") onKeyTierChange?.("weak");
        checks.push({ field: "free", tier });
      }
      if (hasPaid) {
        setGeminiPaidTier("detecting");
        const tier = await detectGeminiTier(geminiPaidKey);
        setGeminiPaidTier(tier);
        checks.push({ field: "paid", tier });
      }
      setPing(summarizePing(checks));
    } else {
      const result = await pingProvider(providerId, apiKey, pingModelFor(providerId));
      setPing(result);
      // Keep the subtitle and the manual verdict in lockstep — a click can never
      // disagree with the auto-verify.
      setKeyCheck(result.status);
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

  const modelName = activeProvider.replace(" [paid]", "") || "…";
  const anchorState = stalled ? "stalled" : pending > 0 ? "working" : "idle";
  const statusText = stalled ? "still working…" : pending > 0 ? `evaluating · ${pending}` : "idle";
  // Tier only colours the *working* state (idle/stalled carry no tier). The
  // brand-indigo "strong" hue supersedes the old free-vs-paid marker.
  const dotTier = anchorState === "working" ? displayTier : null;
  const tierLabel = dotTier === "strong" ? "deeper adjudication" : dotTier === "fast" ? "quick checks" : null;

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
            className="modal-card settings-modal"
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
                {PROVIDER_IDS.map((id) => {
                  const active = id === providerId;
                  return (
                    <button
                      key={id}
                      type="button"
                      className={active ? "is-active" : undefined}
                      aria-pressed={active}
                      onClick={() => onProviderChange?.(id)}
                    >
                      {/* Checkmark affirms the selection is committed & persisted,
                          not a transient tab. Decorative — aria-pressed already
                          carries the state to assistive tech. */}
                      {active && (
                        <svg
                          className="provider-check"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      )}
                      {PROVIDER_META[id].label}
                    </button>
                  );
                })}
              </div>
              <span className="setting-help">{meta.tierNote}</span>
            </div>

            <div className="setting-group" style={{ marginTop: "var(--space-sm)" }}>
              <div className="setting-label-row">
                <label htmlFor="api-key-input">
                  {providerId === "gemini" ? "Gemini free key" : meta.keyLabel}
                </label>
                {apiKey && (
                  <button
                    type="button"
                    className="key-remove"
                    data-testid="remove-key"
                    onClick={() => onApiKeyChange("")}
                  >
                    Remove
                  </button>
                )}
              </div>
              <input
                id="api-key-input"
                data-testid="api-key-input"
                type="text"
                className="masked-key"
                autoComplete="off"
                spellCheck={false}
                data-1p-ignore
                data-lpignore="true"
                placeholder={meta.placeholder}
                value={apiKey}
                onChange={(e) => onApiKeyChange(e.target.value)}
              />
              {/* Status reads on the field itself: it names what we actually know
                  — stored vs. checking vs. verified/rejected — not merely "a string
                  is present". Then the shape hint + a single "Get a key" link. */}
              <span className="setting-help">
                {primaryView.cls === "muted" ? (
                  primaryView.text
                ) : (
                  <strong className={`status-${primaryView.cls}`}>{primaryView.text}</strong>
                )}
                {" · starts with "}
                <code className="key-shape">{meta.shape}</code>
                {" · "}
                <a className="setting-link" href={meta.keyUrl} target="_blank" rel="noreferrer">
                  Get a key ↗
                </a>
              </span>
            </div>

            {providerId === "gemini" && (
              <div className="setting-group" style={{ marginTop: "var(--space-sm)" }}>
                <div className="setting-label-row">
                  <label htmlFor="gemini-paid-key-input">
                    Gemini paid key <span className="model-tier-note">· optional</span>
                  </label>
                  {geminiPaidKey && (
                    <button
                      type="button"
                      className="key-remove"
                      data-testid="remove-paid-key"
                      onClick={() => onGeminiPaidKeyChange?.("")}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <input
                  id="gemini-paid-key-input"
                  data-testid="gemini-paid-key-input"
                  type="text"
                  className="masked-key"
                  autoComplete="off"
                  spellCheck={false}
                  data-1p-ignore
                  data-lpignore="true"
                  placeholder="Paste a billed Gemini key…"
                  value={geminiPaidKey}
                  onChange={(e) => onGeminiPaidKeyChange?.(e.target.value)}
                />
                <span className="setting-help">
                  {geminiPaidKey && (
                    <>
                      <strong className={`status-${paidView.cls}`}>{paidView.text}</strong>
                      {" · "}
                    </>
                  )}
                  Unlocks the stronger adjudicator (
                  <code className="key-shape">gemini-2.5-pro</code>) and keeps working past the free
                  daily budget. Needs billing enabled.
                </span>
              </div>
            )}

            <div className="setting-group" style={{ marginTop: "var(--space-sm)" }}>
              <div className="ping-row">
                <button
                  type="button"
                  className="ping-btn"
                  data-testid="ping-model"
                  disabled={pinging || !canPing}
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
              {/* The key-status readout is gone; only a genuine warning (an
                  unrecognized key, or a free-tier key in the paid slot) still
                  surfaces here — the benign "what's enabled" states don't. */}
              {geminiStatus?.cls === "invalid" && (
                <div
                  className={`gemini-tier gemini-tier-${geminiStatus.cls}`}
                  data-testid="gemini-tier"
                >
                  {geminiStatus.node}
                </div>
              )}
            </div>

            <div className={`running-card${hasActiveKey ? "" : " is-preview"}`}>
              <div className="running-head">
                <span>{hasActiveKey ? "What's running" : "What will run"}</span>
                {hasActiveKey && <span className="running-why">and why</span>}
              </div>
              {runningRows.map((row) => (
                <div className="running-row" key={row.model}>
                  <code className="running-model">
                    {row.model}
                    {row.rotation && <span className="running-rotation"> · {row.rotation}</span>}
                  </code>
                  <span>{row.job}</span>
                </div>
              ))}
            </div>

            {meta.paid && (
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
                  {withSelected(catalog.fast, selectedModels.fast).map((m) => (
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
                  {withSelected(catalog.strong, selectedModels.strong).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {meta.paid && meta.cost && <div className="pay-note">{meta.cost}</div>}

            {/* The privacy fact is equally true for every provider: the key rides
                straight from this browser to the provider and lives only in this
                device's localStorage — never a server of ours. One shared line,
                not a per-provider field. */}
            <div className="trust-note" data-testid="trust-note">
              Your {meta.label} key goes straight from this browser to {meta.label}, and is stored
              only on this device — never on a server of ours.
            </div>

            {/* In-app OSS discoverability: a hosted-demo visitor should be able
                to find the source — and learn they can self-host — without
                leaving for the README. Deliberately quiet, sits above the build
                stamp. The "run it locally" line is the privacy payoff: cloning
                takes writtten.com out of the loop entirely. */}
            <div className="settings-oss" data-testid="oss-link">
              <a
                className="settings-oss-repo"
                href="https://github.com/batirko/writtten"
                target="_blank"
                rel="noreferrer"
              >
                Open source · github.com/batirko/writtten
              </a>
              <span className="settings-oss-note">Clone the repo to run writtten locally.</span>
            </div>

            <div className="settings-build" data-testid="build-version">
              writtten v{__APP_VERSION__}
              <span className="settings-build-sha"> · {__GIT_SHA__}</span>
            </div>
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
            {/* Names the in-flight tier so the dot's hue is never the only signal
                (a11y): "strong" adjudication reads on the tier-indigo dot. */}
            {tierLabel && (
              <span className={`tier-chip tier-${dotTier}`} data-testid="tier-chip">
                {tierLabel}
              </span>
            )}
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

          {DEBUG_PANEL_ENABLED && (
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
            data-tier={dotTier === "strong" ? "strong" : undefined}
            tabIndex={0}
            role="button"
            aria-expanded={forceOpen || tapOpen}
            aria-label={`Model ${modelName} — ${statusText}${tierLabel ? ` (${tierLabel})` : ""}. Tap to open controls.`}
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
