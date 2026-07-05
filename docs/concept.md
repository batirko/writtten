# Concept

> The _why_. Read `docs/features.md` for the _what_, `docs/architecture.md` for the _how_, and `docs/product-requirements.md` for the **fidelity bar** — the tiered requirements (Minimum/Good-enough/Superb per axis) that define how faithfully this product must hold the inversion.

## The problem

Powerful AI tools and their chat interfaces have made it frictionless to offload thinking. You ask, it produces, you accept. Over time this erodes the user's own creativity, judgment, and ownership of their ideas — especially in knowledge work where _thinking_ is the job, and the written artifact is just its residue.

## The inversion

Instead of the AI producing text and the human editing it, **the human produces text and the AI reacts on the loop.** This is a _sidecar_: the user drives, doing all the writing themselves; the AI rides alongside, continuously observing and surfacing things worth noticing.

The user stays in the generative seat. The AI occupies the critic/observer seat — a role that sharpens thinking rather than replacing it.

## The governing principle: provoke, don't prescribe

The AI surfaces **observations**, never **fixes**.

- It can say _"this section contradicts your earlier claim."_
- It cannot say _"here's the corrected sentence"_ and it never offers a one-click apply.

This line is the entire product. The moment we hand over the fix, we're back to offloading the thinking, and we've built Grammarly with a philosophy slide. Withholding the fix is also cheaper to compute and easier to defend in evals (observations are checkable; rewrites are taste). The principle pays for itself technically and ethically.

## The rhythm: quiet while generating, opinionated while revising

The dangerous offloading happens during _idea formation_. So during drafting — incomplete sentences, a single half-formed paragraph — the AI stays silent. It warms up only as content settles, and it gets pointed during _revision_, when scrutiny helps instead of substitutes.

This is not just noise-reduction UX. The warm-up curve _is_ the philosophy expressed as behavior: silent when speaking would replace your thinking, vocal when it would sharpen it.

## First persona and use case

**Product Managers** (and adjacent roles) — the first persona and the design's centre of gravity.

The scope is best read as **documents people write for work**, with the PRD as the _primary, most-common_ case rather than the tight definition (scope decision, 2026-07-02 — narrowed the risk of building for one genre while the same machinery serves several). Concretely:

- PRDs and specs — the anchor case.
- Stakeholder communication and announcements; product/feature blog posts and external comms.
- Decision docs, positioning statements, strategy memos; substantial document-like work emails to colleagues.

These documents live or die on clarity, internal consistency, and completeness — exactly the properties an observer can check without writing the prose. The felt experience is a merge of _Grammarly's ambient presence_ with _a chatbot's understanding_, minus the part where either one writes for you.

**This breadth is a calibration problem, not a taxonomy explosion.** The core checks (contradiction, unclear meaning, unsupported claim, missing/underexposed topic) generalise across these genres; what must vary is _strictness and which checks apply_ — PRD-grade citation and structure expectations should not fire on a personal essay or a blog post (the field failure that surfaced this — an "I fear…" opinion flagged as an unsupported claim — is OBS-028 / OBS-023). The lever is the existing **Document Context / Stage** field, promoted to a first-class calibrator of the eval; see `docs/projects/document_type_calibration.md`. We stay lean: broaden the _framing_ and the _calibration_, not the machinery, and keep the fixed-taxonomy invariant intact.

## What it is not

- **Not Grammarly.** Grammarly's core UX is _giving you the fix_. We deliberately withhold it, and we operate at the level of meaning (claims, contradictions, coverage), not grammar.
- **Not a chatbot.** There's no prompt box where you ask the AI to do work. The AI is ambient and reactive, anchored to _your_ text.
- **Not a content generator.** It produces zero prose for the document. Ever.

## The hero capability

**Internal contradiction detection.** Grammarly can't do it; a generic chatbot won't do it unprompted; it produces a genuine "whoa" moment ("it caught something I wrote that conflicts with something else I wrote, and I went and fixed it myself"). The whole v0 demo should be built to land this single moment. See `docs/plan.md`.

## Positioning, honestly

Users take the finished text _elsewhere_ (Notion, Linear, Confluence, email). That makes us a **drafting annex**, not the user's document home — which caps long-term stickiness. Owning the _drafting moment_ is the correct wedge for v0 and we should not apologize for it. But the eventual, post-traction play is to live where users already write. We note this now so we don't over-invest in being a destination before we've earned the drafting habit.

## Stance on monetization and OSS

This is a pet project, framed as open source. **Do not design for monetization.** Keep the architecture honest and the workflows clean; if it gets traction, a model emerges naturally (the obvious one is hosted convenience / managed model access on top of an OSS core). The BYO-key design already means heavy users pay their own inference costs, which keeps a free OSS tier viable. Optimize for a tool people want to use and contribute to, not for revenue.

**OSS decided real (2026-07-05).** The _"contribute to"_ half of the success metric was long unserved, and the question of whether OSS was a real goal or decorative is now **resolved: real.** Contributor onboarding shipped — a README that pitches the inversion, `CONTRIBUTING`/`SECURITY`/`CODE_OF_CONDUCT`, issue templates (including a signal-quality false-positive/negative path that doubles as field data), and a tiered launch checklist in `docs/projects/oss_launch_readiness.md`. The remaining real-OSS debt is the contributor _depth_: the model router is still Gemini-shaped throughout (every resilience mechanism is Gemini-specific), so the three documented extension seams and a non-Gemini reference adapter are scheduled as the launch's Superb tier. → `docs/projects/oss_launch_readiness.md` · `docs/plan.md` → Phase 6 _Open-source launch_.

## Non-goals (v0–early)

- No collaboration / multiplayer editing.
- No accounts or cloud sync required to use the product.
- No mobile-native app (PWA is enough; see `docs/architecture.md`).
- No AI-authored or AI-edited document text, in any phase, ever.
- No integrations with external doc tools yet (that's the long-term expansion, not the wedge).
- No external-agent collaboration ("agent experience"). We will not expose a doc-as-shared-workspace bridge (presence/state/event-stream/edit APIs) for outside agents to co-author in, as competitors like Proof (proofeditor.ai) do — that is the AI-as-author model we invert. See `docs/snapshots/2026-06-13_competitor_proof_editor.md`.
