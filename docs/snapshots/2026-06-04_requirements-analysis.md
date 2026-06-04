# Snapshot: Product Requirements Analysis (2026-06-04)

## What We Tried

We took the philosophy articulation in `product-requirements-analysis.md` (a six-axis fidelity bar with Minimum/Good-enough/Superb tiers + five "load-bearing tensions"), assessed how sound it is, how well it aligns with the product, decomposed it into atomic requirements (R1.1–R6.4), and graded the current build and the roadmap against it. The source doc was then promoted to canonical `docs/product-requirements.md`; this snapshot preserves the point-in-time _assessment_ (the timeless requirements live in that doc; the dated scorecard lives here).

## What Were the Results

**The analysis is sound and philosophically aligned** — it is a more rigorous superset of `concept.md`, going further by naming the failure modes (Socratic-theater, cold-withholding, flattery-learning, surface-drift) that the canonical docs did not yet encode. Its one weakness: it was filed in `acceptance-testing/` but contained almost no testable gates — a requirements _source_ mis-shelved as an acceptance test. Resolved by the promotion + a derived `fidelity-criteria.md`.

**The product meets the structural floor; the qualitative ceiling is largely unguarded.** Per-axis scorecard at time of writing:

| Axis | Minimum | Good-enough | Notable gap |
| --- | --- | --- | --- |
| 1 — Inversion | ✅ structural (no injection path) | 🟡 empty-state polish (Phase 5) | — |
| 2 — Withheld fix / register | ✅ no replacement text | ❌ no guard on prescriptions / leading questions | R2.2, R2.3 unguarded |
| 3 — Temporal rhythm | ✅ settling, threshold, silence-default | 🟡 return-to-passage / explicit-done unbuilt | R3.3 partial |
| 4 — Typed taxonomy | ✅ closed list, honest classification | ✅ precision tooling strong | ❌ no explicit anti-taxonomy (R4.3) |
| 5 — Lifecycle | ✅ auto-close / dismiss / archive | 🟡 resolution = re-eval (cosmetic edit can still close) | ❌ flattery-resistant dismissal (R5.4) |
| 6 — Emotional register | 🟡 prompt asserts tone | ❌ no persona spec; discomfort = count not weight | R6.2, R6.3 unowned |

**Headline finding:** the roadmap quietly optimized the two _measurable_ tensions (precision, noise) — exactly what Phase 4 did well — and left the three _qualitative_ ones (flattery-resistance, anti-taxonomy, register/tone) unscheduled. That is the same "easy axis crowds out the hard axis" drift the document warns about, happening at the roadmap level.

## Observations and Ideas for the Future

The three gaps were triaged into scheduled work rather than left to rot:

- **Flattery-resistant dismissal (R5.4)** — the product's defining counter-positioning, and the highest-leverage gap. Suppression is currently `(type, span)`-keyed, so dismissing a true `contradiction` can silence the category. → `philosophy_guardrails.md` G1, **Phase 4**.
- **Explicit anti-taxonomy (R4.3)** — the closed list excludes surface nits structurally, but the explicit negative list the doc calls for (and a fixture to enforce it) didn't exist. → `philosophy_guardrails.md` G2, **Phase 4**.
- **Register / tone discipline (R2.2–R2.4, R6)** — no rule bans leading questions; no persona shapes the prompts. → `philosophy_guardrails.md` G3 (structural) + `emotional_register.md` (felt-tone), **Phase 4/5**.
- **Discomfort-budget ceiling (R6.3)** — the contradiction floor exempts contradictions from the budget, so many hard items can land at once. → `philosophy_guardrails.md` G4, **Phase 5**.

**Genuine strengths to preserve:** the precision-first tooling (ratchet + budget + aggregation + jargon allow-list) is a faithful answer to tensions #1–#2; the `strategic_tension` split is textbook honest classification; the settling/silence behavior meets the §3 minimum and most of good-enough.

## Doc changes made this session

Promoted source → `docs/product-requirements.md`; derived gates → `docs/acceptance-testing/fidelity-criteria.md`; guardrails absorbed into `docs/features.md` (_Anti-taxonomy_, _Register discipline_, _Dismissal should teach_, _Emotional register_) and `docs/architecture.md`; two project specs created (`philosophy_guardrails.md`, `emotional_register.md`) and scheduled into `docs/plan.md` Phase 4/5; light pointer added to `CLAUDE.md`.
