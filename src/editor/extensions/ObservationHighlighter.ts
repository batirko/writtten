import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { Observation } from "../../store/db";

/**
 * Map a character offset in a block's flat textContent to the correct absolute
 * ProseMirror position, accounting for node boundaries (e.g. list items) that
 * textContent silently skips. Without this, highlights on the 2nd+ item of a
 * bullet list drift backwards by the accumulated boundary tokens.
 *
 * @param isEnd - true when mapping an exclusive-end offset (use <= so the end
 *   of a text node maps to the position after its last char, not the start of
 *   the next node). False for start offsets (use < so the exact start of a
 *   text node maps to that node, not the end of the previous one).
 */
export function charOffsetToPmPos(
  blockNode: PMNode,
  blockPos: number,
  charOffset: number,
  isEnd: boolean
): number {
  let charCount = 0;
  let found = -1;

  blockNode.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.isText && node.text != null) {
      const len = node.text.length;
      const matches = isEnd
        ? charOffset >= charCount && charOffset <= charCount + len
        : charOffset >= charCount && charOffset < charCount + len;
      if (matches) {
        found = blockPos + 1 + pos + (charOffset - charCount);
        return false;
      }
      charCount += len;
    }
  });

  // Fallback: treat as flat offset (works for simple paragraphs; also handles
  // the degenerate case where charOffset == total textContent length with isEnd=false)
  return found >= 0 ? found : blockPos + 1 + charOffset;
}

/**
 * Re-derive a span's character offsets from its `anchorText` against the block's
 * *current* flat text, falling back to the stored offsets. This is what makes a
 * highlight stay on the right words after the user edits earlier in the block:
 * `refreshObservations` rebuilds every decoration from offsets captured at eval
 * time, so without this they redraw at stale positions until the next keystroke
 * triggers ProseMirror's position mapping. See lifecycle_integrity L5.
 *
 * Rules:
 *  - Empty/whitespace `anchorText` (pre-v8 records) → stored offsets (can't
 *    verify without a captured span).
 *  - Otherwise locate `anchorText` in `blockText`: one match → that occurrence;
 *    multiple → the occurrence whose start is nearest the stored start (the user
 *    most likely edited near, not at, the anchor).
 *  - No match: the anchor text was edited away. What to do splits on whether the
 *    stored offsets are a real span or the whole-block sentinel:
 *      • **whole-block sentinel** (`storedStart === 0 && storedEnd >= 9999`, used
 *        by the ledger sweep / contradiction conflicting-side, whose claims carry
 *        text but no offsets): the "anchor" is the model's *reworded* claim, which
 *        legitimately need not be a verbatim substring — return `{0, 9999}` so the
 *        caller clamps to the block length (whole-block, as before).
 *      • **real exact anchor** (any other offsets): the verbatim span the model
 *        quoted no longer exists in the block, so its stored offsets now point at
 *        *unrelated* current text (block ids are stable across edits, offsets are
 *        not). Return `null` to **suppress** the range rather than paint the wrong
 *        words — which would disagree with the card's own quote (`anchorQuote ??
 *        anchorText`). The obs auto-closes on the next eval / ledger refresh; until
 *        then it simply carries no highlight. Fixes the stale-anchor mismatch where
 *        a cross-claim sweep obs lit a same-length clause at the old offsets.
 * Matching tries exact (case-sensitive) first, since `anchorText` was usually
 * captured from the same flattened block text and exact positions are cheapest
 * to trust. It then falls back to a case-insensitive pass: cross-claim
 * observations (contradiction/strategic_tension) carry `anchorText` set to the
 * model's *normalized* claim text, which commonly capitalizes a clause that
 * reads lowercase mid-sentence in the source (e.g. source "...it stays quiet..."
 * vs claim "It stays quiet..."). Without the fallback, that case difference
 * alone makes a correctly-anchored span look "vanished" on every render (not
 * just after an edit) and the highlight is wrongly suppressed. Mirrors
 * `anchorSubstring`'s extraction-time fallback so the two agree.
 */
export function reanchorOffset(
  blockText: string,
  anchorText: string,
  storedStart: number,
  storedEnd: number
): { start: number; end: number } | null {
  const anchor = anchorText.trim();
  if (anchor === "") return { start: storedStart, end: storedEnd };

  const findBest = (haystack: string, needle: string) => {
    let bestIdx = -1;
    let idx = haystack.indexOf(needle);
    while (idx !== -1) {
      if (bestIdx === -1 || Math.abs(idx - storedStart) < Math.abs(bestIdx - storedStart)) {
        bestIdx = idx;
      }
      idx = haystack.indexOf(needle, idx + 1);
    }
    return bestIdx;
  };

  let bestIdx = findBest(blockText, anchorText);
  if (bestIdx === -1) {
    bestIdx = findBest(blockText.toLowerCase(), anchorText.toLowerCase());
  }
  if (bestIdx === -1) {
    // Whole-block sentinel → reworded claim, keep whole-block. Real exact anchor
    // whose text vanished → suppress (don't paint stale offsets over other words).
    const isWholeBlockSentinel = storedStart === 0 && storedEnd >= 9999;
    return isWholeBlockSentinel ? { start: storedStart, end: storedEnd } : null;
  }
  return { start: bestIdx, end: bestIdx + anchorText.length };
}

/** One resolved highlight range for an observation. `side` distinguishes the
 *  primary span from a cross-claim's conflicting span. */
export interface ObservationRange {
  obs: Observation;
  from: number;
  to: number;
  side: "primary" | "conflicting";
}

/**
 * Resolve every active span observation to its absolute ProseMirror range(s),
 * using the *exact same* offset→position mapping the decoration builder uses
 * (`reanchorOffset` + `charOffsetToPmPos` + clamping) so reverse-hover
 * hit-testing (Editor.tsx, C9) and rendering can never disagree. Cross-claim
 * observations yield two entries (primary + conflicting), except the degenerate
 * same-block conflict (OBS-026), which yields only the primary — mirroring the
 * `conflictingBlockId !== blockId` guard in the builder below.
 *
 * Unlike rendering, this includes *downgraded* (invisible-anchor) observations:
 * they carry a resolvable range even with no visible mark, which is what lets a
 * nested/co-located substring be *targeted* by the pointer (C9). Callers gate on
 * visibility themselves (surfaced-only reverse-hover cue).
 */
export function computeObservationRanges(
  doc: PMNode,
  observations: Observation[]
): ObservationRange[] {
  const blockPositions = new Map<string, number>();
  doc.descendants((node, pos) => {
    if (doc.resolve(pos).depth === 0 && node.isBlock && node.attrs.blockId) {
      blockPositions.set(node.attrs.blockId, pos);
    }
  });

  const ranges: ObservationRange[] = [];
  for (const obs of observations) {
    if (!(obs.scope === "span" && obs.blockId && obs.status === "active")) continue;
    const blockPos = blockPositions.get(obs.blockId);
    if (blockPos === undefined) continue;
    const blockNode = doc.nodeAt(blockPos);
    if (!blockNode) continue;
    const textLength = blockNode.textContent.length;
    const re = reanchorOffset(
      blockNode.textContent,
      obs.anchorText ?? "",
      obs.startOffset ?? 0,
      obs.endOffset ?? textLength
    );
    // null → the exact anchor text was edited away; suppress this side rather
    // than resolve a range at stale offsets.
    if (re) {
      const rawStart = Math.max(0, Math.min(re.start, textLength));
      const rawEnd = Math.max(0, Math.min(re.end, textLength));
      const from = charOffsetToPmPos(blockNode, blockPos, rawStart, false);
      const to = charOffsetToPmPos(blockNode, blockPos, rawEnd, true);
      if (from < to) ranges.push({ obs, from, to, side: "primary" });
    }

    if (obs.conflictingBlockId && obs.conflictingBlockId !== obs.blockId) {
      const conflictPos = blockPositions.get(obs.conflictingBlockId);
      if (conflictPos === undefined) continue;
      const conflictNode = doc.nodeAt(conflictPos);
      if (!conflictNode) continue;
      const cLen = conflictNode.textContent.length;
      const cRe = reanchorOffset(
        conflictNode.textContent,
        obs.conflictingAnchorText ?? "",
        obs.conflictingStartOffset ?? 0,
        obs.conflictingEndOffset ?? cLen
      );
      if (cRe) {
        const cRawStart = Math.max(0, Math.min(cRe.start, cLen));
        const cRawEnd = Math.max(0, Math.min(cRe.end, cLen));
        const cFrom = charOffsetToPmPos(conflictNode, conflictPos, cRawStart, false);
        const cTo = charOffsetToPmPos(conflictNode, conflictPos, cRawEnd, true);
        if (cFrom < cTo) ranges.push({ obs, from: cFrom, to: cTo, side: "conflicting" });
      }
    }
  }
  return ranges;
}

/**
 * C9 primary-selection: given the resolved ranges and a document position, pick
 * the covering set. Returns null unless the point is covered by at least one
 * *visible* (surfaced) highlight — so a downgraded invisible anchor over plain
 * text stays inert, but a downgraded substring nested inside a visible span is
 * still targetable. `primaryId` is the smallest covering range (innermost /
 * substring wins); `related` is the deduped set (primary first). `surfacedIds`
 * null/undefined means "treat all as visible" (no budget in effect).
 */
export function resolveCoveringSet(
  ranges: ObservationRange[],
  pos: number,
  surfacedIds: Set<string> | null | undefined
): { primaryId: string; related: string[] } | null {
  const covering = ranges.filter((r) => pos >= r.from && pos <= r.to);
  if (covering.length === 0) return null;
  const hasVisible = covering.some((r) => surfacedIds == null || surfacedIds.has(r.obs.id));
  if (!hasVisible) return null;
  let best = covering[0];
  for (const r of covering) {
    if (r.to - r.from < best.to - best.from) best = r;
  }
  const related: string[] = [];
  for (const r of [best, ...covering]) {
    if (!related.includes(r.obs.id)) related.push(r.obs.id);
  }
  return { primaryId: best.obs.id, related };
}

const pluginKey = new PluginKey("observationHighlighter");

interface ObservationHighlighterOptions {
  onObservationCollapsed?: (id: string) => void;
}

export const ObservationHighlighter = Extension.create<ObservationHighlighterOptions>({
  name: "observationHighlighter",

  addOptions() {
    return {
      onObservationCollapsed: undefined,
    };
  },

  addProseMirrorPlugins() {
    const { options } = this;

    return [
      new Plugin({
        key: pluginKey,
        state: {
          init() {
            return {
              decorations: DecorationSet.empty,
              observations: [] as Observation[],
              hoveredId: null as string | null,
              // One-shot activation pulse (UX-009 / C2): the id of the observation
              // whose span(s) should flash. Cleared on a timer by the editor.
              pulseId: null as string | null,
              // Ids of observations that are *surfaced* in the feed budget. Only
              // these get a visible highlight; downgraded ("also noticed") ones
              // render an invisible anchor (present for delete-detection, but no
              // mark and not reverse-hoverable). `null` = highlight everything
              // (before the feed reports a set). See UX-006/R7b.
              surfacedIds: null as Set<string> | null,
            };
          },
          apply(tr, value, _oldState, newState) {
            // 1. Map existing decorations through the transaction
            let decorations = value.decorations.map(tr.mapping, tr.doc);

            // 2. Check if observations or hover status were updated via metadata
            const newObservations = tr.getMeta("setObservations") as Observation[] | undefined;
            const newHoveredId = tr.getMeta("setHoveredObservationId") as string | null | undefined;
            const newPulseId = tr.getMeta("setPulseObsId") as string | null | undefined;
            const newSurfacedIds = tr.getMeta("setSurfacedIds") as Set<string> | undefined;

            const observations =
              newObservations !== undefined ? newObservations : value.observations;
            const hoveredId = newHoveredId !== undefined ? newHoveredId : value.hoveredId;
            const pulseId = newPulseId !== undefined ? newPulseId : value.pulseId;
            const surfacedIds =
              newSurfacedIds !== undefined ? newSurfacedIds : value.surfacedIds;

            // Rebuild decorations only when the observation set or hovered id changes.
            // For all other doc edits (typing, insertions), the `map()` call above
            // correctly position-maps existing decorations through ProseMirror's
            // transaction mapping — no rebuild needed and no stored-offset drift.
            if (
              newObservations !== undefined ||
              newHoveredId !== undefined ||
              newPulseId !== undefined ||
              newSurfacedIds !== undefined
            ) {
              const decos: Decoration[] = [];
              const doc = newState.doc;

              // Find absolute positions of all top-level blocks by their blockId attributes
              const blockPositions = new Map<string, number>();
              doc.descendants((node, pos) => {
                if (doc.resolve(pos).depth === 0 && node.isBlock && node.attrs.blockId) {
                  blockPositions.set(node.attrs.blockId, pos);
                }
              });

              for (const obs of observations) {
                if (obs.scope === "span" && obs.blockId && obs.status === "active") {
                  const blockPos = blockPositions.get(obs.blockId);
                  if (blockPos !== undefined) {
                    const blockNode = doc.nodeAt(blockPos);
                    if (blockNode) {
                      const textLength = blockNode.textContent.length;
                      // L5: re-derive offsets from anchorText against current
                      // text so a refresh-driven rebuild doesn't redraw the
                      // highlight at stale offsets.
                      const re = reanchorOffset(
                        blockNode.textContent,
                        obs.anchorText ?? "",
                        obs.startOffset ?? 0,
                        obs.endOffset ?? textLength
                      );
                      // null → exact anchor edited away; skip drawing (a stale
                      // range would paint unrelated words and contradict the card).
                      const rawStart = re ? Math.max(0, Math.min(re.start, textLength)) : 0;
                      const rawEnd = re ? Math.max(0, Math.min(re.end, textLength)) : 0;
                      const start = re ? charOffsetToPmPos(blockNode, blockPos, rawStart, false) : 0;
                      const end = re ? charOffsetToPmPos(blockNode, blockPos, rawEnd, true) : 0;

                      // Both contradiction and strategic_tension span two blocks
                      // via conflictingBlockId — hovering either side, or the
                      // card, lights up both.
                      const isCrossClaim = !!obs.conflictingBlockId;
                      const isHovered =
                        hoveredId === obs.id ||
                        (isCrossClaim &&
                          (obs.blockId === hoveredId || obs.conflictingBlockId === hoveredId));
                      const isPulsing = pulseId === obs.id;
                      // Surfaced → persistent visible highlight; downgraded →
                      // invisible anchor (no `obs-highlight` class, so no mark)
                      // that still carries the obs id so delete-detection works.
                      // A downgraded ("also noticed") obs gets the visible mark
                      // *transiently* for the moment it's the hovered or activated
                      // (pulsing) one, so hover/click on its card can locate its
                      // span — it reverts when the interaction ends. The persistent
                      // surfaced budget is unchanged, and no at-rest reverse-hover
                      // path is introduced (the mark only exists while hovered), so
                      // the surfaced-only reverse-hover invariant (R7b/UX-006) holds.
                      // Composes with — does not pre-empt — the C7 density decision.
                      const surfaced = surfacedIds === null || surfacedIds.has(obs.id);
                      const showMark = surfaced || isHovered || isPulsing;
                      const cls = (hovered: boolean) =>
                        `obs-highlight obs-highlight-${obs.type}${hovered ? " obs-highlight-hovered" : ""}${isPulsing ? " obs-highlight-pulse" : ""}`;
                      const inlineDeco = (from: number, to: number) =>
                        Decoration.inline(
                          from,
                          to,
                          showMark ? { class: cls(isHovered), "data-obs-id": obs.id } : {},
                          // The collapse detector (view().update below) reads the
                          // obs id off `spec`, not `attrs`. Without this 4th arg
                          // `spec` defaults to {} and auto-close-on-deletion never
                          // fires. See lifecycle_integrity L2.
                          { "data-obs-id": obs.id }
                        );

                      if (start < end) {
                        decos.push(inlineDeco(start, end));
                      }

                      // For cross-claim observations (contradiction,
                      // strategic_tension), also highlight the conflicting
                      // block's span so hovering the card lights up both sides.
                      if (obs.conflictingBlockId && obs.conflictingBlockId !== obs.blockId) {
                        const conflictPos = blockPositions.get(obs.conflictingBlockId);
                        if (conflictPos !== undefined) {
                          const conflictNode = doc.nodeAt(conflictPos);
                          if (conflictNode) {
                            const cTextLength = conflictNode.textContent.length;
                            // L5: re-anchor the conflicting side too. In practice
                            // the conflicting offsets are the 0:9999 whole-block
                            // sentinel, which reanchorOffset passes through.
                            const cRe = reanchorOffset(
                              conflictNode.textContent,
                              obs.conflictingAnchorText ?? "",
                              obs.conflictingStartOffset ?? 0,
                              obs.conflictingEndOffset ?? cTextLength
                            );
                            // null → conflicting exact anchor edited away; skip it.
                            if (cRe) {
                              const cRawStart = Math.max(0, Math.min(cRe.start, cTextLength));
                              const cRawEnd = Math.max(0, Math.min(cRe.end, cTextLength));
                              const cStart = charOffsetToPmPos(
                                conflictNode,
                                conflictPos,
                                cRawStart,
                                false
                              );
                              const cEnd = charOffsetToPmPos(
                                conflictNode,
                                conflictPos,
                                cRawEnd,
                                true
                              );
                              if (cStart < cEnd) {
                                decos.push(inlineDeco(cStart, cEnd));
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }

              decorations = DecorationSet.create(doc, decos);
            }

            return {
              decorations,
              observations,
              hoveredId,
              pulseId,
              surfacedIds,
            };
          },
        },
        props: {
          decorations(state) {
            return this.getState(state)?.decorations || DecorationSet.empty;
          },
        },
        view() {
          return {
            update(view, prevState) {
              const state = pluginKey.getState(view.state);
              const prevPluginState = pluginKey.getState(prevState);
              if (!state || !prevPluginState) return;

              // Check if any active decorations collapsed to 0 length (or disappeared), meaning they were deleted
              if (
                options.onObservationCollapsed &&
                state.decorations !== prevPluginState.decorations
              ) {
                const currentDecos = state.decorations.find();

                for (const obs of state.observations) {
                  if (obs.scope === "span" && obs.status === "active") {
                    // Check if a decoration matching this observation ID exists and has non-zero length
                    const hasDeco = currentDecos.some(
                      (d: Decoration) =>
                        d.spec &&
                        (d.spec as Record<string, unknown>)["data-obs-id"] === obs.id &&
                        d.from < d.to
                    );

                    if (!hasDeco) {
                      // If it existed before but doesn't exist now (or collapsed), notify collapse
                      const wasDecoBefore = prevPluginState.decorations
                        .find()
                        .some(
                          (d: Decoration) =>
                            d.spec && (d.spec as Record<string, unknown>)["data-obs-id"] === obs.id
                        );
                      if (wasDecoBefore) {
                        options.onObservationCollapsed(obs.id);
                      }
                    }
                  }
                }
              }
            },
          };
        },
      }),
    ];
  },
});
