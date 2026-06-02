import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Observation } from "../../store/db";

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
                      const textStart = blockPos + 1;
                      const textLength = blockNode.textContent.length;

                      // Resolve start/end offsets, clamping to block text length
                      const start =
                        textStart + Math.max(0, Math.min(obs.startOffset || 0, textLength));
                      const end =
                        textStart + Math.max(0, Math.min(obs.endOffset || textLength, textLength));

                      const isHovered =
                        hoveredId === obs.id ||
                        (obs.type === "contradiction" &&
                          (obs.blockId === hoveredId || obs.conflictingBlockId === hoveredId));

                      if (start < end) {
                        decos.push(
                          Decoration.inline(start, end, {
                            class: `obs-highlight obs-highlight-${obs.type} ${isHovered ? "obs-highlight-hovered" : ""}`,
                            "data-obs-id": obs.id,
                          })
                        );
                      }

                      // For contradictions, also highlight the conflicting block's span
                      // so hovering the card lights up both sides simultaneously.
                      if (obs.type === "contradiction" && obs.conflictingBlockId) {
                        const conflictPos = blockPositions.get(obs.conflictingBlockId);
                        if (conflictPos !== undefined) {
                          const conflictNode = doc.nodeAt(conflictPos);
                          if (conflictNode) {
                            const cTextStart = conflictPos + 1;
                            const cTextLength = conflictNode.textContent.length;
                            const cStart =
                              cTextStart +
                              Math.max(
                                0,
                                Math.min(obs.conflictingStartOffset || 0, cTextLength),
                              );
                            const cEnd =
                              cTextStart +
                              Math.max(
                                0,
                                Math.min(obs.conflictingEndOffset || cTextLength, cTextLength),
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
