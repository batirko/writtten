/** @vitest-environment node */
/**
 * The panel's capability claims, checked against the things that make them true.
 *
 * `agentSkillExamples.test.ts` is the pattern: the skill teaches an agent how to phrase an
 * observation, so its examples are run through the real lint rather than reviewed by eye.
 * The same argument applies one level up. The connected panel now tells the user what they
 * may ask a connected agent for — and every one of those asks is honoured by the *agent*,
 * on instructions that live in `docs/skills/writtten-agent.md`. Advertised capability whose
 * agent-facing half quietly disappeared is worse than none: the user asks and simply
 * doesn't get it, with nothing on either side reporting a fault.
 *
 * So the two halves are pinned to each other here. They were built in one pass for exactly
 * this reason (UX-043 + the curation milestone's piece 1) — separately, the two
 * descriptions drift.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AGENT_CAPABILITY_ASKS } from "./agentCapabilities";
import { AGENT_ONLY_TYPES } from "../services/externalObservations";

const skill = readFileSync(
  fileURLToPath(new URL("../../docs/skills/writtten-agent.md", import.meta.url)),
  "utf8"
);

/** The body of a `##`/`###` section, exclusive of the next heading at any level. */
function sectionBody(heading: string): string | null {
  const start = skill.search(new RegExp(`^#{2,3} ${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
  if (start === -1) return null;
  const rest = skill.slice(start).replace(/^#{2,3} .*\n/, "");
  const end = rest.search(/^#{2,3} /m);
  return end === -1 ? rest : rest.slice(0, end);
}

describe("connected-panel capabilities ↔ the skill", () => {
  it.each(AGENT_CAPABILITY_ASKS)(
    "«$ask» is taught to the agent under «$skillSection»",
    ({ skillSection }) => {
      // A missing section means the panel is advertising something no agent was ever told
      // to honour. That failure is silent in production — the user asks, the agent
      // improvises or declines, and nothing anywhere calls it a bug.
      expect(sectionBody(skillSection)).not.toBeNull();
    }
  );

  it("keeps the lens ask backed by a type the boundary still accepts", () => {
    // "find where this sounds AI-written" is only answerable because `user_lens` exists —
    // it is the one type whose topic the user defines. Drop it from the boundary and the
    // agent's only honest move is to file nothing.
    expect(AGENT_ONLY_TYPES.has("user_lens")).toBe(true);
  });

  it("keeps the withdraw ask backed by the retract endpoint", () => {
    // The panel says an agent can be asked to leave only the cards that matter. The skill
    // section has to carry the actual mechanism, not just the permission in prose.
    expect(sectionBody("4. Withdraw what no longer holds")).toMatch(/\/retract/);
  });

  it("reads as speech, not as a feature list", () => {
    // The milestone's binding constraint on this copy. "Steering", "lenses" and
    // "retraction" are *our* names for these; a user asking their agent for something says
    // the sentences in the array. A future edit that swaps in the internal vocabulary
    // would technically still be true and would lose the entire point.
    for (const { ask } of AGENT_CAPABILITY_ASKS) {
      expect(ask, `"${ask}" opens like a label, not like something said`).toMatch(/^[a-z]/);
      expect(ask, `"${ask}" uses our vocabulary rather than the user's`).not.toMatch(
        /\b(lens|lenses|retract|retraction|steer|steering|taxonomy|observation|scope)\b/i
      );
    }
    // Three is the panel's whole budget. This is a settings section beside an address and
    // a cadence, not a capability catalogue — /agent carries the rest.
    expect(AGENT_CAPABILITY_ASKS.length).toBeLessThanOrEqual(3);
  });
});
