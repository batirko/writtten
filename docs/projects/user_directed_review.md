---
status: idea
kind: spec
phases: [8]
summary: Make the agent-connected engine user-directable — batch review passes as a steerable conversation (in-taxonomy, skill-level) and user-requested custom lenses ("find where my text sounds AI-written") as one parameterized `user_lens` observation type — without opening the taxonomy or weakening the register boundary.
---

# User-directed review (steering + lenses)

> **What this is.** BYOA (`agent_connected_eval.md`) shipped the agent as an alternative engine with the same interaction model the API path had: the app pushes snapshots, the agent reviews, typed observations land in the feed. But an agent session is not just a different pipe — it is a **conversation the user is already in**. The user can say "assess the recent changes," "this pass, check whether the metrics section holds up," or "find all the instances where my text sounds AI-written." This spec makes that user-direction a designed capability instead of an accident, in two halves with very different risk profiles: **steering** (focus requests within the existing taxonomy — nearly free, skill-level only) and **lenses** (user-defined things to look for that no current type admits — touches hard invariant #2 and needs a real design pass).
>
> **What this is not.** Not a loosening of "provoke, don't prescribe." In both halves the agent still only *locates* — the register lint stays a hard reject, the protocol still has no edit/suggestion message, and the product still never *volunteers* anything in the anti-taxonomy. And not a resurrection of the source chip removed by engine exclusivity — lens attribution ("you asked for this") is a different fact than engine attribution, and only the former appears on a card face.

## Status

**Idea — direction settled in an owner ideation session 2026-07-20; not yet built.** Scheduling settled with the owner the same day: the **steering half is folded into the existing prompt-rework milestone** ("Slim the connect prompt", `docs/plan.md` Phase 8) — both rewrite the same artifact, so one rewrite carries both — and that **combined rework waits for the `user_lens` design pass**, so the skill is rewritten exactly once with steering *and* lens guidance included. Accepted consequence (owner call over the alternative of keeping the rework unblocked): the lens design pass joins the pre-spike path, since the rework gates the spike's first impression. The `user_lens` *build* still follows engine exclusivity. This file's own plan milestone is the `user_lens` one (🟠 — design decisions remain: lens declaration flow, kind/priority mapping, per-lens budget, archive semantics); steering has no standalone milestone.

Read alongside:

- `docs/projects/agent_connected_eval.md` — the boundary this extends (`externalObservations.ts` pipeline, the skill, engine exclusivity). Everything here enters through that boundary.
- `docs/features.md` § *Anti-taxonomy* / § *Register discipline* / § *Dismissal should teach* — the philosophy lines this spec is careful with; the analysis below states exactly which line moves and which cannot.
- `docs/projects/philosophy_guardrails.md` — G1 (flattery-resistant dismissal) is deliberately *not* applied to lens cards; the argument is below.

## Phased Plan

| Phase | Contributes                                                                                                                                                                             |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **8** | Ordering settled 2026-07-20 (owner): `user_lens` design pass → the combined prompt rework (slim + steering contract + lens skill guidance, delivered by the "Slim the connect prompt" milestone) → `user_lens` build (after engine exclusivity). |

## Todo

Phase 8 — `user_lens` design pass (first — the prompt rework waits on it, owner call 2026-07-20):

- [ ] Resolve the open decisions with the owner: lens declaration flow (§ below), kind/priority mapping, per-lens budget + grouping, archive/closure semantics, mute gesture — enough to know what lens guidance the rewritten skill must carry.

Phase 8 — steering (rides the prompt-rework milestone; no standalone plan item):

- [ ] Steering contract in the rewritten skill's URL-hosted guidance layer: user focus requests are legitimate and expected; all resulting submissions stay inside the 9-type taxonomy and the register rules; steering narrows attention, never widens the output contract.
- [ ] One machine-validated worked example in `agentSkillExamples.test.ts` — a steered pass ("focus on whether the metrics hold up") yielding an in-taxonomy, register-clean submission.

Phase 8 — `user_lens` build (after the design pass; follows engine exclusivity):
- [ ] Extend the type enum with `user_lens` + required lens label; thread through `externalObservations.ts` (validation), `db.ts` (schema), `priority.ts` (`KIND_BY_TYPE`), feed rendering (lens on the card face), `feedBudget.ts` (grouped, not card-by-card competition), suppression (mute-the-lens).
- [ ] Skill section teaching the agent when `user_lens` is admissible (only for an explicit user request, label = the user's own words) with validated ✅/❌ examples.
- [ ] Adversarial fixtures in `externalObservations.test.ts`: lens submissions that prescribe (reject), lens used to smuggle volunteered style commentary without a user request (whatever the declaration flow makes detectable), lens flooding vs the budget.

## Design

### The philosophy analysis (why this is compatible, stated precisely)

The taxonomy does three jobs at once, and only one is philosophical: (1) **philosophy fence** — no slot for grammar/style nits, so the anti-taxonomy is enforced structurally; (2) **quality fence** — no free-form LLM chatter; (3) **feed semantics** — each type carries kind, priority, suppression scoping, lifecycle. Fully opening the enum breaks all three. But the use case doesn't need an open enum, because of a distinction the philosophy already contains:

- **The anti-taxonomy governs what the product *volunteers*.** "Never surface grammar/style/surface nits" is a promise about unsolicited critique. It is a positioning asset precisely because the product holds it without being asked.
- **"Provoke, don't prescribe" governs who does the thinking.** When the user says "find where my text sounds AI-written," *the user did the thinking* about what matters. The agent locates instances. As long as the resulting notes locate ("this passage has the hallmark parallel-clause cadence") and never prescribe ("rewrite this to sound natural"), the register is intact.

So the load-bearing invariant is the **register**, not the closed enum per se — the enum was always the *mechanism*, the register the *principle*. The BYOA boundary already made exactly this bet ("hold the boundary, not the agent"); lenses extend it one notch: the *topic* of an observation becomes user-defined while its *form* stays fully constrained.

What cannot move, ever: the register lint as a hard reject, the absence of edit/suggestion messages in the protocol, and the product volunteering anti-taxonomy content on its own initiative.

### Half 1 — steering (in-taxonomy, skill-level, nearly free)

The user talks to their agent in their own session; writtten cannot see that conversation and should not want to. Steering therefore needs **zero product change** — the agent already can focus a pass; everything it submits still squeezes through the nine types and the lint. The 2026-07-20 dogfood session showed the underlying faculty is real: the agent retracted its own `missing_topic` when the author added metrics — comprehension-based lifecycle the built-in pipeline lacks. Steering is the same faculty pointed forward.

The only work is making the skill *legitimize* it, because the shipped skill documents only the default loop and watch mode — an agent receiving a mid-session focus request has no contract language telling it how to honor the request without drifting (the failure mode: treating "focus on X" as license for free-form commentary or out-of-taxonomy submissions). One short section: steering is expected; it narrows attention; it never widens the output contract. Plus one machine-validated example, because `agentSkillExamples.test.ts` is the established guard against the skill teaching phrasings the boundary rejects.

**Delivery vehicle (settled 2026-07-20, owner): the prompt-rework milestone** ("Slim the connect prompt", `docs/plan.md` Phase 8), not a standalone item — both edit the same artifact, and the rework's own design rule (e) resolves the size tension cleanly: guidance whose violations self-correct through boundary rejections moves to the URL-hosted layer, and steering drift (an agent treating "focus on X" as license for out-of-taxonomy submissions) is exactly such a violation. So the steering contract lives behind the URL and costs the paste-prompt nothing.

Also worth saying plainly (it belongs in any future positioning copy): pull-based, user-invoked review is *more* aligned with invariant 4 (quiet while generating) than polling — the user invoking a pass is the strongest possible signal they are revising, not forming ideas.

### Half 2 — `user_lens` (parameterize the taxonomy, don't loosen it)

One new type, `user_lens`, whose required **lens label is user data** — the user's own words for what to look for ("sounds AI-written", "assumes the reader knows our org chart", "claims that would embarrass us in front of legal"). The enum stays closed; what opens is a parameterized slot inside it. Design consequences that keep it honest:

- **The card face names the lens.** "You asked for this" is what keeps the anti-taxonomy claim true — the product still never volunteers style observations; it only answers when asked — and it firewalls trust: a bad lens result discredits *that lens*, not the core feed. This is lens attribution, not engine attribution; it does not resurrect the chip engine exclusivity removed.
- **Register lint unchanged and hard.** A lens observation locates. "Rewrite this to sound more natural" is rejected exactly as it is today, whatever the lens says.
- **Dismissal mutes the lens wholesale.** Muting a lens is just retracting your own request — G1's flattery-resistance machinery exists to protect *unsolicited uncomfortable truths* from being trained away, and deliberately does not apply to solicited searches. This makes lens dismissal *simpler* than core dismissal, not harder.
- **Lens results group under their lens** rather than competing card-by-card for top-N feed slots — twenty-five "sounds AI-written" hits must not drown the one `contradiction` card. Per-lens budget TBD at the design pass (the BYOA per-source budget of 25 active is the precedent).
- **Anchoring, lifecycle, archive:** unchanged — `anchorText` resolution, auto-close on span deletion, archive with closure reasons all apply as to any external observation.

**The main open design decision — lens declaration flow.** Two candidate shapes, to be resolved with the owner before build:

1. **Agent-asserted:** the agent supplies the lens label per submission; the app displays it. Simplest — the whole agent channel is user-driven anyway — but the "user asked" claim is agent-asserted, and a pushy agent could volunteer lenses the user never requested. Containment: the label is visible on every card and mute-the-lens kills the whole stream, so abuse is legible and one gesture from gone.
2. **App-declared:** the user declares lenses in writtten (a field near the connect section), baked into the personalized prompt; the boundary rejects lens labels it didn't issue. Stronger provenance, but adds UI + pairing-state surface at exactly the moment the settings screen is being reworked, and it moves the conversation out of the agent session where it naturally lives.

Secondary open decisions: `kind`/priority mapping for `KIND_BY_TYPE` (likely `opportunity`-class, never floored, priority capped low), whether a lens survives across passes/sessions, and closure semantics on revoke.

### The reframe underneath (record it so the copy decision is conscious)

Engine exclusivity (2026-07-20) framed the agent as "the fourth connection option — same slot as a key." This spec implicitly says something in tension with that: the agent is also a **different interaction paradigm** — steerable, conversational, comprehension-based. Both are true (the *plumbing* occupies the engine slot; the *experience* differs), and product copy will eventually have to pick which story leads. Two consequences:

- `user_lens` would be the first capability the agent engine has that keys don't — real differentiation for the agent-native audience ("your agent, your lenses" is a story Grammarly structurally cannot tell), but also the first asymmetry between engines.
- It doesn't have to stay agent-only: a lens is a user-authored prompt fragment, and the built-in evaluator could run one as an additional check someday. The honest sequencing is **pilot in agent mode**, where the user's own steering makes provenance transparent and expectations arrive appropriately uncalibrated, and **generalize to key mode only if it earns it**. Until then key-mode lenses are a non-goal, not a promise.

### Perception risk (name it now, not after the spike)

The moment lens results can be style-shaped, "writtten does style checking now" becomes a possible reading — and the anti-taxonomy is a positioning asset, not just an internal rule. Mitigation is the same honesty pattern the /agent page already uses: the lens label on the card face, and page language of the shape "your agent will look for whatever you ask it to; writtten's own checks never touch style." If lens work ships near GTM material, the copy must keep "we never volunteer style critique" and "you can ask your agent for anything" visibly distinct claims.

## Non-goals

- **No open type enum.** Agents never invent types; `unknown_type` keeps rejecting everything outside the closed list. `user_lens` is one parameterized slot, not a door.
- **No register exceptions.** No lens earns prescriptive phrasing, leading questions, rewrites, or apply affordances — the lint is identical for every type.
- **No volunteered anti-taxonomy content.** The product's own checks never surface grammar/style/surface nits, with or without this feature. A lens is an answer to a question the user asked.
- **No key-mode lenses in this scope.** Agent-engine-first; generalization is a separate future decision gated on the pilot earning it.
- **No lens marketplace / sharing / presets.** A lens is the user's own words for their own document. Curated lens libraries are exactly the path back to a settings dashboard.
