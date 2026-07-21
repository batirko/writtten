/**
 * Unit tests for the external-observation boundary (PR1 of the bring-your-own-agent
 * build — docs/projects/agent_connected_eval.md § The boundary).
 *
 * Two halves:
 *   1. The adversarial corpus (external-submissions-corpus.ts) — one test per
 *      row, each pinning the exact { code, rule } an untrusted submission earns.
 *      That file is where the product-principle cases live; read it first.
 *   2. Hand-written tests for the things a corpus row can't express: stage
 *      ordering, what an accepted observation is actually built out of, the
 *      suppression and duplicate arms (which need seeded context), the caps,
 *      and the confidence clamp.
 *
 * Pure module, zero mocks — `import type` from the store means no DB graph is
 * pulled in at all.
 */

import { describe, it, expect } from "vitest";
import {
  submitExternalObservation,
  sanitizeSourceName,
  SOURCE_ACTIVE_BUDGET,
  MIN_SUBMISSION_SPACING_MS,
  MAX_SOURCE_NAME_LENGTH,
  type ExternalSubmissionContext,
} from "./externalObservations";
import {
  externalSubmissionCorpus,
  CORPUS_MEMBERS,
} from "./eval-fixtures/external-submissions-corpus";
import type { DismissalSuppression, Observation, ObservationSource } from "../store/db";

const SOURCE: ObservationSource = {
  kind: "agent",
  name: "Claude Code",
  sessionId: "sess-1",
};

function ctx(over: Partial<ExternalSubmissionContext> = {}): ExternalSubmissionContext {
  return {
    members: CORPUS_MEMBERS,
    activeObservations: [],
    suppressions: [],
    source: SOURCE,
    now: 1_000_000,
    ...over,
  };
}

/** A fully-populated active observation, for the duplicate/budget arms. */
function activeObs(over: Partial<Observation> = {}): Observation {
  return {
    id: "o1",
    docId: "d1",
    type: "clarity",
    scope: "span",
    kind: "problem",
    severity: "low",
    confidence: "medium",
    priority: 0.75,
    text: "An existing observation.",
    status: "active",
    ...over,
  };
}

/** The submission used wherever the payload itself isn't what's under test. */
const CLEAN_SPAN = {
  type: "clarity",
  scope: "span",
  anchorText: "adoption should reach forty percent",
  text: "The adoption target is stated without the window it is measured over.",
};

// ---------------------------------------------------------------------------
// 1. The adversarial corpus
// ---------------------------------------------------------------------------

describe("external submission corpus", () => {
  for (const row of externalSubmissionCorpus) {
    const label = row.expect === "accepted" ? "accepted" : row.expect.code;
    it(`${row.id} → ${label}`, () => {
      const verdict = submitExternalObservation(row.submission, ctx());
      if (row.expect === "accepted") {
        expect(verdict.ok, `expected accepted but got: ${JSON.stringify(verdict)}`).toBe(true);
        return;
      }
      expect(verdict.ok, `expected ${row.expect.code} but the submission was accepted`).toBe(
        false
      );
      if (verdict.ok) return; // narrowing; unreachable given the assertion above
      expect(verdict.code).toBe(row.expect.code);
      if (row.expect.rule) expect(verdict.rule).toBe(row.expect.rule);
      // Every rejection must tell the agent what to do differently.
      expect(verdict.hint.length).toBeGreaterThan(0);
    });
  }

  it("covers every rejection code", () => {
    const covered = new Set(
      externalSubmissionCorpus
        .filter((r) => r.expect !== "accepted")
        .map((r) => (r.expect as { code: string }).code)
    );
    // The two source-level caps need seeded context, so they are asserted in
    // the hand-written half instead — everything else is corpus-covered.
    expect([...covered].sort()).toEqual([
      "anchor_unresolved",
      "invalid_scope",
      "malformed",
      "register_violation",
      "unknown_type",
    ]);
  });
});

// ---------------------------------------------------------------------------
// 2. The accepted observation
// ---------------------------------------------------------------------------

describe("accepted submissions", () => {
  it("resolves the anchor locally and carries the document's own words as anchorQuote", () => {
    const verdict = submitExternalObservation(CLEAN_SPAN, ctx());
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    const o = verdict.observation;
    expect(o.blockId).toBe("b2");
    expect(o.startOffset).toBe(CORPUS_MEMBERS[1].text.indexOf("adoption should reach forty"));
    expect(o.anchorQuote).toBe("adoption should reach forty percent");
    expect(o.scope).toBe("span");
  });

  it("stamps the source so the feed can attribute the card", () => {
    const verdict = submitExternalObservation(CLEAN_SPAN, ctx());
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.observation.source).toEqual(SOURCE);
  });

  it("assigns kind from the type, never from the agent", () => {
    const verdict = submitExternalObservation(CLEAN_SPAN, ctx());
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.observation.kind).toBe("problem");
  });

  it("leaves a document-scope observation unanchored", () => {
    const verdict = submitExternalObservation(
      {
        type: "missing_topic",
        scope: "document",
        text: "The document commits to delivery dates without naming what moves if the audit slips.",
      },
      ctx()
    );
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.observation.blockId).toBeUndefined();
    expect(verdict.observation.anchorText).toBeUndefined();
    expect(verdict.observation.kind).toBe("opportunity");
  });

  it("anchors a quote that picked up a trailing period, and quotes the source verbatim", () => {
    const verdict = submitExternalObservation(
      {
        type: "unsupported_claim",
        scope: "span",
        anchorText: "The rollout begins in Q2.",
        text: "The Q2 start is asserted without the dependency that would make it possible.",
      },
      ctx()
    );
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    // The document has no period there — anchorQuote is the source slice, not
    // the agent's rendering of it.
    expect(verdict.observation.anchorQuote).toBe("The rollout begins in Q2");
    expect(verdict.observation.anchorText).toBe("The rollout begins in Q2.");
  });

  it("resolves a multi-match anchor to the first occurrence in document order", () => {
    const members = [
      { blockId: "b1", text: "The target is forty percent." },
      { blockId: "b2", text: "The target is forty percent." },
    ];
    const verdict = submitExternalObservation(
      {
        type: "clarity",
        scope: "span",
        anchorText: "The target is forty percent.",
        text: "The target is stated without the window it is measured over.",
      },
      ctx({ members })
    );
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.observation.blockId).toBe("b1");
  });
});

// ---------------------------------------------------------------------------
// 3. Volume is not the agent's to set
// ---------------------------------------------------------------------------

describe("confidence clamp", () => {
  it("ignores an agent's attempt to raise its own volume", () => {
    // A free-tier-equivalent contradiction earns confidence "low". The agent
    // asking for "high" must not get it — an unratcheted source outranking the
    // precision-guarded one is exactly the failure the clamp exists to prevent.
    const high = submitExternalObservation(
      {
        type: "contradiction",
        scope: "span",
        anchorText: "The rollout begins in Q2",
        text: "The rollout starts in Q2 while the reporting module it depends on ships in Q3.",
        confidence: "high",
      },
      ctx()
    );
    expect(high.ok).toBe(true);
    if (!high.ok) return;
    expect(high.observation.confidence).toBe("low");
  });

  it("honours an agent quieting itself", () => {
    const base = submitExternalObservation(CLEAN_SPAN, ctx());
    const quiet = submitExternalObservation({ ...CLEAN_SPAN, confidence: "low" }, ctx());
    expect(base.ok && quiet.ok).toBe(true);
    if (!base.ok || !quiet.ok) return;
    expect(base.observation.confidence).toBe("medium");
    expect(quiet.observation.confidence).toBe("low");
    expect(quiet.observation.priority).toBeLessThan(base.observation.priority);
  });
});

// ---------------------------------------------------------------------------
// 4. Dismissal is never disclosed, only enforced (G1)
// ---------------------------------------------------------------------------

describe("duplicate_suppressed", () => {
  const suppression = (over: Partial<DismissalSuppression> = {}): DismissalSuppression => ({
    id: "s1",
    docId: "d1",
    type: "clarity",
    severity: "medium",
    ...over,
  });

  it("rejects a re-submission of something the author dismissed", () => {
    const verdict = submitExternalObservation(
      CLEAN_SPAN,
      ctx({ suppressions: [suppression()] })
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.code).toBe("duplicate_suppressed");
  });

  it("applies the category-wide arm for low/medium severity, as the evaluator does", () => {
    // G1: dismissing a medium clarity mutes the category for the document. The
    // agent gets the same treatment as the built-in evaluator — no exemption
    // for being a second opinion.
    const verdict = submitExternalObservation(
      {
        type: "clarity",
        scope: "span",
        anchorText: "they are counting on it",
        text: "The final clause is joined to the preceding sentence with a comma.",
      },
      ctx({ suppressions: [suppression()] })
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.code).toBe("duplicate_suppressed");
  });

  it("never discloses the suppression list", () => {
    const verdict = submitExternalObservation(
      CLEAN_SPAN,
      ctx({
        suppressions: [
          suppression({ note: "the author found this pedantic" }),
          suppression({ id: "s2", type: "missing_topic" }),
        ],
      })
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    // Exposing what has been dismissed would invite the agent to self-censor
    // whole categories — the sycophancy G1 exists to prevent.
    const serialized = JSON.stringify(verdict);
    expect(serialized).not.toContain("pedantic");
    expect(serialized).not.toContain("missing_topic");
    expect(serialized).not.toContain("s1");
  });

  it("does not suppress a different type", () => {
    const verdict = submitExternalObservation(
      CLEAN_SPAN,
      ctx({ suppressions: [suppression({ type: "missing_topic" })] })
    );
    expect(verdict.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Duplicates against the live feed
// ---------------------------------------------------------------------------

describe("duplicate_active", () => {
  it("rejects a span overlapping an active card of the same type, naming the card", () => {
    const existing = activeObs({
      id: "existing-1",
      type: "clarity",
      blockId: "b2",
      startOffset: 41,
      endOffset: 90,
    });
    const verdict = submitExternalObservation(CLEAN_SPAN, ctx({ activeObservations: [existing] }));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.code).toBe("duplicate_active");
    // The agent is told the ground is taken, not that it erred.
    expect(verdict.observationId).toBe("existing-1");
  });

  it("allows the same span when the type differs", () => {
    const existing = activeObs({
      type: "undefined_jargon",
      blockId: "b2",
      startOffset: 41,
      endOffset: 90,
    });
    expect(submitExternalObservation(CLEAN_SPAN, ctx({ activeObservations: [existing] })).ok).toBe(
      true
    );
  });

  it("allows a non-overlapping span in the same block", () => {
    const existing = activeObs({ type: "clarity", blockId: "b2", startOffset: 0, endOffset: 10 });
    expect(submitExternalObservation(CLEAN_SPAN, ctx({ activeObservations: [existing] })).ok).toBe(
      true
    );
  });

  it("allows an overlapping span in a different block", () => {
    const existing = activeObs({
      type: "clarity",
      blockId: "b3",
      startOffset: 41,
      endOffset: 90,
    });
    expect(submitExternalObservation(CLEAN_SPAN, ctx({ activeObservations: [existing] })).ok).toBe(
      true
    );
  });

  it("catches a doc-scope rephrasing of a note already in the feed", () => {
    const existing = activeObs({
      id: "existing-doc",
      type: "missing_topic",
      scope: "document",
      blockId: undefined,
      text: "The document commits to delivery dates without naming what moves if the audit slips.",
    });
    const verdict = submitExternalObservation(
      {
        type: "missing_topic",
        scope: "document",
        text: "The document commits to delivery dates without naming what moves when the audit slips.",
      },
      ctx({ activeObservations: [existing] })
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.code).toBe("duplicate_active");
    expect(verdict.observationId).toBe("existing-doc");
  });

  it("admits a genuinely different doc-scope note of the same type", () => {
    const existing = activeObs({
      type: "missing_topic",
      scope: "document",
      blockId: undefined,
      text: "The document commits to delivery dates without naming what moves if the audit slips.",
    });
    const verdict = submitExternalObservation(
      {
        type: "missing_topic",
        scope: "document",
        text: "No owner is named for reaching the adoption target.",
      },
      ctx({ activeObservations: [existing] })
    );
    expect(verdict.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Source-level caps
// ---------------------------------------------------------------------------

describe("source caps", () => {
  /** N active cards from SOURCE, each on its own block so none collide. */
  function saturate(n: number): Observation[] {
    return Array.from({ length: n }, (_, i) =>
      activeObs({
        id: `o${i}`,
        type: "missing_topic",
        scope: "document",
        text: `Distinct note number ${i} about an unrelated subject ${"x".repeat(i)}.`,
        source: SOURCE,
      })
    );
  }

  it("rejects past the active budget", () => {
    const verdict = submitExternalObservation(
      CLEAN_SPAN,
      ctx({ activeObservations: saturate(SOURCE_ACTIVE_BUDGET) })
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.code).toBe("source_budget_exceeded");
  });

  it("counts only this source's cards toward the budget", () => {
    // Built-in evaluator cards (no `source`) and other sessions' cards don't
    // consume an agent's budget.
    const others = saturate(SOURCE_ACTIVE_BUDGET).map((o, i) => ({
      ...o,
      source: i % 2 === 0 ? undefined : { ...SOURCE, sessionId: "other-session" },
    }));
    expect(submitExternalObservation(CLEAN_SPAN, ctx({ activeObservations: others })).ok).toBe(
      true
    );
  });

  it("rejects submissions closer together than the spacing floor", () => {
    const verdict = submitExternalObservation(
      CLEAN_SPAN,
      ctx({ now: 1_000_000, lastSubmissionAt: 1_000_000 - (MIN_SUBMISSION_SPACING_MS - 1) })
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.code).toBe("rate_limited");
  });

  it("admits a submission exactly at the spacing floor", () => {
    const verdict = submitExternalObservation(
      CLEAN_SPAN,
      ctx({ now: 1_000_000, lastSubmissionAt: 1_000_000 - MIN_SUBMISSION_SPACING_MS })
    );
    expect(verdict.ok).toBe(true);
  });

  it("admits the first submission of a session", () => {
    expect(submitExternalObservation(CLEAN_SPAN, ctx({ lastSubmissionAt: undefined })).ok).toBe(
      true
    );
  });
});

// ---------------------------------------------------------------------------
// 7. Stage ordering — part of the frozen contract
// ---------------------------------------------------------------------------

describe("stage order", () => {
  it("reports the shape error before the unknown type", () => {
    const verdict = submitExternalObservation(
      { type: "grammar", scope: "span", text: "A nit.", suggestedFix: "fix it" },
      ctx()
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.code).toBe("malformed");
  });

  it("reports the unknown type before the register violation", () => {
    const verdict = submitExternalObservation(
      { type: "grammar", scope: "document", text: "Change this to a shorter sentence." },
      ctx()
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.code).toBe("unknown_type");
  });

  it("reports the register violation before the unresolvable anchor", () => {
    // Register is checked first because it is the product-principle gate — an
    // agent must learn that the *phrasing* is disqualifying regardless of
    // whether the anchor would have landed.
    const verdict = submitExternalObservation(
      {
        type: "clarity",
        scope: "span",
        anchorText: "a passage that is not in the document at all",
        text: "Change this to a measurable target.",
      },
      ctx()
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.code).toBe("register_violation");
  });

  it("gives precise feedback even when the source is over its caps", () => {
    // The caps run last on purpose: they exist to bound damage, not to punish,
    // and a flooding agent that also sent a malformed payload should learn that.
    const verdict = submitExternalObservation(
      { type: "clarity", scope: "document", text: "A note.", suggestedFix: "x" },
      ctx({ now: 1_000_000, lastSubmissionAt: 1_000_000 })
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.code).toBe("malformed");
  });
});

// ---------------------------------------------------------------------------
// 8. Name sanitization
// ---------------------------------------------------------------------------

describe("sanitizeSourceName", () => {
  it("keeps an ordinary product name", () => {
    expect(sanitizeSourceName("Claude Code")).toBe("Claude Code");
  });

  it("truncates to the chip's budget", () => {
    expect(sanitizeSourceName("A".repeat(100))).toHaveLength(MAX_SOURCE_NAME_LENGTH);
  });

  it("strips control characters and collapses whitespace", () => {
    expect(sanitizeSourceName("Claude \nCode\t\tv2")).toBe("Claude Code v2");
  });

  it("falls back rather than returning an empty chip", () => {
    expect(sanitizeSourceName("   ")).toBe("Agent");
    expect(sanitizeSourceName(" ")).toBe("Agent");
    expect(sanitizeSourceName(undefined)).toBe("Agent");
    expect(sanitizeSourceName(42)).toBe("Agent");
  });
});

// ---------------------------------------------------------------------------
// Both sides of a conflict (UX-037)
//
// A contradiction names a relationship between two passages. Until 2026-07-21 an
// agent could only anchor one of them, so the card highlighted half of what its
// text described and the reader had to hunt for the rest — the exact work the
// anchoring machinery exists to remove. The model already carried the fields and
// the highlighter already drew them; only the boundary could not accept a second
// quote.
// ---------------------------------------------------------------------------

describe("conflicting anchor", () => {
  const Q3 = "ship the reporting module in Q3";
  const Q2 = "The rollout begins in Q2";

  function conflict(over: Record<string, unknown> = {}) {
    return {
      type: "contradiction",
      scope: "span",
      anchorText: Q3,
      conflictingAnchorText: Q2,
      text: "The launch quarter is given as Q3 here and as Q2 in the rollout section.",
      ...over,
    };
  }

  it("resolves both sides and populates the fields the highlighter reads", () => {
    const v = submitExternalObservation(conflict(), ctx());
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.observation.blockId).toBe("b2");
    expect(v.observation.conflictingBlockId).toBe("b3");
    // Stored as the document's own characters, not the agent's rendering — the
    // same rule the primary anchor follows, and what lets it re-anchor later.
    expect(v.observation.conflictingAnchorText).toBe(Q2);
    expect(v.observation.conflictingStartOffset).toBe(0);
    expect(v.observation.conflictingEndOffset).toBe(Q2.length);
  });

  it("stays optional — a single-anchor conflict is still accepted", () => {
    const v = submitExternalObservation(
      conflict({ conflictingAnchorText: undefined }),
      ctx()
    );
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.observation.conflictingBlockId).toBeUndefined();
  });

  /**
   * The reject-don't-degrade rule, extended to the second side. Accepting a
   * half-resolved conflict would silently reproduce UX-037 itself — one
   * highlight under a card naming two passages — and leave no trace of why.
   * Affordable precisely because the field is optional: the agent opted in, has
   * the document, and can retry in the same pass.
   */
  it("rejects the whole submission when only the second quote fails", () => {
    const v = submitExternalObservation(
      conflict({ conflictingAnchorText: "a paraphrase that appears nowhere" }),
      ctx()
    );
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.code).toBe("anchor_unresolved");
    // The hint must name WHICH quote failed, or the agent re-sends the same
    // primary anchor and fails identically.
    expect(v.hint).toContain("conflictingAnchorText");
    expect(v.hint).toContain("omit the field");
  });

  it("refuses a second quote that resolves to the same passage as the first", () => {
    const v = submitExternalObservation(
      conflict({ conflictingAnchorText: Q3 }),
      ctx()
    );
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.code).toBe("anchor_unresolved");
    expect(v.hint).toContain("same passage");
  });

  /** Same block, different spans: b2 asserts both a Q3 ship date and a 40%
   *  adoption target, so a tension between them is one paragraph wide. This is
   *  the shape the highlighter used to drop. */
  it("accepts both sides inside one block when the spans differ", () => {
    const v = submitExternalObservation(
      conflict({
        type: "strategic_tension",
        anchorText: "ship the reporting module in Q3",
        conflictingAnchorText: "adoption should reach forty percent of active teams",
        text: "The delivery date and the adoption target are set for the same quarter.",
      }),
      ctx()
    );
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.observation.conflictingBlockId).toBe(v.observation.blockId);
    expect(v.observation.conflictingStartOffset).not.toBe(v.observation.startOffset);
  });

  it("refuses a counterpart on a type that is not about two passages", () => {
    const v = submitExternalObservation(conflict({ type: "clarity" }), ctx());
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.code).toBe("invalid_scope");
    expect(v.hint).toContain("contradiction");
  });

  it("refuses a counterpart on a document-scoped submission", () => {
    const v = submitExternalObservation(
      conflict({ scope: "document", anchorText: undefined }),
      ctx()
    );
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.code).toBe("invalid_scope");
  });

  it("rejects an empty counterpart rather than treating it as absent", () => {
    const v = submitExternalObservation(conflict({ conflictingAnchorText: "  " }), ctx());
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.code).toBe("malformed");
  });
});
