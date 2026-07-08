import { useState, useEffect, useRef, useCallback } from "react";
import type { Observation } from "../store/db";
import { partitionFeed, DEFAULT_FEED_BUDGET } from "./feedBudget";
import type { GroupedObservation } from "./feedBudget";
import { openSettings } from "./settingsGate";

// Stable per-group key for the pending-dismiss map — mirrors obsAggregation's
// grouping key (span coords, or a per-obs doc-scope key). Deliberately NOT
// group.id (= primary.id), which can swap if a re-eval re-ranks the group.
function groupKey(group: GroupedObservation): string {
  return group.blockId != null
    ? `${group.blockId}:${group.startOffset ?? ""}:${group.endOffset ?? ""}`
    : `__doc__:${group.primary.id}`;
}

// ---------------------------------------------------------------------------
// DismissIcon
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

// ---------------------------------------------------------------------------
// KeylessBanner — the standing "add your key" card at the top of the feed, shown
// in ANY keyless state (onboarding_first_run.md § Revision 2026-07-07, Decision
// #3 + the recommended any-keyless generalization). Keyless, the evaluator does
// nothing on the user's own text; without this the quiet empty state would mask
// a hard requirement. Brand-tint (not severity) — it's the product being honest,
// not flagging a defect. Its link deep-links into the BYOK Settings modal.
//
// Not a nag: it's a single standing banner, not a second interruption — the
// welcome modal is the one permitted first-run interruption.
// ---------------------------------------------------------------------------

function KeyIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="7.5" cy="15.5" r="4.5"></circle>
      <path d="M10.7 12.3 21 2"></path>
      <path d="m16 6 3 3"></path>
    </svg>
  );
}

function KeylessBanner({ demoActive }: { demoActive: boolean }) {
  return (
    <div className="keyless-banner" data-testid="keyless-banner" role="note">
      <span className="keyless-banner-icon">
        <KeyIcon />
      </span>
      <div className="keyless-banner-body">
        <p className="keyless-banner-lead">
          {demoActive
            ? "This is a demo running on recorded responses."
            : "Add a key to read your own writing."}
        </p>
        <p className="keyless-banner-sub">
          {demoActive
            ? "Analyzing your own writing needs an API key. "
            : "writtten needs an API key to read your text — it stays on this device. "}
          <button
            type="button"
            className="keyless-banner-link"
            data-testid="keyless-banner-settings"
            onClick={openSettings}
          >
            Add your key in Settings <span aria-hidden="true">→</span>
          </button>
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GroupedObsCard — renders a single group (one or more observations on the
// same span). Severity is carried by the type tag (feed_surface.md § Card
// execution), driven by the card's data-kind / data-severity / data-obs-type.
// ---------------------------------------------------------------------------

interface GroupedObsCardProps {
  group: GroupedObservation;
  isActive: boolean;
  isArriving: boolean;
  /** Reverse-hover focus (UX-006): a span is focused elsewhere — recede. */
  isDimmed?: boolean;
  onHover: (id: string | null) => void;
  /** Dismiss the whole group (primary + same-span members) as one unit — the
   *  card is replaced in place by the C3 dismiss placeholder, which reverses
   *  them together. */
  onDismiss: (group: GroupedObservation) => void;
}

export function GroupedObsCard({
  group,
  isActive,
  isArriving,
  isDimmed = false,
  onHover,
  onDismiss,
}: GroupedObsCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { primary, others } = group;

  const handleDismiss = () => {
    onDismiss(group);
  };

  return (
    <div
      className={`observation-card observation-${primary.type}${isActive ? " observation-card-active" : ""}${isArriving ? " observation-card-arriving" : ""}${isDimmed ? " observation-card-dimmed" : ""}`}
      data-testid="obs-card"
      role="listitem"
      tabIndex={0}
      data-obs-type={primary.type}
      data-obs-id={primary.id}
      data-kind={primary.kind}
      data-severity={primary.severity}
      data-confidence={primary.confidence}
      data-grouped={others.length > 0 ? "true" : undefined}
      onMouseEnter={() => onHover(primary.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(primary.id)}
      onBlur={() => onHover(null)}
      onClick={(e) => {
        // Click-to-locate (C2): scroll to (and pulse) the span. Clicks on the
        // dismiss X or the "N more" toggle keep their own behaviour.
        if ((e.target as HTMLElement).closest("button")) return;
        window.dispatchEvent(new CustomEvent("obs-card-activate", { detail: { id: primary.id } }));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          window.dispatchEvent(
            new CustomEvent("obs-card-activate", { detail: { id: primary.id } })
          );
        }
      }}
    >
      <div className="card-header">
        <div className="card-header-left">
          <span className={`tag tag-${primary.type}`}>{primary.type.replace(/_/g, " ")}</span>
          <span
            className={`impact-label impact-kind-${primary.kind} impact-sev-${primary.severity}`}
            data-testid="impact-badge"
          >
            {primary.severity === "high" ? "HIGH" : primary.severity === "medium" ? "MED" : "LOW"}
            <span className="impact-popover" role="tooltip">
              {primary.severity === "high"
                ? "High"
                : primary.severity === "medium"
                  ? "Medium"
                  : "Low"}{" "}
              severity
              <br />
              {primary.confidence === "high"
                ? "High"
                : primary.confidence === "medium"
                  ? "Medium"
                  : "Low"}{" "}
              confidence
            </span>
          </span>
          {isArriving && <span className="obs-new-badge">new</span>}
        </div>
        <button
          className="dismiss-btn"
          data-testid="obs-dismiss"
          data-obs-id={primary.id}
          onClick={handleDismiss}
          title="Dismiss Observation"
          aria-label="Dismiss Observation"
        >
          <DismissIcon />
        </button>
      </div>
      {primary.anchorText && (
        <p className="card-anchor" data-testid="obs-anchor" title={primary.anchorText}>
          “{primary.anchorText}”
        </p>
      )}
      <div className="card-body">
        <p>{primary.text}</p>
      </div>
      {others.length > 0 && (
        <div className="card-also" data-testid="obs-group-also">
          <button
            className="card-also-toggle"
            onClick={() => setExpanded(!expanded)}
            data-testid="obs-group-toggle"
          >
            <span>{expanded ? "▾" : "▸"}</span> {others.length} more on this passage
          </button>
          {expanded &&
            others.map((o) => (
              <div key={o.id} className="card-also-item" data-testid="obs-group-item">
                <span className={`tag tag-${o.type}`}>{o.type.replace(/_/g, " ")}</span>
                <p className="card-also-item-text">{o.text}</p>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DismissedPlaceholder (C3) — the temporary "ghost slot" that replaces a card
// the moment it's dismissed, in place, so the Undo affordance sits exactly
// where the card was (no mouse trek, no lost mental link). Each dismissal gets
// its own placeholder. Undo restores the card; left alone it fades after ~3s,
// at which point the dismissal is finalized. See docs/mechanics/dismiss_undo.md.
// ---------------------------------------------------------------------------

function DismissedPlaceholder({ fading, onUndo }: { fading: boolean; onUndo: () => void }) {
  return (
    <div
      className={`observation-card-dismissed${fading ? " observation-card-exiting" : ""}`}
      data-testid="undo-placeholder"
      role="status"
      aria-live="polite"
    >
      <span className="observation-card-dismissed__label">Dismissed</span>
      <button
        type="button"
        className="observation-card-dismissed__undo"
        data-testid="undo-action"
        onClick={onUndo}
      >
        Undo
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SidecarFeed — the floating card column (observations + archive). The document
// context affordance moved to DocumentContext (attached to the writing column).
// The control center, settings/clear modals, and debug panel live in
// ControlCenter (always visible, independent of feed collapse).
// ---------------------------------------------------------------------------

interface Props {
  observations: Observation[];
  archivedObservations?: Observation[];
  /** Ordered blockIds from the editor (top → bottom), for document-order display. */
  blockOrder?: string[];
  hoveredObservationId: string | null;
  /** Reverse-hover spotlight target (UX-006): the primary id of the group whose
   *  span is being dwelled on. When set, that card rises to the top and stays
   *  opaque while the rest recede. Null when no span is focused. */
  spanFocusObsId?: string | null;
  onHoverObservation: (id: string | null) => void;
  /** Finalize a dismissal: write the suppression + flip the observation to
   *  `dismissed`. Called only when a dismiss placeholder fades (~3s) — Undo
   *  before then cancels locally and never calls this, so no rollback is
   *  needed. See docs/mechanics/dismiss_undo.md. */
  onDismissObservation: (id: string) => void | Promise<unknown>;
  /** Whether an API key is set. Keyless, the evaluator does nothing on the
   *  user's own text, so the standing keyless banner replaces the quiet empty
   *  state (which is reserved for the keyed "working, quietly" state). */
  hasKey?: boolean;
  /** Whether the recorded "See it in action" example is currently loaded — tunes
   *  the keyless banner copy (demo vs. general keyless). */
  demoActive?: boolean;
}

export function SidecarFeed({
  observations,
  archivedObservations = [],
  blockOrder = [],
  hoveredObservationId,
  spanFocusObsId = null,
  onHoverObservation,
  onDismissObservation,
  hasKey = false,
  demoActive = false,
}: Props) {
  const [showArchive, setShowArchive] = useState(false);
  const [showAlsoNoticed, setShowAlsoNoticed] = useState(false);

  // --- Batched arrival animation ---
  const prevObsIdsRef = useRef<Set<string>>(new Set(observations.map((o) => o.id)));
  const [arrivingIds, setArrivingIds] = useState<Set<string>>(new Set());
  const [arrivalBatchCount, setArrivalBatchCount] = useState(0);

  // --- C3 dismiss + in-place Undo placeholder ---
  // Dismissing a card replaces it *in place* with a temporary "Dismissed · Undo"
  // ghost slot, so the Undo affordance sits exactly where the card was and each
  // dismissal gets its own placeholder. The dismissal is deferred: the
  // observation stays live until the placeholder fades (~3s), at which point it's
  // finalized (onDismissObservation writes the suppression). Undo before then is a
  // pure local cancel — nothing was written, nothing to roll back (which
  // *strengthens* the G1 guarantee). Keyed by span coordinates (stable even if a
  // re-eval swaps the group's primary), mirroring obsAggregation's grouping key.
  // See docs/mechanics/dismiss_undo.md.
  const PENDING_MS = 3000;
  const FADE_MS = 200;
  const [pendingDismiss, setPendingDismiss] = useState<
    Map<string, { ids: string[]; fading: boolean }>
  >(new Map());
  const pendingTimers = useRef<Map<string, { finalize?: number; fade?: number }>>(new Map());
  const clearPendingTimers = useCallback((key: string) => {
    const t = pendingTimers.current.get(key);
    if (t?.finalize) clearTimeout(t.finalize);
    if (t?.fade) clearTimeout(t.fade);
    pendingTimers.current.delete(key);
  }, []);
  const handleUndoPending = useCallback(
    (key: string) => {
      clearPendingTimers(key);
      setPendingDismiss((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    },
    [clearPendingTimers]
  );
  // Clear every pending timer on unmount.
  useEffect(() => {
    const timers = pendingTimers.current;
    return () => {
      for (const t of timers.values()) {
        if (t.finalize) clearTimeout(t.finalize);
        if (t.fade) clearTimeout(t.fade);
      }
      timers.clear();
    };
  }, []);

  useEffect(() => {
    const currentIds = new Set(observations.map((o) => o.id));
    const newIds = [...currentIds].filter((id) => !prevObsIdsRef.current.has(id));
    prevObsIdsRef.current = currentIds;
    if (newIds.length === 0) return;
    setArrivingIds((prev) => new Set([...prev, ...newIds]));
    setArrivalBatchCount(newIds.length);
  }, [observations]);

  useEffect(() => {
    if (arrivingIds.size === 0) return;
    const timer = setTimeout(() => {
      setArrivingIds(new Set());
      setArrivalBatchCount(0);
    }, 2000);
    return () => clearTimeout(timer);
  }, [arrivingIds]);

  // Dismiss a whole group as one unit: replace its card in place with a
  // "Dismissed · Undo" placeholder. The dismissal is deferred — after ~3s the
  // placeholder fades (FADE_MS) and only then is each member finalized. Undo
  // (handleUndoPending) cancels before finalize and never writes anything.
  const handleDismiss = useCallback(
    (group: GroupedObservation) => {
      const key = groupKey(group);
      if (pendingDismiss.has(key)) return;
      const ids = [group.primary.id, ...group.others.map((o) => o.id)];
      setPendingDismiss((prev) => new Map(prev).set(key, { ids, fading: false }));
      const finalize = window.setTimeout(() => {
        // Fade the placeholder out, then write the dismissals and clear the slot.
        setPendingDismiss((prev) => {
          const entry = prev.get(key);
          if (!entry) return prev;
          return new Map(prev).set(key, { ...entry, fading: true });
        });
        const fade = window.setTimeout(async () => {
          for (const id of ids) await onDismissObservation(id);
          clearPendingTimers(key);
          setPendingDismiss((prev) => {
            if (!prev.has(key)) return prev;
            const next = new Map(prev);
            next.delete(key);
            return next;
          });
        }, FADE_MS);
        pendingTimers.current.set(key, { ...pendingTimers.current.get(key), fade });
      }, PENDING_MS);
      pendingTimers.current.set(key, { finalize });
    },
    [pendingDismiss, onDismissObservation, clearPendingTimers]
  );

  // Partition observations: budget-select by priority, display in document order.
  const { visible: visibleObs, alsoNoticed: alsoNoticedObs } = partitionFeed(observations, {
    budget: DEFAULT_FEED_BUDGET,
    blockOrder,
  });
  const overflowContradictionCount = alsoNoticedObs.filter((g) => g.hasContradiction).length;

  // Reverse-hover focus (UX-006): when a span is focused, dim every card in
  // place (no reorder) — the focused card(s) are surfaced by the floating SpanPeek
  // pinned to the top of the gutter, so they're always on-screen even if the feed
  // is scrolled. For co-located spans (C9) the whole covering set stacks in that
  // float, so the feed stays uniformly dimmed here (no loose un-dimmed cards that
  // would collide with the float). Releasing the span restores full opacity.
  const feedFocused = spanFocusObsId != null;

  // Render a group's slot: while a dismissal is pending, the in-place
  // "Dismissed · Undo" placeholder stands where the card was; otherwise the card.
  const renderGroup = (group: GroupedObservation) => {
    const key = groupKey(group);
    const pending = pendingDismiss.get(key);
    if (pending) {
      return (
        <DismissedPlaceholder
          key={group.id}
          fading={pending.fading}
          onUndo={() => handleUndoPending(key)}
        />
      );
    }
    return (
      <GroupedObsCard
        key={group.id}
        group={group}
        isActive={hoveredObservationId === group.primary.id}
        isDimmed={feedFocused}
        isArriving={
          arrivingIds.has(group.primary.id) || group.others.some((o) => arrivingIds.has(o.id))
        }
        onHover={onHoverObservation}
        onDismiss={handleDismiss}
      />
    );
  };

  return (
    <aside className="sidecar-panel" aria-label="Observations">
      <div className="feed-container">
        <div style={{ flex: 1 }}>
          {/* Standing keyless banner: shown in any keyless state (during the demo
              and when a keyless user just writes), so quiet-by-design never masks
              the key requirement. */}
          {!hasKey && <KeylessBanner demoActive={demoActive} />}
          {observations.length === 0 ? (
            // The quiet empty state is reserved for the KEYED "working, quietly"
            // state. Keyless, the banner above carries the honest message instead
            // — the calm empty copy must never stand in for silent-nothing.
            hasKey ? (
              <div className="sidecar-empty">
                <p>Quiet while you draft — I'll speak up as you revise.</p>
                <span className="empty-subtext">
                  Observations appear here as the document matures.
                </span>
              </div>
            ) : null
          ) : (
            <div className="observations-list" role="list">
              {arrivalBatchCount >= 3 && (
                <div data-testid="arrival-indicator" className="arrival-indicator">
                  +{arrivalBatchCount} new
                </div>
              )}
              {visibleObs.map(renderGroup)}

              {alsoNoticedObs.length > 0 && (
                <div data-testid="also-noticed-drawer" className="also-noticed-drawer">
                  <button
                    data-testid="also-noticed-toggle"
                    className="drawer-toggle"
                    aria-expanded={showAlsoNoticed}
                    aria-controls="also-noticed-list"
                    onClick={() => setShowAlsoNoticed(!showAlsoNoticed)}
                  >
                    <span>{showAlsoNoticed ? "▾" : "▸"}</span>
                    <span>
                      Also noticed ({alsoNoticedObs.length}{" "}
                      {alsoNoticedObs.length === 1 ? "issue" : "issues"})
                    </span>
                  </button>
                  {overflowContradictionCount > 0 && (
                    <div className="drawer-contra-note">
                      {overflowContradictionCount} more{" "}
                      {overflowContradictionCount === 1 ? "contradiction" : "contradictions"}
                    </div>
                  )}
                  {showAlsoNoticed && (
                    <div
                      id="also-noticed-list"
                      style={{ display: "flex", flexDirection: "column", gap: "8px" }}
                    >
                      {alsoNoticedObs.map(renderGroup)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {archivedObservations.length > 0 && (
          <div data-testid="archive-section" className="archive-section">
            <button
              data-testid="archive-toggle"
              className="drawer-toggle"
              aria-expanded={showArchive}
              aria-controls="archive-list"
              onClick={() => setShowArchive(!showArchive)}
            >
              <span>{showArchive ? "▾" : "▸"}</span>
              <span>Archive ({archivedObservations.length})</span>
            </button>
            {showArchive && (
              <div id="archive-list" data-testid="archive-list" className="archive-list">
                {archivedObservations.map((obs) => {
                  const reasonText =
                    obs.closureReason === "resolved_by_edit"
                      ? "resolved by edit"
                      : obs.closureReason === "text_removed"
                        ? "text removed"
                        : obs.closureReason === "superseded"
                          ? "superseded"
                          : obs.closureReason === "dismissed"
                            ? "dismissed"
                            : obs.closureReason === "resolved_prior"
                              ? "resolved"
                              : obs.status.replace(/_/g, " ");
                  return (
                    <div
                      key={obs.id}
                      data-testid="archive-card"
                      className="archive-card"
                      data-obs-status={obs.status}
                      data-obs-type={obs.type}
                    >
                      <div className="archive-card-head">
                        <span className={`tag tag-${obs.type}`}>{obs.type.replace(/_/g, " ")}</span>
                        <span data-testid="archive-reason" className="archive-reason">
                          {reasonText}
                        </span>
                      </div>
                      <p className="archive-card-text">{obs.text}</p>
                      {obs.anchorText && (
                        <div data-testid="archive-anchor" className="archive-anchor">
                          “{obs.anchorText}”
                          {obs.conflictingAnchorText && (
                            <>
                              <br />
                              <span className="archive-anchor-vs">
                                vs. “{obs.conflictingAnchorText}”
                              </span>
                            </>
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
    </aside>
  );
}
