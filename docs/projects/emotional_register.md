---
status: idea
kind: quality
phases: [5]
summary: Make the feed's voice intentional — a persona spec (trusted senior colleague), the wrong-persona anti-patterns, a message voice/copy guide, and tone as a labeled eval dimension — so the emotional register that determines whether critique-without-a-fix is bearable is designed, not incidental.
---

# Emotional Register

## Status

> Canonical status lives in the frontmatter above and is mirrored in the Projects Index in `docs/plan.md`. This block carries the human-readable scope only.

**Idea — Phase 5.** The 2026-06-04 requirements analysis found the emotional register (`docs/product-requirements.md` § 6, R6.1–R6.4) is the biggest _non-technical_ risk and currently has no owner: prompts assert "confident, non-condescending," but no persona spec shapes them and nothing measures tone. Critique-without-a-fix is harder to receive than critique-with-one, so the voice is load-bearing, not polish. Rides with the Phase 5 visual-style and onboarding work because they jointly define product feel.

Read alongside:

- `docs/product-requirements.md` § 6 (the requirement) and `docs/features.md` → _Emotional register_ (the product-level home).
- `docs/projects/philosophy_guardrails.md` (G3 owns the _structural_ no-disguised-fix rule; this project owns the _felt-tone_ half — the cold-fix failure mode).
- `docs/logs/prompt_quality_observations.md` (where tone violations get logged in the field).
- `docs/projects/evaluator_quality_ratchet.md` (where the tone eval dimension plugs in).

## Phased Plan

| Phase | Contributes |
| --- | --- |
| **5** | Persona spec + wrong-persona anti-patterns, a message voice/copy guide applied to every observation prompt, and a tone eval dimension (human-labeled colleague-vs-pedant, even if Tier-2/manual) so register can't silently rot. Lands with visual style + onboarding as the "product feel" pass. |

## Todo

- [ ] **Persona spec** — write the canonical voice: the trusted senior colleague who reads your draft, doesn't touch your keyboard, and says the one thing that makes you go "...yeah." Terse, assumes competence.
- [ ] **Wrong-persona anti-patterns** — concrete before/after examples for each: linter, boss, pedant, therapist, smartass. Use as negative few-shots in prompts.
- [ ] **Voice/copy guide for observation messages** — sentence shape, length ceiling, no-hedge rule, how to name a tension without rhetorical questioning; applied uniformly across the per-type prompts in `src/services/evaluator.ts`.
- [ ] **Tone as a labeled eval dimension** — add a tone label to a sample of ratchet fixtures (colleague / pedant / cold / condescending); a manual or Tier-2 scorer flags drift. Wire into `docs/projects/evaluator_quality_ratchet.md`.
- [ ] **Cross-check with G3** — the structural no-leading-question rule lands in `philosophy_guardrails.md`; this project ensures what remains _reads_ like a colleague, not just "technically not a fix."

## Design

### The persona is the requirement

R6 is qualitative: it can't be unit-tested, only human-judged (R6.2 gate in `fidelity-criteria.md` is `[human]`). But "qualitative" is not "unowned." The deliverable is a written persona + voice guide that (a) shapes the prompts as explicit instruction and negative few-shots, and (b) gives a human reviewer a rubric to grade a message sample against. The discomfort budget (the _amount_ of hard critique at once) is the count/weight lever and lives with `philosophy_guardrails.md` G4; this project owns the _phrasing_ of each individual message.

### Why Phase 5, not Phase 4

The structural guards (anti-taxonomy, flattery-resistance, no-leading-questions) are Phase-4 trust work because they're falsifiable and the feed is untrustworthy without them. Tone is the next layer up: it makes a _trustworthy_ feed _pleasant_, which is exactly the Phase 5 "make the loop worth living in" remit. Doing it earlier would mean tuning voice on top of prompts that are still changing.
