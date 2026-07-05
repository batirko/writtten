import { useState, useEffect, useRef, useCallback } from "react";
import type { Observation } from "../store/db";
import { partitionFeed, DEFAULT_FEED_BUDGET } from "./feedBudget";
import type { GroupedObservation } from "./feedBudget";

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
// GroupedObsCard — renders a single group (one or more observations on the
// same span). Severity is carried by the type tag (feed_surface.md § Card
// execution), driven by the card's data-kind / data-severity / data-obs-type.
// ---------------------------------------------------------------------------

interface GroupedObsCardProps {
  group: GroupedObservation;
  isActive: boolean;
  isArriving: boolean;
  isExiting: boolean;
  onHover: (id: string | null) => void;
  onDismiss: (id: string) => void;
}

function GroupedObsCard({
  group,
  isActive,
  isArriving,
  isExiting,
  onHover,
  onDismiss,
}: GroupedObsCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { primary, others } = group;

  const handleDismiss = () => {
    onDismiss(primary.id);
    for (const o of others) onDismiss(o.id);
  };

  return (
    <div
      className={`observation-card observation-${primary.type}${isActive ? " observation-card-active" : ""}${isArriving ? " observation-card-arriving" : ""}${isExiting ? " observation-card-exiting" : ""}`}
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
      {primary.anchorText ? (
        <p className="card-anchor" data-testid="obs-anchor" title={primary.anchorText}>
          “{primary.anchorText}”
        </p>
      ) : (
        primary.scope === "document" && (
          <p className="card-anchor card-anchor-doc" data-testid="obs-anchor-doc">
            Whole document
          </p>
        )
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
  onHoverObservation: (id: string | null) => void;
  onDismissObservation: (id: string) => void;
}

export function SidecarFeed({
  observations,
  archivedObservations = [],
  blockOrder = [],
  hoveredObservationId,
  onHoverObservation,
  onDismissObservation,
}: Props) {
  const [showArchive, setShowArchive] = useState(false);
  const [showAlsoNoticed, setShowAlsoNoticed] = useState(false);

  // --- Batched arrival animation ---
  const prevObsIdsRef = useRef<Set<string>>(new Set(observations.map((o) => o.id)));
  const [arrivingIds, setArrivingIds] = useState<Set<string>>(new Set());
  const [arrivalBatchCount, setArrivalBatchCount] = useState(0);
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set());

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

  const handleDismiss = useCallback(
    (id: string) => {
      if (exitingIds.has(id)) return;
      setExitingIds((prev) => new Set([...prev, id]));
      setTimeout(() => {
        setExitingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        onDismissObservation(id);
      }, 200);
    },
    [exitingIds, onDismissObservation]
  );

  // Partition observations: budget-select by priority, display in document order.
  const { visible: visibleObs, alsoNoticed: alsoNoticedObs } = partitionFeed(observations, {
    budget: DEFAULT_FEED_BUDGET,
    blockOrder,
  });
  const overflowContradictionCount = alsoNoticedObs.filter((g) => g.hasContradiction).length;

  return (
    <aside className="sidecar-panel" aria-label="Observations">
      <div className="feed-container">
        <div style={{ flex: 1 }}>
          {observations.length === 0 ? (
            <div className="sidecar-empty">
              <p>Quiet while you draft — I'll speak up as you revise.</p>
              <span className="empty-subtext">
                Observations appear here as the document matures.
              </span>
            </div>
          ) : (
            <div className="observations-list" role="list">
              {arrivalBatchCount >= 3 && (
                <div data-testid="arrival-indicator" className="arrival-indicator">
                  +{arrivalBatchCount} new
                </div>
              )}
              {visibleObs.map((group) => (
                <GroupedObsCard
                  key={group.id}
                  group={group}
                  isActive={hoveredObservationId === group.primary.id}
                  isArriving={
                    arrivingIds.has(group.primary.id) ||
                    group.others.some((o) => arrivingIds.has(o.id))
                  }
                  isExiting={
                    exitingIds.has(group.primary.id) ||
                    group.others.some((o) => exitingIds.has(o.id))
                  }
                  onHover={onHoverObservation}
                  onDismiss={handleDismiss}
                />
              ))}

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
                      {alsoNoticedObs.map((group) => (
                        <GroupedObsCard
                          key={group.id}
                          group={group}
                          isActive={hoveredObservationId === group.primary.id}
                          isArriving={
                            arrivingIds.has(group.primary.id) ||
                            group.others.some((o) => arrivingIds.has(o.id))
                          }
                          isExiting={
                            exitingIds.has(group.primary.id) ||
                            group.others.some((o) => exitingIds.has(o.id))
                          }
                          onHover={onHoverObservation}
                          onDismiss={handleDismiss}
                        />
                      ))}
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
