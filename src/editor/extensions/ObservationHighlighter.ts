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
            };
          },
          apply(tr, value, _oldState, newState) {
            // 1. Map existing decorations through the transaction
            let decorations = value.decorations.map(tr.mapping, tr.doc);

            // 2. Check if observations or hover status were updated via metadata
            const newObservations = tr.getMeta("setObservations") as Observation[] | undefined;
            const newHoveredId = tr.getMeta("setHoveredObservationId") as string | null | undefined;

            const observations =
              newObservations !== undefined ? newObservations : value.observations;
            const hoveredId = newHoveredId !== undefined ? newHoveredId : value.hoveredId;

            // Rebuild decorations only when the observation set or hovered id changes.
            // For all other doc edits (typing, insertions), the `map()` call above
            // correctly position-maps existing decorations through ProseMirror's
            // transaction mapping — no rebuild needed and no stored-offset drift.
            if (newObservations !== undefined || newHoveredId !== undefined) {
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
                      const rawStart = Math.max(0, Math.min(obs.startOffset ?? 0, textLength));
                      const rawEnd = Math.max(0, Math.min(obs.endOffset ?? textLength, textLength));
                      const start = charOffsetToPmPos(blockNode, blockPos, rawStart, false);
                      const end = charOffsetToPmPos(blockNode, blockPos, rawEnd, true);

                      // Both contradiction and strategic_tension span two blocks
                      // via conflictingBlockId — hovering either side, or the
                      // card, lights up both.
                      const isCrossClaim = !!obs.conflictingBlockId;
                      const isHovered =
                        hoveredId === obs.id ||
                        (isCrossClaim &&
                          (obs.blockId === hoveredId || obs.conflictingBlockId === hoveredId));

                      if (start < end) {
                        decos.push(
                          Decoration.inline(start, end, {
                            class: `obs-highlight obs-highlight-${obs.type} ${isHovered ? "obs-highlight-hovered" : ""}`,
                            "data-obs-id": obs.id,
                          })
                        );
                      }

                      // For cross-claim observations (contradiction,
                      // strategic_tension), also highlight the conflicting
                      // block's span so hovering the card lights up both sides.
                      if (obs.conflictingBlockId) {
                        const conflictPos = blockPositions.get(obs.conflictingBlockId);
                        if (conflictPos !== undefined) {
                          const conflictNode = doc.nodeAt(conflictPos);
                          if (conflictNode) {
                            const cTextLength = conflictNode.textContent.length;
                            const cRawStart = Math.max(
                              0,
                              Math.min(obs.conflictingStartOffset ?? 0, cTextLength)
                            );
                            const cRawEnd = Math.max(
                              0,
                              Math.min(obs.conflictingEndOffset ?? cTextLength, cTextLength)
                            );
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
                              decos.push(
                                Decoration.inline(cStart, cEnd, {
                                  class: `obs-highlight obs-highlight-${obs.type} ${isHovered ? "obs-highlight-hovered" : ""}`,
                                  "data-obs-id": obs.id,
                                })
                              );
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
