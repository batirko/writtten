---
status: idea
kind: quality
phases: [9]
summary: Resolve the zero-config "smart feed" philosophy against the user desire for filters/sorting/"top 5" (UX-010). Decision (2026-06-18) — maturity-aware curation (R2) plus exactly ONE lightweight control, a three-step noisiness switch (Key issues / Balanced / Everything); per-type filters, sorting, and manual "top N" are deliberately refused. Draws the line so the feed never becomes a settings dashboard.
---

# Smart-feed vs. manual control (R2c)

> Written 2026-06-18 to close the R2c milestone. This is the **design/decision** layer for UX-010; it does not introduce new control machinery — the one control it concedes is already build-ready (Milestone E of `observation_taxonomy_and_priority.md`). The contribution is the **line**: what agency we give, what we refuse, and why.

## Status

**Idea — Phase 9 (design settled 2026-06-18; sequencing updated 2026-06-27; moved Phase 6→7 on 2026-07-08; re-cut to Phase 9 on 2026-07-10, with its V2 gate in Phase 8).** The decision (the _line_: maturity-aware curation + one noisiness switch, refuse the rest) is made. **Two updates 2026-06-27:** (1) the maturity-aware-curation half is now its own tracked milestone, `maturity_aware_severity.md` (R2), which this design depends on — it is no longer an ambient principle; (2) the one conceded control (the noisiness switch) is **build-held pending V2** confirms maturity-curation isn't already sufficient, rather than wired immediately. **Update 2026-07-08:** R2 has now **shipped**, so the only remaining gate is V2 — and since V2 was deferred out of the active phase, the owner moved this milestone with it (rather than leave a V2-blocked item in the current phase); as of the 2026-07-10 re-cut, V2 is Phase 8 and this switch is Phase 9. If V2 shows the maturity split dissolves the UX-010 friction, we may never need to add the control surface — which is the more zero-config outcome.

Read alongside:

- `docs/projects/maturity_aware_severity.md` (R2) — the **load-bearing dependency**: the mechanism that makes "maturity-aware curation does most of the work" real. R2c's whole concession rests on it.
- `docs/projects/quality_remediation_synthesis.md` (R2 · UX-010) — the root-cause synthesis that frames timing/maturity, not manual filters, as the principled answer.
- `docs/projects/observation_taxonomy_and_priority.md` (Milestone E) — the **executable** noisiness-control spec (`Noisiness = "key" | "balanced" | "everything"`, the `NOISINESS` map, persistence, testids). This doc decides _that we ship it_; that doc says _how_.
- `docs/projects/philosophy_guardrails.md` (G4) — the discomfort-budget ceiling; G4 caps emotional load, the noisiness switch caps volume. Distinct levers, must compose.
- `docs/logs/ux_quality_observations.md` (UX-010) — the source friction.
- `CLAUDE.md` (Invariant 4 "quiet while generating, opinionated while revising"; the zero-config posture).

## Phased Plan

| Phase | Contributes                                                                                                                                                                                                          |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **9** | The decision (this doc) + ship the **noisiness switch** (Milestone E build spec) as the single conceded control — **only if V2 (Phase 8) shows maturity-aware curation (R2, shipped in Phase 6) doesn’t already resolve UX-010.** Held here behind V2. |

## Todo

- [x] **Decide the line** (§ The decision) — maturity-aware curation + one noisiness switch; refuse per-type filters / sorting / manual "top N". _Settled 2026-06-18._
- [ ] **Ship the noisiness control** per `observation_taxonomy_and_priority.md` Milestone E build spec (the `NOISINESS` map, `FeedPartitionOptions.noisiness`, `localStorage["writtten_noisiness"]`, the three-segment settings control, `feedBudget.test.ts` cases). **Held pending V2** (R2 shipped 2026-07-06) — execute only if V2 shows maturity-aware curation alone doesn't resolve UX-010. No new design needed when it does proceed. _(The underlying kind-keyed budget machinery still lands with R2, which needs it to compose; this item is specifically the user-facing three-step **switch**.)_
- [ ] **Confirm composition with G4** — the contradiction floor/ceiling (G4) and the noisiness budget must both apply without one silently overriding the other (e.g. "Key issues" must still honour the G4 ceiling, not dump all contradictions). Add a `feedBudget.test.ts` case crossing a noisiness mode with >`CONTRADICTION_CEILING` contradictions.
- [ ] **Copy + placement** — the control reads as a calm "how much do you want to see," not a filter panel (§ How it must read).

## Design

### The decision (settled 2026-06-18)

**The answer to UX-010 is maturity-aware curation plus exactly one lightweight control — not a settings dashboard.** Concretely:

1. **Maturity-aware severity (R2)** does most of the work. Surfacing structural gaps as soft _opportunities_ on an early draft and promoting them to _warnings_ only as the doc matures is the principled answer to the users who asked for a "warnings vs. suggestions" split — they get the split _as a function of where the document is_, without a toggle.
2. **One conceded control: the three-step noisiness switch** — **Key issues / Balanced / Everything** — already specced and build-ready in `observation_taxonomy_and_priority.md` Milestone E. It is a single, opinionated _volume_ dial over the existing priority budget:
   - **Key issues** — `problem`-kind only, tight budget (5): contradictions and hard problems, nothing soft.
   - **Balanced** — the current default (budget 7, problems + opportunities).
   - **Everything** — no cap; the "also noticed" drawer empties into the feed.
3. **Refused, deliberately:** per-type filters ("hide all `undefined_jargon`"), arbitrary sorting, and a manual "show me the top N" number. These are the dashboard creep that would turn a calm companion into a configuration surface and erode the zero-config promise.

### Why this line and not more

- **The smart feed already gives agency without configuration.** Priority-ranked budget + the "also noticed" drawer already let a user see less _or_ see all, on demand. The noisiness switch makes that latent capability an explicit, legible lever — which is what UX-010 actually wanted (a sense of control), not a filter matrix.
- **One dial is a lever; ten filters are a job.** A three-step switch is glanceable and reversible. The moment we add per-type mutes or sorts, the user is now _maintaining a configuration_ — exactly the labour the product exists to remove. The friction in UX-010 is "I want a say," not "I want to administer a feed."
- **Type-level muting was considered and refused for v1.** A "mute this type forever" gesture starts down the per-type-filter road and needs account/project scope to be coherent (the same reasoning that demotes the user-facing jargon dictionary in R6/UX-005). Per-span dismissal already exists for the specific case ("not this one"); a blanket type mute is deferred unless dogfooding shows the noisiness switch is too coarse.

### How it must read

The control lives in the settings panel (Milestone E places it near the jargon control), labelled as a question of _how much to surface_, not _what to filter_:

- Copy: **"Key issues only / Balanced / Everything"** — about volume, not categories.
- It is a **switch, not a slider** (three discrete, named stops — no false precision of a continuous dial).
- Default **Balanced**; the choice persists per the existing settings pattern (`localStorage`).
- It never implies the AI will _act_ on the doc — it only changes how many of its observations the user chooses to see (Invariant 1 untouched).

### Relationship to the Phase 7 "Noisiness control" backlog item

The noisiness control was originally a Phase 7 backlog line (`docs/plan.md` Phase 7 + Milestone E note). It was pulled into Phase 6 (2026-06-18) as R2c's single conceded control, then **moved back out of Phase 6 on 2026-07-08** — R2 shipped but the switch stays build-held behind V2, so the milestone travels with its gate (2026-07-10 re-cut: V2 is Phase 8; this switch is Phase 9). The `docs/plan.md` Phase 9 line now carries this R2c milestone directly; Milestone E remains the executable "how."

### Out of scope

- The **control's implementation** — owned by `observation_taxonomy_and_priority.md` Milestone E (executable as-is).
- **Maturity-aware severity (R2)** — its own milestone; this doc only relies on it as the reason we don't need a warnings/suggestions toggle.
- The **discomfort-budget ceiling (G4)** — a different lever (emotional load, not volume); must compose (see Todo).
