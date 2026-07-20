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

**Idea — direction settled in an owner ideation session 2026-07-20; design pass completed the same day; not yet built.** Scheduling settled with the owner: the **steering half is folded into the existing prompt-rework milestone** ("Slim the connect prompt", `docs/plan.md` Phase 8) — both rewrite the same artifact, so one rewrite carries both — and that **combined rework waited on the `user_lens` design pass**, so the skill is rewritten exactly once with steering *and* lens guidance included. Accepted consequence (owner call over the alternative of keeping the rework unblocked): the lens design pass joined the pre-spike path, since the rework gates the spike's first impression.

**The design pass is done (2026-07-20).** Every open decision is resolved in § _Settled design_ below, and § _What the rewritten skill must carry_ states exactly what lens guidance the rework has to include — **the prompt rework is unblocked.** The plan milestone re-rated 🟠 → 🟢 accordingly. The `user_lens` *build* still follows engine exclusivity; steering has no standalone milestone.

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

- [x] Resolve the open decisions with the owner: lens declaration flow, kind/priority mapping, per-lens budget + grouping, archive/closure semantics, mute gesture — enough to know what lens guidance the rewritten skill must carry. **Done 2026-07-20** → § _Settled design_, § _What the rewritten skill must carry_.

Phase 8 — steering (rides the prompt-rework milestone; no standalone plan item):

- [ ] Steering contract in the rewritten skill's URL-hosted guidance layer: user focus requests are legitimate and expected; all resulting submissions stay inside the 9-type taxonomy and the register rules; steering narrows attention, never widens the output contract.
- [ ] One machine-validated worked example in `agentSkillExamples.test.ts` — a steered pass ("focus on whether the metrics hold up") yielding an in-taxonomy, register-clean submission.

Phase 8 — `user_lens` build (after the design pass; follows engine exclusivity). Full file-level detail in § _Implementation touch list_:
- [ ] Extend the type union with `user_lens` (`db.ts`) and the boundary's type set + field allowlist (`externalObservations.ts`), with the lens label required iff the type is `user_lens` and rejected on any other type.
- [ ] `priority.ts`: `TYPE_PRIOR` → `low`, `KIND_BY_TYPE` → `opportunity`. `evalScorer.ts` `PRECISION_FLOORS` needs an entry (structurally unreachable — comment it).
- [ ] `registerLint.ts`: `user_lens` must reach the `claim-index` and `section-number` rules, plus adversarial rows in `register-lint-corpus.ts`.
- [ ] `evaluatorAnchoring.ts`: `user_lens` joins the span-only suppression set.
- [ ] Card face renders the lens label, not the raw type name (`SidecarFeed.tsx`); lens label added to the agent snapshot allowlist (`agentSnapshot.ts`) and kept **out** of the debug export.
- [ ] Skill section teaching the agent when `user_lens` is admissible (only for an explicit user request, label = the user's own words) with validated ✅/❌ examples — see § _What the rewritten skill must carry_.
- [ ] Adversarial fixtures in `externalObservations.test.ts`: a lens submission that prescribes (reject), a lens label on a non-lens type (reject), a `user_lens` with no label (reject), an oversized label.
- [ ] New invariant test: no built-in eval path can emit `user_lens` (see § _Perception risk_, risk 3).
- [ ] Update `docs/mechanics/agent-bridge.md` in the same task — the span-only suppression change is a documented-lifecycle change.

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
- **Anchoring, lifecycle, archive:** unchanged — `anchorText` resolution, auto-close on span deletion, archive with closure reasons all apply as to any external observation.

### Settled design (design pass, 2026-07-20 with the owner)

| Decision | Resolution | Why |
| --- | --- | --- |
| **Lens declaration** | **No registry.** The agent asserts the lens label on each submission; writtten stores no lens list. The boundary sanitizes and length-caps it. | Keeps "declare it once, it runs every pass" in the agent's own memory, where the conversation already lives. Adds no settings surface — which mattered concretely: engine exclusivity was rewriting that screen the same week. And with nothing stored, the "no lens marketplace / presets" non-goal below is **structurally true** rather than a promise we have to keep. Rejected alternative — app-declared labels baked into the personalized prompt, with the boundary rejecting any label it didn't issue: stronger provenance, but it buys that with a pairing-state UI surface and moves the request out of the conversation where it naturally belongs. |
| **Scope** | **Span and document both.** No lens-specific scope rule. | Some lenses are genuinely document-shaped ("claims that would embarrass us in front of legal" may sit on no single sentence). The rejected alternative — span-only, on the reasoning that a search returns *locations* and a whole-document lens is a verdict — would have made "locate, don't prescribe" mechanically true instead of a matter of phrasing. Its cost is recorded honestly as risk 1 under § _Perception risk_. |
| **`kind`** | `opportunity`. | A lens is an answer to a question the user asked, not a defect the product asserts. `problem` would make writtten's own severity vocabulary declare a style hit a problem — the anti-taxonomy perception risk, self-inflicted. `reflection` is filtered out of the feed entirely (`feedBudget.ts`) and would render lens cards invisible. |
| **Priority** | `TYPE_PRIOR.user_lens = "low"` → priority **0.75**, tied with the low-severity built-ins. | Needs no branch in `computePriority` — the default confidence path already yields exactly 0.75. The **downward-only external clamp** still applies, so an agent can quiet its own lens card but can never amplify it. Rejected alternative — 0.5, ranking lenses strictly below every built-in so a solicited search is purely additive: safer for the feed, but it buries results the user explicitly asked for on any busy document. |
| **Feed presence** | **A card per hit.** No per-lens grouping, no per-lens budget, no new feed object. | See revision **R1**. |
| **Dismissal** | `user_lens` joins the **span-only** suppression set (`isSpanSuppressed`). Dismissing one hit suppresses that span; other hits stay and keep arriving. | See revision **R2**. |
| **Cross-pass persistence** | Falls out of "no registry": lens labels are per-submission data; lens cards are ordinary observations with ordinary lifecycle. Nothing persists a lens *itself*. Whether a lens runs again next pass is a fact about the agent's own memory — which writtten neither sees nor should. | |
| **Closure on revoke** | **No special case.** Lens cards are external observations; `archiveExternalSource` closes them as `source_revoked` like any other. No new closure reason, so no new `closureLabel.ts` entry to forget. | |
| **Verdict containment** | **Skill guidance only, no boundary teeth.** | Consistent with the standing decision that the type enum, not `lintRegister`, carries the anti-taxonomy. A lens-scoped style-adjective lint rule would sit on a genuinely fine line and risks rejecting the natural phrasing of the flagship lens itself — the over-rejection failure mode the lint corpus exists to prevent. The cost is risk 1 below. |

#### Two decisions from earlier the same day are revised

Both lines were settled in the 2026-07-20 ideation session and superseded by the design pass hours later. They are recorded as arcs rather than overwritten, because a plan entry is a living record and a later reader needs to see that the earlier position was considered and why it moved.

**R1 — Decided 2026-07-20 → Revised 2026-07-20: "lens results group under their lens rather than competing card-by-card" is dropped.** It was adopted to stop twenty-five "sounds AI-written" hits drowning the one `contradiction` card. Reading `feedBudget.ts` during the design pass showed **that concern was already met by machinery that exists**: `partitionFeed` gives the top `CONTRADICTION_CEILING` (3) contradiction groups a *floor* — they are allocated slots **before** the remaining budget is filled by anything else. A contradiction cannot be displaced by lens hits at any volume. The grouping rework would have bought protection already present, at the cost of a genuinely new grouping axis: `obsAggregation`'s key is span-identity based (`blockId:start:end:session`) and structurally cannot express "same lens, different spans."

> **The follow-up question this raises, asked and settled 2026-07-20 (owner):** with grouping dropped and several lenses running, can the user tell which lens a card belongs to? **Per card, yes** — every lens card carries the `lens` chip and its label in the header, which is the scanning slot. What is deliberately *not* provided is a per-lens overview ("your AI-written lens found 12 things"): lens cards interleave with everything else in document order within their band, so answering "what did that lens find" means reading the feed. A lens summary line above the band was considered and **declined** — the per-card label is enough, and a summary line starts rebuilding the grouping concept by another name. Note this is a second, independent reason grouping was examined; R1 above dismissed it only on the drowning argument, and legibility is the other axis it was checked against.

**R2 — Decided 2026-07-20 → Revised 2026-07-20: "dismissal mutes the lens wholesale" is dropped.** A lens card is dismissed like any other card — that hit goes, the rest stay. **Read the mechanism carefully, because it is easy to misread:** `user_lens` joins the span-only suppression set, which is the branch otherwise reserved for high-severity defects and `contradiction`. That is **not** an application of G1 flattery-resistance — the argument above, that G1 deliberately does not govern solicited searches, still stands. The reason is different: each lens hit is its own finding at its own location, and today's default suppression is keyed on **type alone**, so a single dismissal would silence *every* lens at once, not the one the user was tired of. The mechanism coincides with G1's; the reason does not.

**The through-line in both revisions is the design's best property: `user_lens` adds a _type_, not a _subsystem_.** No new feed object, no new budget axis, no new closure reason, no new mute gesture, no DB migration. That is what makes it a parameterized slot rather than a door.

### Implementation touch list

Verified against the tree at 2026-07-20. Grouped by whether the compiler catches an omission — the middle group is where a build session silently gets it wrong.

**Compiler-enforced** (exhaustive `Record<Observation["type"], …>` — omission fails `tsc`):

- `src/store/db.ts` — add `user_lens` to the `Observation["type"]` union.
- `src/services/priority.ts` — `TYPE_PRIOR` → `"low"`; `KIND_BY_TYPE` → `"opportunity"`.
- `src/services/evalScorer.ts` — `PRECISION_FLOORS` needs an entry. It is structurally unreachable (the built-in pipeline can never emit `user_lens`); match the lowest existing floor and say so in a comment.

**Silent-default sets** (no compiler help — omitting one changes behaviour quietly):

- `src/services/externalObservations.ts` `OBSERVATION_TYPES` — add it. The `unknown_type` hint enumerates the set at runtime, so the teaching text self-updates.
- `src/services/externalObservations.ts` `ALLOWED_FIELDS` — add the lens-label field. **Required iff `type === "user_lens"`, rejected on every other type**, both as `malformed` inside `parseSubmission`. Handling it there rather than as a new stage keeps the frozen 8-stage order and the frozen `RejectionCode` vocabulary untouched — a field-presence rule conditional on another field is exactly what `malformed` already covers. Sanitize and cap the label following `sanitizeSourceName`; ~60 chars clears this spec's own example labels with room to spare while stopping a label becoming a second body of prose on the card face.
- `src/services/registerLint.ts` `DOC_LEVEL_TYPES` / the `indexLeakTypes` test — `user_lens` **must** reach the `claim-index` and `section-number` rules. This is required, not optional: document scope is allowed, so a lens card can leak `§3` or `claim [2]` exactly as the doc-level types can. Add adversarial rows to `register-lint-corpus.ts` per that file's rule of the road.
- `src/services/evaluatorAnchoring.ts` — `user_lens` joins the `isSpanOnly` suppression test (R2).

**Deliberately not touched** — decisions, not omissions:

- `DOC_GAP_TYPES` (`priority.ts`) — no maturity escalation; a solicited search does not get more urgent because the draft matured.
- `CROSS_CLAIM_TYPES` (`anchorExcerpt.ts`) — verbatim quote is the right excerpt treatment for a located hit.
- `CONFLICT_TYPES` (`evalScorer.ts`) and the three inline kind-derivation sites in `evaluator.ts` — `user_lens` is agent-only; the built-in evaluator can never emit it.
- **DB version** — no bump, no migration. `Observation.source` set the precedent for an optional additive field on this exact record.

**Surfaces:**

- `src/sidecar/SidecarFeed.tsx` — the card face today renders the raw enum name (`tag-${primary.type}`, underscores → spaces), which would read as "user lens". `user_lens` needs a branch rendering **the lens label** behind a fixed `lens` chip, so it cannot masquerade as a built-in type. Keep `data-obs-type="user_lens"` for test targeting. **The label must truncate on the card face** — `.tag` is `white-space: nowrap` and shares a fixed header row with the severity badge and the dismiss control, so a label near the 60-char cap overflows it. Render the label as a sibling of the `lens` chip with `overflow: hidden; text-overflow: ellipsis` and the full label on `title`; the cap governs stored data, the header governs what is visible. Verified against a mockup of the real card at feed width: two lenses running stay distinguishable card-by-card, with longer labels visibly cut.
- `src/services/agentSnapshot.ts` `AGENT_OBSERVATION_FIELDS` — add the lens label, so the next pass can tell which active cards came from which lens; duplicate-avoidance depends on it. The allowlist's "never widens" test updates with it.
- `src/model/logger.ts` debug export — the lens label is **user text** and must stay out, consistent with the export's standing "no observation text and no document content" rule.
- `docs/mechanics/agent-bridge.md` — the span-only suppression change is a documented-lifecycle change; that file's own header contract requires updating it in the same task. Note its "dismissal is deliberately source-blind" paragraph stays true: this suppression keys on type and span, never on source.

**Test gates that will fail until updated:**

- `src/services/agentSkillExamples.test.ts` asserts the skill's taxonomy table has exactly **9** rows — a hardcoded literal a 10th row breaks.
- The same file lints every taxonomy example: a new lens row needs a register-clean, ≤240-char example.
- New adversarial fixtures in `externalObservations.test.ts`: a lens submission that prescribes; a lens label on a non-lens type; a `user_lens` with no label; an oversized label.
- New invariant test: no built-in eval path can emit `user_lens` (§ _Perception risk_, risk 3).

### What the rewritten skill must carry

The prompt rework ("Slim the connect prompt") waited on this section. It is the complete lens brief — enough to write the guidance without reopening any decision above:

- `user_lens` is admissible **only** in response to an explicit user request. The label is the user's own words, verbatim — not the agent's paraphrase and not a category the agent invented.
- Both scopes are allowed; the usual `anchorText` rule applies to span hits.
- The register rules are **identical to every other type**. No lens earns prescriptive phrasing, leading questions, or a rewrite.
- The distinction the worked examples must teach, because nothing in the boundary enforces it: **name what you found; don't deliver a verdict.** "This passage runs on parallel clauses and em-dash rhythm" locates. "This paragraph sounds AI-written" is a verdict on the work.
- At least one ✅ and one ❌ lens example in the taxonomy table, machine-validated by `agentSkillExamples.test.ts`.

Per the rework's own design rule (e), lens guidance belongs in the **URL-hosted layer**, not the pasted prompt: lens drift produces boundary rejections that teach on demand, which is precisely the class of guidance rule (e) moves behind the URL. The documented exception to rule (e) — document-type calibration cannot move, because a miscalibrated-but-register-clean observation is *accepted* and therefore has no feedback channel — does not apply here.

### The reframe underneath (record it so the copy decision is conscious)

Engine exclusivity (2026-07-20) framed the agent as "the fourth connection option — same slot as a key." This spec implicitly says something in tension with that: the agent is also a **different interaction paradigm** — steerable, conversational, comprehension-based. Both are true (the *plumbing* occupies the engine slot; the *experience* differs), and product copy will eventually have to pick which story leads. Two consequences:

- `user_lens` would be the first capability the agent engine has that keys don't — real differentiation for the agent-native audience ("your agent, your lenses" is a story Grammarly structurally cannot tell), but also the first asymmetry between engines.
- It doesn't have to stay agent-only: a lens is a user-authored prompt fragment, and the built-in evaluator could run one as an additional check someday. The honest sequencing is **pilot in agent mode**, where the user's own steering makes provenance transparent and expectations arrive appropriately uncalibrated, and **generalize to key mode only if it earns it**. Until then key-mode lenses are a non-goal, not a promise.

### Perception risk (name it now, not after the spike)

The moment lens results can be style-shaped, "writtten does style checking now" becomes a possible reading — and the anti-taxonomy is a positioning asset, not just an internal rule. Mitigation is the same honesty pattern the /agent page already uses: the lens label on the card face, and page language of the shape "your agent will look for whatever you ask it to; writtten's own checks never touch style." If lens work ships near GTM material, the copy must keep "we never volunteer style critique" and "you can ask your agent for anything" visibly distinct claims.

**Four residual risks the design pass accepted rather than solved.** Recorded here so the pilot knows what to watch, and so nobody later reads them as oversights.

1. **A whole-document style verdict is register-clean today.** `registerLint`'s copula-verdict rule deliberately excludes surface-style adjectives (`verbose`, `wordy`, `passive`, `clunky`), on the documented reasoning that *"the anti-taxonomy is enforced by the fixed Observation type enum — no type admits a surface nit — NOT by this lint"* — and that exclusion is pinned by a test. **`user_lens` is the first type that does admit style, so the premise no longer fully holds.** Combined with document scope, "This document reads verbose" passes the lint. Containment is the lens label on the card face, the skill's worked examples, and dismissal — none of them enforcement. This is the direct cost of two choices above (document scope allowed; no boundary teeth) and it is the first thing the pilot should look at.
2. **Lens hits can displace built-in low-severity cards.** At 0.75 a lens ties exactly with `clarity` / `undefined_jargon` / `underexposed_topic` / `audience_mismatch` / `structure_flow`, and ties break on load order — so a lens returning many hits can push those into the overflow drawer. Contradictions (protected by the floor, see R1) and the medium-severity types are unaffected, so the *severe* drowning case is closed; this is the residual one.
3. **The strongest anti-taxonomy mitigation is structural, and should be a test.** writtten's own evaluator can never produce a `user_lens` — the type appears in no evaluator prompt and no built-in eval path. That makes "we never volunteer style critique" a fact about the code rather than a claim about intent, which is exactly the kind of assertion worth pinning: **add an invariant test asserting no built-in eval path emits `user_lens`.** GTM copy can then lean on it.
4. **Lens attribution on the card face is not a resurrection of the source chip.** Engine exclusivity removed the chip that named *which engine* produced an observation. Naming *which search the user asked for* is a different fact serving a different purpose, and it appears on lens cards only — built-in cards gain nothing. A later reader finding a label on a card face should not read it as a reversal of that decision.

## Non-goals

- **No open type enum.** Agents never invent types; `unknown_type` keeps rejecting everything outside the closed list. `user_lens` is one parameterized slot, not a door.
- **No register exceptions.** No lens earns prescriptive phrasing, leading questions, rewrites, or apply affordances — the lint is identical for every type.
- **No volunteered anti-taxonomy content.** The product's own checks never surface grammar/style/surface nits, with or without this feature. A lens is an answer to a question the user asked.
- **No key-mode lenses in this scope.** Agent-engine-first; generalization is a separate future decision gated on the pilot earning it.
- **No lens marketplace / sharing / presets.** A lens is the user's own words for their own document. Curated lens libraries are exactly the path back to a settings dashboard.
