import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Editor } from "./editor/Editor";
import { SidecarFeed } from "./sidecar/SidecarFeed";
import { WelcomeModal } from "./sidecar/WelcomeModal";
import { DemoCoachmarks } from "./sidecar/DemoCoachmarks";
import { openSettings } from "./sidecar/settingsGate";
import { agentBridgeEnabled } from "./services/featureFlags";
import { SpanPeek } from "./sidecar/SpanPeek";
import { ControlCenter } from "./sidecar/ControlCenter";
import { DocumentContext } from "./sidecar/DocumentContext";
import { MobileNote } from "./sidecar/MobileNote";
import { groupObservations, findGroupForObs } from "./sidecar/obsAggregation";
import { surfacedObservationIds, DEFAULT_FEED_BUDGET } from "./sidecar/feedBudget";
import {
  loadObservationsForDocument,
  updateObservationStatus,
  clearDocumentData,
  saveDismissalSuppression,
  type Observation,
} from "./store/db";
import { scheduleEval } from "./services/orchestrator";
import { conflictPairKey } from "./services/evaluator";
import { EXAMPLE_DOC_HTML, EXAMPLE_STAGE } from "./services/exampleDoc";
import {
  activateExampleReplay,
  deactivateExampleReplay,
  onKeyBecameAvailable,
} from "./services/exampleReplay";
import { clearSnapshotsForDocument } from "./services/evalSnapshot";
import type { EvalContext } from "./services/types";
import { capabilityForTier, type ModelTier } from "./model/capability";
import { setActiveProviderSelection } from "./model/factory";
import type { ProviderId } from "./model/provider";
import { llmLogger, type LLMLogEntry, type SessionStats } from "./model/logger";
import { harness } from "./debug/harness";
import { subscribeActivity } from "./model/activitySignal";
import { subscribeObservationsChanged } from "./model/observationsSignal";
import { nanoid } from "nanoid";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { downloadMarkdown, exportPdf, copyMarkdown, copyRichText } from "./services/export";

const DOC_ID = "default";

export default function App() {
  const [apiKey, setApiKey] = useState<string>(() => {
    return (
      localStorage.getItem("writtten_api_key") ||
      (import.meta.env.VITE_GEMINI_API_KEY as string) ||
      ""
    );
  });

  // The user's declaration of their BYO Gemini key's capability tier. Persisted so
  // a capable BYO key keeps driving the strong path across sessions. Default weak:
  // never assume a pasted key is a reasoning model without an explicit say-so.
  const [keyTier, setKeyTier] = useState<ModelTier>(() => {
    return (localStorage.getItem("writtten_key_tier") as ModelTier) || "weak";
  });
  useEffect(() => {
    localStorage.setItem("writtten_key_tier", keyTier);
  }, [keyTier]);

  // Active provider (multi-provider BYOK). Gemini is the free on-ramp + example-
  // replay tier; OpenAI/Anthropic are paid, each with its own key.
  const [providerId, setProviderId] = useState<ProviderId>(() => {
    return (localStorage.getItem("writtten_provider") as ProviderId) || "gemini";
  });
  useEffect(() => localStorage.setItem("writtten_provider", providerId), [providerId]);

  const [openaiKey, setOpenaiKey] = useState<string>(
    () => localStorage.getItem("writtten_key_openai") || ""
  );
  useEffect(() => localStorage.setItem("writtten_key_openai", openaiKey), [openaiKey]);
  const [anthropicKey, setAnthropicKey] = useState<string>(
    () => localStorage.getItem("writtten_key_anthropic") || ""
  );
  useEffect(() => localStorage.setItem("writtten_key_anthropic", anthropicKey), [anthropicKey]);

  // A second, optional Gemini key: a *billed* key that carries the stronger
  // adjudicator (gemini-2.5-pro, 0-RPD on free) and absorbs overflow once the
  // free key's daily budget runs out. The free key above stays the everyday
  // workhorse; this rides the router's separate `paidKey` slot (free→paid
  // fallback already lives in rotation.ts). An env `VITE_GEMINI_PAID_KEY` still
  // wins for local dev. See docs/projects/byok_capability_model.md.
  const [geminiPaidKey, setGeminiPaidKey] = useState<string>(
    () => localStorage.getItem("writtten_gemini_paid_key") || ""
  );
  useEffect(() => localStorage.setItem("writtten_gemini_paid_key", geminiPaidKey), [geminiPaidKey]);

  // Per-provider model choice ({ openai: {fast,strong}, ... }). Empty for a
  // provider = use its catalog default (the "capable split" for paid providers).
  const [models, setModels] = useState<Record<string, { fast: string; strong: string }>>(() => {
    try {
      return JSON.parse(localStorage.getItem("writtten_model_selections") || "{}");
    } catch {
      return {};
    }
  });
  useEffect(
    () => localStorage.setItem("writtten_model_selections", JSON.stringify(models)),
    [models]
  );

  // The active provider's key — drives the settings key field + example replay.
  const activeKey =
    providerId === "gemini" ? apiKey : providerId === "openai" ? openaiKey : anthropicKey;
  const setActiveKey = (v: string) => {
    if (providerId === "gemini") setApiKey(v);
    else if (providerId === "openai") setOpenaiKey(v);
    else setAnthropicKey(v);
  };

  // Point the model router at the active provider + chosen models. Provider choice
  // is a single global setting; capability stays threaded explicitly (below) and
  // is never read from the router. See docs/projects/byok_capability_model.md.
  useEffect(() => {
    setActiveProviderSelection({
      providerId,
      fastModel: models[providerId]?.fast,
      strongModel: models[providerId]?.strong,
    });
  }, [providerId, models]);

  // Credential ≠ capability. Both are derived here, once, from the active
  // provider's configuration; the evaluator branches on capability, never on a
  // credential. See docs/projects/byok_capability_model.md.
  //   - Gemini: an env paid key, a UI paid key, or a UI-declared "strong" free
  //     key → strong; else weak.
  //   - A paid provider (OpenAI/Anthropic): the capable split → strong.
  const envPaidKey: string | undefined =
    (import.meta.env.VITE_GEMINI_PAID_KEY as string) || undefined;
  // The resolved Gemini paid key: an explicit env key, the UI paid field, or —
  // for backward compat with the single-key era — a free-field key that
  // auto-detect found to be paid tier (keyTier "strong").
  const geminiPaidResolved: string | undefined =
    envPaidKey ??
    (geminiPaidKey || undefined) ??
    (keyTier === "strong" && apiKey ? apiKey : undefined);
  const geminiStrong = Boolean(geminiPaidResolved);
  const effectiveTier: ModelTier =
    providerId === "gemini" ? (geminiStrong ? "strong" : "weak") : "strong";
  const capability = capabilityForTier(effectiveTier);
  // Keys threaded to the eval path. For a paid provider the single key rides the
  // `paidKey` slot; it's also passed as the free key purely to satisfy the
  // evaluator's "has a key" guard — the free pool is empty, so it never reaches
  // the network. For Gemini the free field feeds the free pool; if only a paid
  // key is set it feeds both slots (one key does everything, billed).
  const apiKeyForEval = providerId === "gemini" ? apiKey || geminiPaidKey : activeKey;
  const paidKey: string | undefined =
    providerId === "gemini" ? geminiPaidResolved : activeKey || undefined;

  const [stage, setStage] = useState<string>(() => {
    return localStorage.getItem("writtten_stage") || "";
  });

  const [jargonAllowlist, setJargonAllowlist] = useState<string>(() => {
    return localStorage.getItem("writtten_jargon_allowlist") || "";
  });

  const [observations, setObservations] = useState<Observation[]>([]);
  const [archivedObservations, setArchivedObservations] = useState<Observation[]>([]);
  const [blockOrder, setBlockOrder] = useState<string[]>([]);
  // Sections whose text exceeds MAX_SECTION_CHARS — the evaluator reads only up
  // to the cap, and the feed says so honestly (heading-cliff facet 2).
  // totalSections distinguishes "the whole doc is one unbroken section" from
  // "the unheaded intro of a sectioned doc" in the note's copy.
  const [truncInfo, setTruncInfo] = useState<{
    sections: { sectionId: string; headingText: string }[];
    totalSections: number;
  }>({ sections: [], totalSections: 0 });
  const [hoveredObservationId, setHoveredObservationId] = useState<string | null>(null);
  // Reverse hover (UX-006): the primary id of the card whose span the pointer is
  // dwelling on. Distinct from hoveredObservationId because *only* a span-origin
  // hover drives the spotlight (open feed) and the floating peek (collapsed feed).
  const [spanFocusObsId, setSpanFocusObsId] = useState<string | null>(null);
  // C9: the full set of card (group-primary) ids covering the dwelled point, so
  // every card sharing the span lights up — not just the primary. The primary is
  // still `spanFocusObsId`; this is the co-covering set (includes the primary).
  const [spanFocusRelatedIds, setSpanFocusRelatedIds] = useState<string[]>([]);
  // C8: pin-on-click. Clicking a highlighted span pins its card as a persistent
  // peek (dismiss on Escape / click-away / ×). While pinned, the reverse-hover
  // channel is suppressed so the pointer can travel freely without the float
  // jumping or closing. `spanPinnedRef` mirrors it for the (ref-based) hover
  // guard and the Editor's suppression.
  const [spanPinnedObsId, setSpanPinnedObsId] = useState<string | null>(null);
  const spanPinnedRef = useRef<string | null>(null);
  useEffect(() => {
    spanPinnedRef.current = spanPinnedObsId;
  }, [spanPinnedObsId]);
  const spanCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [clearTrigger, setClearTrigger] = useState(0);
  const [stageSuggestion, setStageSuggestion] = useState<string | null>(null);
  // Dismissal damping for the context suggestion chip: a declined guess is not
  // re-offered verbatim — since the section fast call re-asks on every settle
  // while no stage is set, an undamped chip would nag the identical guess back
  // after each edit. The chip returns only when the model's guess actually
  // changes (normalized compare; session-scoped, deliberately not persisted).
  const dismissedStageSuggestionRef = useRef<string | null>(null);
  const handleStageSuggestion = useCallback((suggestion: string) => {
    if (dismissedStageSuggestionRef.current === suggestion.trim().toLowerCase()) return;
    setStageSuggestion(suggestion);
  }, []);
  const [importContent, setImportContent] = useState<{
    content: string;
    timestamp: number;
    docScan?: boolean;
  }>();

  // Companion surface: the feed column reflows the canvas (never overlays it).
  // Collapsed → canvas reclaims full editorial measure. Persisted per session.
  // Default expanded on every viewport so the feed is visible-and-discoverable —
  // on a phone it was previously default-collapsed (the M2 decision) but that made
  // the observation feed easy to miss, so it now leads visible on narrow too
  // (docs/projects/mobile_responsive.md § M2). A stored preference always wins.
  const [feedCollapsed, setFeedCollapsed] = useState<boolean>(() => {
    const stored = localStorage.getItem("writtten_feed_collapsed");
    if (stored != null) return stored === "1";
    return false;
  });
  useEffect(() => {
    localStorage.setItem("writtten_feed_collapsed", feedCollapsed ? "1" : "0");
  }, [feedCollapsed]);

  // First-run welcome moment: a one-time blocking modal (onboarding_first_run.md
  // § Revision 2026-07-07). Chrome, not an observation — persisted like the other
  // UI flags (localStorage, no DB schema). Not re-openable once dismissed; the
  // standing keyless banner is the persistent re-entry point for the key ask.
  const [hasSeenWelcome, setHasSeenWelcome] = useState<boolean>(
    () => localStorage.getItem("writtten_has_seen_welcome") === "1"
  );
  useEffect(() => {
    localStorage.setItem("writtten_has_seen_welcome", hasSeenWelcome ? "1" : "0");
  }, [hasSeenWelcome]);

  // Whether the recorded "See it in action" example is loaded — tunes the
  // keyless banner copy (demo vs. general keyless). Session-only (not persisted):
  // the example never survives a reload.
  const [demoActive, setDemoActive] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        setFeedCollapsed((c) => !c);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Reverse hover (UX-006). Resolve a hovered span's raw observation id to its
  // rendered card (group primary) and drive both the shared highlight channel
  // and the span-focus channel. On leave, a short grace lets the pointer travel
  // onto the floating peek (collapsed) before it closes.
  const groups = useMemo(() => groupObservations(observations), [observations]);
  // Only surfaced (budgeted) observations get a visible canvas highlight; the
  // downgraded "also noticed" ones stay messages-only. Memoized so the Set
  // identity is stable across renders (the highlighter only rebuilds on change).
  const surfacedIds = useMemo(
    () => surfacedObservationIds(observations, { budget: DEFAULT_FEED_BUDGET, blockOrder }),
    [observations, blockOrder]
  );
  const cancelSpanClose = useCallback(() => {
    if (spanCloseTimer.current) clearTimeout(spanCloseTimer.current);
    spanCloseTimer.current = null;
  }, []);
  const handleSpanHover = useCallback(
    (rawId: string | null, relatedIds?: string[]) => {
      // C8: while a card is pinned, hover is inert — the pin owns the focus and
      // must not be cleared by the pointer leaving the span.
      if (spanPinnedRef.current) return;
      cancelSpanClose();
      if (rawId == null) {
        spanCloseTimer.current = setTimeout(() => {
          setSpanFocusObsId(null);
          setHoveredObservationId(null);
          setSpanFocusRelatedIds([]);
        }, 150);
        return;
      }
      const primaryId = findGroupForObs(groups, rawId)?.primary.id ?? rawId;
      setSpanFocusObsId(primaryId);
      setHoveredObservationId(primaryId);
      // C9: map every covering raw obs id to its rendered card (group primary)
      // and dedupe, so co-located observations grouped into different cards all
      // light up. Falls back to the primary alone when no set was provided.
      const related = relatedIds?.length ? relatedIds : [rawId];
      setSpanFocusRelatedIds([
        ...new Set(related.map((id) => findGroupForObs(groups, id)?.primary.id ?? id)),
      ]);
    },
    [groups, cancelSpanClose]
  );
  // The card(s) the float surfaces: the whole covering set (C9), primary first,
  // resolved from `spanFocusRelatedIds` (populated for both hover and pin). A
  // single covering obs → one card, exactly as before. They stack in the float
  // over the dimmed feed, so co-located cards never collide with loose feed cards.
  const spanPeekGroups = useMemo(() => {
    const ids = spanFocusRelatedIds.length
      ? spanFocusRelatedIds
      : spanFocusObsId
        ? [spanFocusObsId]
        : [];
    return ids
      .map((id) => findGroupForObs(groups, id))
      .filter((g): g is NonNullable<typeof g> => g != null);
  }, [groups, spanFocusRelatedIds, spanFocusObsId]);

  // C8: pin the covering set (resolved by the Editor's C9 hit-test) as a
  // persistent peek. Drives the same focus channels as hover so the feed dims +
  // the primary floats via SpanPeek, but stays put until explicitly dismissed.
  const handleSpanPin = useCallback(
    (rawId: string, relatedIds?: string[]) => {
      cancelSpanClose();
      const primaryId = findGroupForObs(groups, rawId)?.primary.id ?? rawId;
      const related = relatedIds?.length ? relatedIds : [rawId];
      const relatedPrimaries = [
        ...new Set(related.map((id) => findGroupForObs(groups, id)?.primary.id ?? id)),
      ];
      setSpanPinnedObsId(primaryId);
      setSpanFocusObsId(primaryId);
      setHoveredObservationId(primaryId);
      setSpanFocusRelatedIds(relatedPrimaries);
    },
    [groups, cancelSpanClose]
  );
  const dismissPin = useCallback(() => {
    cancelSpanClose();
    setSpanPinnedObsId(null);
    setSpanFocusObsId(null);
    setHoveredObservationId(null);
    setSpanFocusRelatedIds([]);
  }, [cancelSpanClose]);
  // Dismiss the pin on Escape or a click-away — a pointer-down outside the peek
  // and off any highlighted span (clicking another highlight re-pins via the
  // Editor; clicking inside the peek keeps it). Only active while pinned.
  useEffect(() => {
    if (spanPinnedObsId == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismissPin();
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.(".span-peek")) return;
      if (t?.closest?.(".obs-highlight[data-obs-id]")) return;
      dismissPin();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown, true);
    };
  }, [spanPinnedObsId, dismissPin]);

  const [logs, setLogs] = useState<LLMLogEntry[]>([]);
  const [activeProvider, setActiveProvider] = useState<string>("gemini-2.0-flash");
  const [sessionStats, setSessionStats] = useState<SessionStats>({
    fastCalls: 0,
    strongCalls: 0,
    totalCalls: 0,
    totalLatencyMs: 0,
    avgLatencyMs: 0,
    totalPromptTokens: 0,
    totalCandidateTokens: 0,
    totalCost: 0,
  });
  const [pending, setPending] = useState(0);
  const editorRef = useRef<TiptapEditor | null>(null);
  // Stable handle to the latest clear handler for __sidecar__.clear().
  const clearWorkspaceRef = useRef<() => void>(() => {});

  const handleExportMarkdown = () => editorRef.current && downloadMarkdown(editorRef.current);
  const handleExportPdf = () => editorRef.current && exportPdf();
  const handleCopyMarkdown = async () =>
    editorRef.current && (await copyMarkdown(editorRef.current));
  const handleCopyRichText = async () =>
    editorRef.current && (await copyRichText(editorRef.current));

  // Stable refs for stage-change trigger
  const apiKeyRef = useRef(apiKeyForEval);
  useEffect(() => {
    apiKeyRef.current = apiKeyForEval;
  }, [apiKeyForEval]);
  const stageRef = useRef(stage);
  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);
  const stageSettleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the last stage value we've seen so we don't fire on initial mount
  // (also handles React StrictMode double-invoke cleanly).
  const prevStageValueRef = useRef(stage);
  const lastSettledStageRef = useRef(stage);

  useEffect(() => {
    const unsubscribe = llmLogger.subscribe((newLogs, provider) => {
      setLogs(newLogs);
      setActiveProvider(provider);
      setSessionStats(llmLogger.getSessionStats());
    });
    return unsubscribe;
  }, []);

  // Activity-center "working" pulse: the outstanding-eval count from the
  // orchestrator's production-safe signal. (Historically this only flowed
  // through the dev harness, so the dot stayed grey in production builds.)
  useEffect(() => subscribeActivity(setPending), []);

  // Dev-only acceptance harness: attach window.__sidecar__ so tools can inspect
  // live state. Stripped from the production build via import.meta.env.DEV.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    harness.install({ docId: DOC_ID });
    harness.registerClear(() => clearWorkspaceRef.current());
  }, []);

  // Sync settings to localStorage
  useEffect(() => {
    localStorage.setItem("writtten_api_key", apiKey);
  }, [apiKey]);

  // If a key appears while the keyless example replay is installed (e.g. the user
  // pastes a BYO key mid-demo), stop full mock replay so their real edits run
  // live instead of replaying the example fixture.
  useEffect(() => {
    if (activeKey) onKeyBecameAvailable();
  }, [activeKey]);

  useEffect(() => {
    localStorage.setItem("writtten_stage", stage);
  }, [stage]);

  useEffect(() => {
    localStorage.setItem("writtten_jargon_allowlist", jargonAllowlist);
  }, [jargonAllowlist]);

  // Load and refresh observations from DB — splits active (feed) from archived
  const refreshObservations = () => {
    loadObservationsForDocument(DOC_ID).then((all) => {
      setObservations(all.filter((o) => o.status === "active"));
      setArchivedObservations(all.filter((o) => o.status !== "active"));
    });
  };

  // An agent-submitted observation never goes through an eval pass, so it has no
  // scheduleEval onComplete to refresh the feed — it announces itself instead.
  useEffect(() => subscribeObservationsChanged(refreshObservations), []);

  // Initial load
  useEffect(() => {
    refreshObservations();
  }, []);

  const handleClearWorkspace = async () => {
    // Leaving the example demo — restore the live router.
    deactivateExampleReplay();
    setDemoActive(false);
    await clearDocumentData(DOC_ID);
    clearSnapshotsForDocument(DOC_ID);
    setObservations([]);
    setArchivedObservations([]);
    setStageSuggestion(null);
    setStage("");
    setJargonAllowlist("");
    llmLogger.clearLogs();
    setClearTrigger((n) => n + 1);
  };
  clearWorkspaceRef.current = handleClearWorkspace;

  const handleImportFile = async (file: File) => {
    const text = await file.text();
    // The user is bringing their own document — always evaluate it for real.
    deactivateExampleReplay();
    setDemoActive(false);
    await clearDocumentData(DOC_ID);
    clearSnapshotsForDocument(DOC_ID);
    setObservations([]);
    setArchivedObservations([]);
    setStageSuggestion(null);
    setStage("");
    setJargonAllowlist("");
    llmLogger.clearLogs();
    setImportContent({ content: text, timestamp: Date.now() });
  };

  // First-run welcome: dismissing is chrome — set the persisted flag, no
  // suppression write and no Undo toast (it isn't an observation).
  const handleDismissWelcome = () => setHasSeenWelcome(true);

  // "Add your key" (the modal's accent, activation-first CTA): deep-link into the
  // BYOK Settings modal and retire the welcome. The standing keyless banner keeps
  // the key ask visible afterward if they close Settings without a key.
  const handleAddKey = () => {
    setHasSeenWelcome(true);
    openSettings();
  };

  // "Connect your agent" — the second, equal on-ramp. Same shape as handleAddKey,
  // but the intent lands the user in the connect section with a pairing already
  // started (see sidecar/settingsGate.ts).
  const handleConnectAgent = () => {
    setHasSeenWelcome(true);
    openSettings("connect-agent");
  };

  // The welcome card retires itself once the user is clearly engaged — not only
  // on an explicit ×. First trigger: their first evaluation settles (this hook,
  // wired to the Editor). Second trigger: they click "See it in action"
  // (handleLoadExample). setHasSeenWelcome(true) is idempotent, so calling it on
  // every settle is a cheap no-op once already dismissed. Fires from the
  // orchestrator's finally block, so it lands even keyless / on skip, and only
  // after a real trigger from the user's own text (never spuriously on mount —
  // initial load calls refreshObservations directly, not through here).
  const handleEvaluationComplete = () => {
    setHasSeenWelcome(true);
    refreshObservations();
  };

  // "See it in action": load the pre-written example PRD so the pipeline catches
  // its planted contradiction. Reuses the import path (installs the doc +
  // schedules the contradiction sweep). Only offered on a blank doc, so it never
  // clobbers the user's own text.
  //
  // Keyless, the evaluator would skip every check, so we replay a bundled
  // recording (mock mode). Keyed, the live pipeline runs — but we still arm the
  // recording as an error-fallback so a spent quota (429) can't blank the demo.
  const handleLoadExample = async () => {
    // Clicking the CTA retires the welcome modal (it's done its job).
    setHasSeenWelcome(true);
    setDemoActive(true);
    activateExampleReplay({ keyless: !activeKey });
    await clearDocumentData(DOC_ID);
    clearSnapshotsForDocument(DOC_ID);
    setObservations([]);
    setArchivedObservations([]);
    setStageSuggestion(null);
    setStage(EXAMPLE_STAGE);
    setJargonAllowlist("");
    llmLogger.clearLogs();
    // docScan: run the doc-level review as part of the demo load. The normal
    // import path never arms the doc-idle timer (setContent suppresses the
    // update event), so without this the example would never surface a
    // doc-scope observation (e.g. missing_topic) at the witness moment — it
    // would only ever show section + contradiction cards. See Editor's import
    // effect and docs/projects/onboarding_first_run.md § Revision 2026-07-07.
    setImportContent({ content: EXAMPLE_DOC_HTML, timestamp: Date.now(), docScan: true });
  };

  // Finalize a dismissal: write the (G1 kind/severity-aware) suppression + flip
  // the observation to `dismissed`. The C3 feed calls this only when a dismiss
  // placeholder fades (~5s); Undo before then cancels locally and never calls
  // this, so there is no suppression to roll back. See docs/mechanics/dismiss_undo.md.
  const handleDismissObservation = async (id: string, closureReason?: string) => {
    const obs = observations.find((o) => o.id === id);
    if (obs) {
      const spanSignature =
        obs.scope === "span" && obs.blockId != null
          ? `${obs.blockId}:${obs.startOffset ?? ""}:${obs.endOffset ?? ""}`
          : undefined;
      // L5: store the anchor identity so the suppression matches across edits.
      const isConflict = obs.type === "contradiction" || obs.type === "strategic_tension";
      await saveDismissalSuppression({
        id: nanoid(10),
        docId: DOC_ID,
        type: obs.type,
        kind: obs.kind,
        severity: obs.severity,
        spanSignature,
        anchorText: obs.anchorText,
        conflictingAnchorText: isConflict ? obs.conflictingAnchorText : undefined,
        conflictPairKey:
          isConflict && obs.blockId != null && obs.conflictingBlockId != null
            ? conflictPairKey(obs)
            : undefined,
        note: closureReason,
      });
    }
    await updateObservationStatus(id, "dismissed", closureReason);
    if (import.meta.env.DEV && obs) {
      harness.archive({
        observationId: obs.id,
        obsType: obs.type,
        kind: obs.kind,
        severity: obs.severity,
        scope: obs.scope,
        blockId: obs.blockId,
        text: obs.text,
        reason: "dismissed",
        actor: "user",
      });
    }
    refreshObservations();
  };

  const handleObservationCollapsed = async (id: string) => {
    await updateObservationStatus(id, "auto_closed", "dismissed");
    if (import.meta.env.DEV) {
      const obs = observations.find((o) => o.id === id);
      if (obs) {
        harness.archive({
          observationId: obs.id,
          obsType: obs.type,
          kind: obs.kind,
          severity: obs.severity,
          scope: obs.scope,
          blockId: obs.blockId,
          text: obs.text,
          reason: "collapsed",
          actor: "user",
        });
      }
    }
    refreshObservations();
  };

  // Fire stage-changed trigger when the stage field re-settles after being edited.
  // prevStageValueRef guard prevents firing on initial mount and handles
  // React StrictMode double-invoke (refs persist across remounts, value unchanged).
  useEffect(() => {
    if (stage === prevStageValueRef.current) return;
    prevStageValueRef.current = stage;

    if (stageSettleTimer.current) clearTimeout(stageSettleTimer.current);
    stageSettleTimer.current = setTimeout(() => {
      const previousStage = lastSettledStageRef.current;
      lastSettledStageRef.current = stage;

      const ctx: EvalContext = {
        docId: DOC_ID,
        apiKey: apiKeyRef.current ?? "",
        paidKey,
        capability,
        stage: stageRef.current,
        onStageSuggestion: handleStageSuggestion,
      };
      scheduleEval({ kind: "stage-changed", previousStage }, null, ctx, refreshObservations);
    }, 3000);
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAcceptStageSuggestion = (suggestion: string) => {
    setStage(suggestion);
    setStageSuggestion(null);
  };

  const handleDismissStageSuggestion = () => {
    dismissedStageSuggestionRef.current = stageSuggestion?.trim().toLowerCase() ?? null;
    setStageSuggestion(null);
  };

  return (
    <div className="app">
      <main className="editor-panel">
        <div className="editor-column">
          <MobileNote />
          <DocumentContext
            stage={stage}
            onStageChange={setStage}
            stageSuggestion={stageSuggestion}
            onAcceptStageSuggestion={handleAcceptStageSuggestion}
            onDismissStageSuggestion={handleDismissStageSuggestion}
          />
          <Editor
            apiKey={apiKeyForEval}
            paidKey={paidKey}
            capability={capability}
            stage={stage}
            jargonAllowlist={jargonAllowlist
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean)}
            observations={observations}
            surfacedIds={surfacedIds}
            hoveredObservationId={hoveredObservationId}
            onSpanHover={handleSpanHover}
            onSpanPin={handleSpanPin}
            isPinned={spanPinnedObsId != null}
            onObservationCollapsed={handleObservationCollapsed}
            onEvaluationComplete={handleEvaluationComplete}
            onStageSuggestion={handleStageSuggestion}
            onBlockOrderChange={setBlockOrder}
            onTruncatedSectionsChange={(sections, totalSections) =>
              setTruncInfo({ sections, totalSections })
            }
            clearTrigger={clearTrigger}
            importContent={importContent}
            onReady={(e) => (editorRef.current = e)}
          />
        </div>
      </main>
      <button
        className="feed-handle"
        data-testid="feed-handle"
        onClick={() => setFeedCollapsed((c) => !c)}
        aria-label={feedCollapsed ? "Show observations" : "Hide observations"}
        aria-expanded={!feedCollapsed}
        title={feedCollapsed ? "Show observations (⌘\\)" : "Hide observations (⌘\\)"}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transform: feedCollapsed ? "rotate(180deg)" : "none" }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
      {/* Always mounted so the fold animates (width transition); the canvas
          reflows around it. aria-hidden while collapsed. */}
      <div
        className={`feed-slot${feedCollapsed ? " is-collapsed" : ""}`}
        aria-hidden={feedCollapsed}
      >
        <SidecarFeed
          observations={observations}
          archivedObservations={archivedObservations}
          blockOrder={blockOrder}
          hoveredObservationId={hoveredObservationId}
          spanFocusObsId={feedCollapsed ? null : spanFocusObsId}
          onHoverObservation={setHoveredObservationId}
          onDismissObservation={handleDismissObservation}
          hasKey={Boolean(activeKey)}
          demoActive={demoActive}
          truncatedSections={truncInfo.sections}
          totalSections={truncInfo.totalSections}
        />
      </div>
      {/* Reverse hover floats the hovered span's card(s) at the top of the gutter
          — the feed behind dims; when collapsed it's the only thing shown. Always
          top-anchored so it's on-screen even if the feed is scrolled. Co-located
          (C9) cards stack here as one float. */}
      <SpanPeek
        groups={spanPeekGroups}
        pinned={spanPinnedObsId != null}
        onDismiss={handleDismissObservation}
        onKeepOpen={cancelSpanClose}
        onClose={() => handleSpanHover(null)}
        onClosePin={dismissPin}
      />
      {/* Control center is always visible — independent of feed collapse. */}
      <ControlCenter
        pending={pending}
        activeProvider={activeProvider}
        sessionStats={sessionStats}
        documentIsEmpty={blockOrder.length === 0}
        apiKey={activeKey}
        onApiKeyChange={setActiveKey}
        keyTier={keyTier}
        onKeyTierChange={setKeyTier}
        geminiPaidKey={geminiPaidKey}
        onGeminiPaidKeyChange={setGeminiPaidKey}
        providerId={providerId}
        onProviderChange={setProviderId}
        models={models}
        onModelsChange={setModels}
        onImportFile={handleImportFile}
        onClearWorkspace={handleClearWorkspace}
        onExportMarkdown={handleExportMarkdown}
        onExportPdf={handleExportPdf}
        onCopyMarkdown={handleCopyMarkdown}
        onCopyRichText={handleCopyRichText}
        logs={logs}
      />
      {/* First-run interruption: a blocking, closable welcome modal that frames
          the inversion and names the key requirement. Rendered at the app root
          (above the feed) so it overlays the whole surface. */}
      {!hasSeenWelcome && (
        <WelcomeModal
          onClose={handleDismissWelcome}
          onAddKey={handleAddKey}
          // Undefined while the flag is off, which is also what hides the button.
          onConnectAgent={agentBridgeEnabled() ? handleConnectAgent : undefined}
          onLoadExample={handleLoadExample}
          // A blank editor still holds one empty paragraph block, so "brand-new,
          // nothing to clobber" is <= 1 block (not === 0). Gates the example off
          // the user's own multi-block text.
          canLoadExample={blockOrder.length <= 1}
        />
      )}
      {/* Onboarding coachmarks over the "See it in action" demo — a temporary,
          non-blocking tour of the three surfaces. Only while the demo is loaded
          (demoActive); the component suppresses itself on mobile. */}
      <DemoCoachmarks active={demoActive} />
    </div>
  );
}
