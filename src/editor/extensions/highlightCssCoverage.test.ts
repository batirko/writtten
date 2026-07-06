import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Regression guard for the "highlight only appears on card-hover" bug: every
 * span-anchored observation type must have an at-rest `.obs-highlight-<type>`
 * rule in styles.css. Without one, a *surfaced* observation of that type is
 * marked (so `showMark` is true) but renders invisibly — the base `.obs-highlight`
 * rule only sets radius/cursor — so the span appears only when the generic
 * `.obs-highlight-hovered` rule kicks in on interaction.
 *
 * This slipped once: the Phase-4 taxonomy grew (`unsupported_claim`,
 * `undefined_jargon`) but the CSS still only covered clarity/contradiction/
 * strategic_tension. Keep this list in sync with `addSpanObs` in
 * `src/services/evaluator.ts` (the doc-scoped types added via `addDocObs` don't
 * anchor to a span and are intentionally excluded).
 */
const SPAN_ANCHORED_TYPES = [
  "clarity",
  "contradiction",
  "strategic_tension",
  "unsupported_claim",
  "undefined_jargon",
] as const;

const css = readFileSync(
  fileURLToPath(new URL("../../styles.css", import.meta.url)),
  "utf8"
);

describe("span-highlight CSS coverage", () => {
  it.each(SPAN_ANCHORED_TYPES)("has an at-rest .obs-highlight-%s rule", (type) => {
    // A declaration block keyed on the class, carrying a background (the wash).
    const rule = new RegExp(`\\.obs-highlight-${type}\\s*\\{[^}]*background`, "m");
    expect(css).toMatch(rule);
  });
});
