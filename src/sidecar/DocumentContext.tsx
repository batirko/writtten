import { useState } from "react";

// ---------------------------------------------------------------------------
// DocumentContext — the Document Context / Stage affordance, attached to the
// document (a quiet metadata line at the top of the writing column) rather than
// the feed, so it stays reachable whether the feed is open or collapsed and
// reads as "describing the document", not "configuring the tool".
// (feed_surface.md § 4 — decided document-attached 2026-07-05.)
//
// Three states, derived from props:
//   suggested — stageSuggestion is set (inference produced a value, unaccepted)
//   set       — stage has a value
//   empty     — no stage, no suggestion
// Testids preserved from the former feed ContextChip.
// ---------------------------------------------------------------------------

interface DocumentContextProps {
  stage: string;
  onStageChange: (s: string) => void;
  stageSuggestion?: string | null;
  onAcceptStageSuggestion?: (s: string) => void;
  onDismissStageSuggestion?: () => void;
}

export function DocumentContext({
  stage,
  onStageChange,
  stageSuggestion,
  onAcceptStageSuggestion,
  onDismissStageSuggestion,
}: DocumentContextProps) {
  const [editing, setEditing] = useState(false);

  const chipState: "suggested" | "set" | "empty" = stageSuggestion
    ? "suggested"
    : stage
      ? "set"
      : "empty";

  const handleAcceptAndEdit = () => {
    if (stageSuggestion) onAcceptStageSuggestion?.(stageSuggestion);
    setEditing(true);
  };

  return (
    <div className="doc-context" data-testid="stage-chip" data-chip-state={chipState}>
      {chipState === "suggested" && !editing && (
        <div className="doc-context-suggested" data-testid="stage-suggestion">
          <span className="doc-context-label">
            Inferred context — <em>{stageSuggestion}</em>
          </span>
          <span className="doc-context-actions">
            <button
              className="doc-context-btn doc-context-btn-primary"
              data-testid="stage-suggestion-accept"
              onClick={() => onAcceptStageSuggestion?.(stageSuggestion!)}
            >
              Use this
            </button>
            <button className="doc-context-btn" data-testid="stage-chip-edit" onClick={handleAcceptAndEdit}>
              Edit
            </button>
            <button
              className="doc-context-dismiss"
              data-testid="stage-suggestion-dismiss"
              aria-label="Dismiss context suggestion"
              onClick={() => onDismissStageSuggestion?.()}
            >
              ×
            </button>
          </span>
        </div>
      )}

      {chipState === "set" && !editing && (
        <button
          className="doc-context-set"
          data-testid="stage-chip-edit"
          aria-label="Edit document context"
          title={stage}
          onClick={() => setEditing(true)}
        >
          <span className="doc-context-value">{stage}</span>
          <span className="doc-context-pencil" aria-hidden="true">
            ✎
          </span>
        </button>
      )}

      {chipState === "empty" && !editing && (
        <button className="doc-context-add" onClick={() => setEditing(true)}>
          + Add document context
        </button>
      )}

      {editing && (
        <div className="doc-context-edit">
          <textarea
            className="doc-context-textarea"
            rows={2}
            placeholder="e.g., PRD for the payments team; audience is engineers and designers."
            value={stage}
            onChange={(e) => onStageChange(e.target.value)}
            autoFocus
          />
          <button className="doc-context-btn doc-context-btn-primary" onClick={() => setEditing(false)}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}
