import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { OBSERVATION_TYPES } from "../../services/externalObservations";

/**
 * Regression guard for the "highlight only appears on card-hover" bug: every
 * observation type that can arrive anchored to a span must have an at-rest
 * `.obs-highlight-<type>` rule in styles.css. Without one, the decoration is
 * still drawn (so `showMark` is true) but renders invisibly — the base
 * `.obs-highlight` rule only sets radius/cursor — so the span appears only when
 * the generic `.obs-highlight-hovered` rule kicks in on interaction.
 *
 * **The list comes from the submission boundary, not from the evaluator.** This
 * guard shipped keyed on `addSpanObs`'s five types, with a comment excusing the
 * doc-scoped types because they "don't anchor to a span" — true of the built-in
 * evaluator, false of a connected agent, which may submit any admissible type
 * with `scope: "span"`. So it reported green while five of the ten types had no
 * at-rest rule at all (UX-049). `OBSERVATION_TYPES` is the authority on what may
 * arrive anchored; reading it here means a newly-admissible type fails CI until
 * it is styled.
 */
const SPAN_ANCHORED_TYPES = [...OBSERVATION_TYPES];

// Comments are stripped first: they sit between rules and carry commas of their
// own, so a selector list read straight off the file arrives with the preceding
// comment glued to its first entry.
const css = readFileSync(fileURLToPath(new URL("../../styles.css", import.meta.url)), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  ""
);

/** The declaration bodies of every rule whose selector list includes `selector`.
 *  Grouped selectors have to count: several types deliberately share one rule,
 *  and an exact-match regex would report them unstyled. */
function declarationsFor(selector: string): string {
  const bodies: string[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selectors = m[1].split(",").map((s) => s.trim());
    if (selectors.includes(selector)) bodies.push(m[2]);
  }
  return bodies.join("\n");
}

describe("span-highlight CSS coverage", () => {
  it.each(SPAN_ANCHORED_TYPES)("has an at-rest .obs-highlight-%s rule", (type) => {
    // "Paints something" rather than "carries a wash": the four document-gap
    // types are deliberately wash-free (UX-049) and mark the span with an
    // underline alone, so requiring a background would forbid the chosen design.
    expect(declarationsFor(`.obs-highlight-${type}`)).toMatch(/background|border-bottom/);
  });

  // The second half of the same bug: the generic `.obs-highlight-hovered` wash is
  // the *contradiction* hue, so any type without its own hovered rule lights up in
  // the alarm colour on interaction — including opportunity-kind ones.
  // `contradiction` is the one legitimate exception: the generic rule is already
  // its colour, which is why it never needed an override.
  it.each(SPAN_ANCHORED_TYPES.filter((t) => t !== "contradiction"))(
    "overrides the contradiction-hue hover fallback for %s",
    (type) => {
      const decls = declarationsFor(`.obs-highlight-${type}.obs-highlight-hovered`);
      expect(decls).toMatch(/background-color/);
    }
  );
});
