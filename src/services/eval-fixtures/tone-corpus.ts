/**
 * Tone reference corpus — Phase 6 emotional register.
 *
 * The five wrong-persona anti-patterns from docs/projects/emotional_register.md
 * § The five wrong personas, encoded as labeled pairs. Each entry has:
 *   - `wrongTone`  — the failure label
 *   - `wrong`      — a ✗ example observation message (labeled negative)
 *   - `right`      — the ✓ colleague version of the same observation
 *   - `context`    — the fictional PRD situation both messages address
 *
 * These are NOT EvalFixture instances (they don't run the pipeline).
 * They are a labeled corpus for the tone scorer: the scorer must classify each
 * `wrong` message as `wrongTone` and each `right` message as "colleague".
 *
 * Two consumers:
 *   - registerLint.classifyTone (deterministic, in CI) — the drift guard.
 *     registerLint.test.ts asserts classifyTone reproduces every label below.
 *   - toneScorer.live.test.ts (LLM judge, gated on EVAL_LIVE=1 — no CI quota).
 *
 * LABEL PRECEDENCE (five wrong personas → four labels): the deterministic
 * classifier sorts by condescending → pedant → cold → colleague. `boss` →
 * condescending (quality verdicts); `pedant`/`linter`/`therapist` → pedant
 * (teacherly / over-explaining / soft — the "therapist" soft failure folds in
 * here, the one taste call made with the user to keep four labels); `smartass`
 * → cold (gotcha / irony / emoji). Keep each `wrong` message's dominant feature
 * unambiguous so the classifier and this corpus can't silently diverge.
 */

export type ToneLabel = "colleague" | "pedant" | "cold" | "condescending";

export interface TonePair {
  id: string;
  wrongTone: Exclude<ToneLabel, "colleague">;
  context: string;
  wrong: string;
  right: string;
}

export const toneCorpus: TonePair[] = [
  {
    id: "pedant",
    wrongTone: "pedant",
    context: "PRD success metric: '30% reduction in false positives' with no stated baseline.",
    wrong:
      "Note that a strong PRD should define its success metrics with a measurable baseline; here the metric lacks one, which is a common oversight.",
    right: "The 30% target in §2 has no baseline to measure against.",
  },
  {
    id: "boss",
    wrongTone: "condescending",
    context: "PRD justification section that asserts a 30% lift without supporting data.",
    wrong: "This section is weak and won't convince leadership.",
    right: "§4 asserts the 30% lift as the core justification but nothing in the doc supports it.",
  },
  {
    id: "therapist",
    wrongTone: "pedant",
    context: "PRD timeline: §2 commits to Q3; dependency in §6 is not due until Q4.",
    wrong:
      "You've done great work here! It might be worth gently revisiting whether the timeline feels realistic to you?",
    right: "§2 commits to Q3; the dependency in §6 isn't due until Q4.",
  },
  {
    id: "smartass",
    wrongTone: "cold",
    context: "PRD §1 commits to building a feature with no stated user demand.",
    wrong: "Have you considered whether users actually want this? 🤔",
    right: "Nothing in the doc establishes user demand for the feature §1 commits to building.",
  },
  {
    id: "linter",
    wrongTone: "pedant",
    context: "Passive voice in a PRD paragraph.",
    wrong: "Passive voice detected in ¶3. Consider revising for clarity.",
    right: "(anti-taxonomy — this observation never fires; passive voice is not a content issue)",
  },
];
