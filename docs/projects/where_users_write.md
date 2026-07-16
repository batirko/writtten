---
status: idea
kind: research
phases: [9]
summary: Scoping analysis for the long-term play named in docs/concept.md — living where users already write (Notion, Linear, Confluence, Google Docs, email) instead of being a drafting annex. Enumerates the five integration surfaces, what each costs against the product's invariants, the evidence that should pick one, and why nothing here is buildable before V2 answers the paste-first question.
---

# Living where users already write — scoping analysis

> `docs/concept.md` § _Positioning, honestly_: users take the finished text elsewhere, which makes writtten a **drafting annex** and caps stickiness; "the eventual, post-traction play is to live where users already write." That sentence has sat in Phase 9 as a one-line 🔴 concept. This document scopes it — not to schedule it, but so the item is a set of named options with known costs instead of a slogan. **Nothing here is a commitment; the entire analysis is downstream of evidence that doesn't exist yet** (V2, the paste-first question, traction at all).

## Status

> Canonical status lives in the frontmatter above and is mirrored in the Projects Index in `docs/plan.md`. This block carries the human-readable scope only.

**Idea — Phase 9, research-only (written 2026-07-16).** This file makes the item plannable (🔴→🟠). It deliberately produces no build spec: choosing a surface before knowing whether users even inhabit the drafting loop (V2's write-vs-paste question, `field_validation.md`) would be building the wing before the wind-tunnel run.

## Phased Plan

| Phase | Contributes                                                                                                                              |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **9** | This analysis. A build spec (a new `kind: spec` file for the one chosen surface) only after the evidence gates below fire — never all five. |

## Todo

- [ ] **Hold until the evidence gates fire** (all three): V2 shows a real drafting habit (not paste-review-leave); traction demonstrates people _return_; and at least one surface below is pulled by observed user behaviour (e.g. "I paste from Notion every session") rather than pushed by strategy.
- [ ] When a gate fires: pick **one** surface, write its dedicated spec, and record the rejected alternatives here.

## The five surfaces

What "live where users write" could concretely mean, ordered roughly cheap→expensive. The evaluation criteria against each: **anchoring fidelity** (span↔card is the product; a surface that can't anchor observations to living text loses the hero interaction), **invariant survival** (esp. #1 no-fix-affordances and #5 local-first/no-required-server), **maintenance exposure** (whose DOM/API do we now track?), and **who it serves**.

### S1 — Round-trip polish (import/export as the integration)

Lean into the annex: make the paste-in/paste-out loop so clean it *feels* integrated — rich-clipboard fidelity for Notion/Confluence/GDocs paste (the existing `canvas_content_types.md` long-tail inventory), export formats matching each destination, maybe "copy for Notion" flavors. **Costs:** nothing new architecturally; already partially shipped (`egress.md`). **Ceiling:** it doesn't change the positioning — still an annex, just a well-mannered one. **Verdict:** the default; everything below must beat it.

### S2 — Bidirectional doc sync (platform APIs, client-side)

Connect a Notion/Confluence page by URL + user token; writtten pulls the page into the editor, the user works in writtten, changes push back. Client-side is feasible (both have CORS-usable APIs with user tokens; invariant #5 survives). **Costs:** two-way sync is the hardest problem in the room (conflict resolution against concurrent platform edits; block-model impedance — Notion blocks ≠ ProseMirror nodes ≠ sections); per-platform API churn forever. **Fit note:** the persona *finishes* in these tools but the value writtten adds is during drafting — sync mostly buys "no final paste", a small win for enormous machinery. **Verdict:** poor value unless V2 shows the final-paste step is where the habit dies.

### S3 — Browser extension (observation overlay on their editor)

The feed rides alongside Notion/GDocs/Confluence in situ: a content-script reads the page's text, runs the existing eval pipeline (BYOK, all client-side), and renders cards in a side panel — spans highlighted in *their* editor. This is the only surface that genuinely relocates the ambient companion. **Costs:** anchoring against a DOM we don't own (three hostile, churning contenteditable implementations — the position-mapping machinery TipTap gives us for free does not exist there; this is the single biggest technical risk); extension-store review + platform ToS exposure; per-host adapters that rot. **What transfers:** evaluator, ledger, router, feed logic are all UI-independent modules today — the port is the *anchoring and editor-integration layer only*. **Verdict:** the honest embodiment of the play, and the most expensive; needs a dedicated feasibility spike (can we anchor durably in Notion's DOM at all?) before any spec.

### S4 — Platform-native apps (Confluence Forge, Notion integration surface, GDocs add-on)

Same idea as S3 but through each platform's sanctioned extension point. **Costs:** N platforms × N frameworks; most sanctioned surfaces are sidebars with *plain-text* access and no decoration API (the span↔card link dies → the product reduces to "list of comments", which is Grammarly-without-the-fixes); some require hosted components (breaks invariant #5). **Verdict:** dominated by S3 in fidelity and by S1 in cost; likely never.

### S5 — The agent as the courier (compose with `agent_connected_eval.md`)

Inverted integration: the user's agent (which already has Notion/Linear/email access via MCP or its own tooling) pulls the doc from where it lives and brings it to writtten — or runs writtten's checks where the doc lives. No writtten-side platform code at all. **Costs:** serves only agent-native users; the observation-quality trust question from the agent-connected spec applies. **Verdict:** cheapest path to "works with everything", worth noting as the bridge spec's second-order payoff, not a plan of its own.

## The fork this shares with Tauri

`docs/architecture.md` § _Local-app evolution path_ names the strategic fork: **optional desktop wrapper** (local-power-user wedge) vs **living where users write** (embedded-everywhere wedge). They compete for the same "what does writtten grow into" slot and the same maintenance budget. The deciding evidence is the same V2 signal read in opposite directions: strong *drafting-destination* behaviour favors the desktop/annex identity (S1 + Tauri); strong *paste-first* behaviour says the value must travel to the text (S3/S5) because users won't move to it.

## Non-goals (inherited, non-negotiable on every surface)

- No fix-application affordances on any host surface — an extension side panel must refuse the "apply" button even where the host platform's idiom expects one.
- No required writtten server; tokens and evaluation stay client-side.
- No collaboration/multiplayer semantics — integrating with a multiplayer doc ≠ becoming a multiplayer participant (the same line `agent_connected_eval.md` holds against co-authoring).
