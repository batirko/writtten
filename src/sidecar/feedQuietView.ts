/**
 * What the empty feed should say — one matrix, both engines (UX-053).
 *
 * The feed had a single quiet message, `Quiet while you draft — I'll speak up as
 * you revise`, and it was standing in for three different facts:
 *
 *   1. nothing has read this draft yet, because it is too thin to draw
 *      whole-document conclusions about;
 *   2. something read it and had nothing to raise;
 *   3. the author has edited since the last pass and it has not been picked up.
 *
 * Only the first is anything like "quiet while you draft". In (2) the author is
 * revising, not drafting, and the sentence denies that a review happened at all;
 * in (3) it claims a considered silence about text nobody has looked at. So the
 * message was wrong in whichever state the author was actually in — and the
 * process readout had the mirror problem, saying `watching` for both a
 * deliberate hold and a finished pass.
 *
 * **One matrix rather than one per engine, deliberately.** The two engines learn
 * these facts from completely different places — an agent's `AgentPass`
 * timestamps versus our own outstanding-work count — but the author is asking the
 * same question either way, and giving each engine its own copy is how two
 * vocabularies for one state get born. The adapters differ; the words do not.
 *
 * Pure and argument-injected, like `processStatusView` / `engineReadiness` /
 * `agentStatusView`: the interesting part is a small state matrix that deserves
 * testing without a DOM.
 */

import type { EngineId } from "../services/evalEngine";
import type { MaturityLevel } from "../services/documentMaturity";
import type { AgentPassPhase } from "./agentActivityView";

export type FeedQuietState =
  | "below-threshold"
  | "awaiting-pickup"
  | "read-nothing-found"
  | "default";

export interface FeedQuietInput {
  /** Which engine holds the slot. Only its facts are consulted. */
  engine: EngineId;
  /** The live band from `docMaturitySignal`. */
  maturity: MaturityLevel;
  /** Agent engine only — from `agentPassPhase`. `null` when no pass exists. */
  agentPhase: AgentPassPhase | null;
  /** Agent engine only — whether the agent has pulled `/doc` for the CURRENT
   *  pass. The pass resets on every material push, so this is per-version. */
  agentHasPulled: boolean;
  /** Built-in engine only — outstanding eval work. */
  pending: number;
  /** Built-in engine only — `getLastCompletedAt()`. `null` means no evaluation
    *  has ever completed, i.e. nothing has read this document this session. It is
    *  deliberately a record of success, not of the work queue emptying: a failed
    *  or no-op batch drains identically to a real pass. */
  lastCompletedAt: number | null;
}

export interface FeedQuietView {
  state: FeedQuietState;
  headline: string;
  subtext: string;
}

const COPY: Record<FeedQuietState, { headline: string; subtext: string }> = {
  // Engine-neutral on purpose. The state exists for both engines now, and
  // "your agent is waiting…" would need an engine branch for a sentence whose
  // meaning does not depend on which critic is holding back.
  "below-threshold": {
    headline: "Nothing to react to yet.",
    subtext:
      "The whole-document read is held until there's more of a draft. Contradictions and unsupported claims still surface as you write.",
  },
  "awaiting-pickup": {
    headline: "Your changes haven't been read yet.",
    subtext: "The next pass starts when you pause.",
  },
  "read-nothing-found": {
    headline: "Read your draft — nothing to raise.",
    subtext: "New observations appear here as you revise.",
  },
  // Unchanged wording, and it keeps the one state it was always right about:
  // something is attached, a first pass has not resolved yet, and there is
  // nothing more specific to say.
  default: {
    headline: "Quiet while you draft — I'll speak up as you revise.",
    subtext: "Observations appear here as the document matures.",
  },
};

/**
 * Which quiet this is. Callers render it only when the feed is empty AND
 * something is actually reading — `nothingIsReading` still short-circuits to the
 * keyless banner first, because "no engine at all" is a different message that
 * already has a home.
 *
 * Ordering note: the band is checked first, above every per-engine fact. A draft
 * below the threshold is being held back whether or not a pass has also run over
 * its spans, and that hold is the more informative thing to say — `read your
 * draft, nothing to raise` on a 40-word document would be true and useless,
 * since it invites the author to conclude the draft is clean when most of the
 * critic has not weighed in.
 */
export function feedQuietView({
  engine,
  maturity,
  agentPhase,
  agentHasPulled,
  pending,
  lastCompletedAt,
}: FeedQuietInput): FeedQuietView {
  const state = resolve();
  return { state, ...COPY[state] };

  function resolve(): FeedQuietState {
    if (maturity === "unformed") return "below-threshold";

    if (engine === "agent") {
      // `awaiting` means the pass was reset by a material push and the agent has
      // not pulled the new version — i.e. precisely "your edit hasn't been picked
      // up". It cannot be confused with a first connect, which is `none`.
      if (agentPhase === "awaiting") return "awaiting-pickup";
      // Parked after having pulled this version. `quiet` counts too: an agent
      // that pulled, reviewed and then went away still read the draft, and the
      // fact that it has since gone is the `agent` row's business, not this one.
      if ((agentPhase === "watching" || agentPhase === "quiet") && agentHasPulled) {
        return "read-nothing-found";
      }
      return "default";
    }

    // Built-in. There is deliberately no `awaiting-pickup` analogue: our own queue
    // always picks work up within the debounce, so the only gap is the settle
    // window, and a message there would flicker on every keystroke. An agent is a
    // peer that might genuinely never come back, which is what earns that state
    // for the agent engine alone.
    if (pending === 0 && lastCompletedAt !== null) return "read-nothing-found";
    return "default";
  }
}
