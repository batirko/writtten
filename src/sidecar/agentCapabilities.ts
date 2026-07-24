/**
 * What a user can ask a connected agent for — in the words a person would use.
 *
 * Every one of these already worked before this module existed, and none of them was
 * discoverable from inside the app (UX-043). The capabilities were documented only in
 * `docs/skills/writtten-agent.md`, a file addressed to the *agent*, which the user pastes
 * without reading and never sees again — so the connected panel reported an address and a
 * cadence and never said what the connection was for. The evidence that this is a defect
 * rather than a nicety: the product's owner did not know these existed, three days after
 * shipping them.
 *
 * **Phrasing rule, not a preference: these are things someone would actually say, not a
 * feature list.** "Steering", "custom lenses" and "retraction" are our words for them; a
 * user asking their agent to do something says the sentences below. The skill's own lens
 * examples work for the same reason, and a panel that named the features instead would be
 * back to describing plumbing.
 *
 * Each entry names the skill section that teaches the agent to honour it, and
 * `agentCapabilities.test.ts` asserts that section still exists. That is the whole point of
 * the pairing: the panel is the user-facing half of a capability and the skill is the
 * agent-facing half, and a capability we advertise here that the skill stopped teaching is
 * one the user asks for and does not get.
 */

export interface AgentCapability {
  /** Rendered verbatim in the connected panel, in quotes. */
  ask: string;
  /** Heading in `docs/skills/writtten-agent.md` (`##` or `###`) that carries the
   *  agent-facing instruction. Existence is asserted by test. */
  skillSection: string;
}

export const AGENT_CAPABILITY_ASKS: readonly AgentCapability[] = [
  {
    ask: "check whether the metrics section holds up",
    skillSection: "When the author steers the pass",
  },
  {
    ask: "find where this sounds AI-written",
    skillSection: "Lenses (`user_lens`)",
  },
  {
    // The one the 2026-07-20 dogfood agent performed unprompted and the skill had never
    // granted in writing — the agent-facing half of this same gap.
    ask: "leave the three cards that matter most",
    skillSection: "4. Withdraw what no longer holds",
  },
];
