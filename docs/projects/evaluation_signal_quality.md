---
status: done
phases: [1, 2, 3]
summary: Signal-to-noise findings from a real PRD paste-test — heading-only blocks hallucinate, the ledger self-pollutes, free-tier "strong" checks run on a weak model and emit confident false contradictions, and observations duplicate; with a prioritized remediation plan.
---

# Evaluation Signal Quality

## Status

> Canonical status lives in the frontmatter above and is mirrored in the Projects Index in `docs/plan.md`. This block carries the human-readable scope only.

**Status: `done`** (remediated 2026-06-03 as the signal-quality half of Chunk 1). This captures a real test session (2026-06-02) and the fixes applied to the **eval pipeline quality** delivered across Phases 1–3. The single product bet — _"provoke thinking by surfacing trustworthy observations"_ — depends on signal-to-noise; this doc defends that bet. Implementation lives in `src/services/evaluator.ts` (meta-claim guard, defined-terms dedup, `unsupported_claim` carve-out, observation content-dedup, tier-calibrated contradiction prompt, doc-level dirty-check), `src/model/gemini.ts` (per-request timeout), and the section redesign (`docs/projects/section_as_eval_unit.md`) which resolves Finding 1 structurally.

Nothing here changes the taxonomy or adds fix-application affordances. It is purely about making the existing observations **correct and non-redundant**.

## Phased Plan

This is remediation against work already shipped, so it does not introduce a new plan phase. It maps to the phases whose deliverables it touches:

- **Phase 1** (block eval, claim ledger, contradiction) — heading-only blocks, ledger pollution, false contradictions.
- **Phase 2** (full taxonomy) — `unsupported_claim` misfiring on goals/targets; cross-type duplicate observations.
- **Phase 3** (model tiering, free-tier cost) — "strong" tier collapsing to `flash-lite` on the free tier, and its quality consequences.

Recommend scheduling **P1/P2 correctness fixes before further Phase 4 work**, because every Phase 4 demo (import a draft → see the feed) inherits this noise.

## Todo

**Tier A — correctness (do first; kills most false observations):**

- [x] ~~Skip or merge heading-only blocks so a bare heading is never evaluated in isolation.~~ → resolved structurally by `docs/projects/section_as_eval_unit.md` (combined heading+body is always the eval input). → §Finding 1
- [x] Stop extracting document meta-claims ("This document is a PRD") into the claim ledger. → `isDocumentMetaClaim` filter + prompt instruction in `evaluator.ts`. → §Finding 2
- [x] De-duplicate the "Defined terms" list before it enters the per-section prompt. → `[...new Set(...)]` in glossary assembly. → §Finding 2
- [x] Enforce the carve-out for `unsupported_claim` (success targets/metrics must not flag). → strengthened `MERGED_SYSTEM_PROMPT`. → §Finding 4

**Tier B — trust / noise reduction:**

- [x] De-duplicate observations by (type, anchored block, concept) before they reach the feed. → `contentSig` dedup in `reconcileObservations`. → §Finding 5
- [x] Calibrate contradiction confidence to active model tier: hedged prompt on the free tier (no paid key → flash-lite), confident prompt only with a paid key. → `CONTRADICTION_SYSTEM_PROMPT_HEDGED`. → §Finding 3
- [x] (Subsumed) `settle-blur` re-eval on unchanged content already short-circuits on the per-section content hash. → §Finding 6

**Tier C — cost / UX:**

- [x] Per-section content-hash short-circuit confirmed under the section model (Finding 6 — no separate fix needed). → §Finding 6
- [x] Add a per-request latency timeout + user-visible stall affordance (one call hit 40.6 s). → `REQUEST_TIMEOUT_MS` + `AbortController` in `gemini.ts`; `src/model/stallSignal.ts` → status chip. → §Finding 7
- [x] Implement dirty-check before doc-level review fires (hash section summaries + ledger; skip if unchanged). → `saveDocEvalState`/`loadDocEvalState` + hash gate in `evaluateDocument`. → §4 "Doc-level review efficiency"

---

## 1. Context — what was tested

**Document:** `docs/assets/phase1-test-text.md` — a realistic PM PRD ("Fraud Alert Notifications") with four _planted_ issues documented at the bottom:

| Planted issue                                                     | Type            | Location                                 |
| ----------------------------------------------------------------- | --------------- | ---------------------------------------- |
| Notification "within 10 seconds" vs "within 30 seconds"           | `contradiction` | §Proposed solution ↔ §Technical approach |
| Launch "end of Q3" (stage) vs "final week of Q2" (§Timeline)      | `contradiction` | Stage ↔ §Timeline                        |
| "30% of blocks that are false positives" stated as fact, no basis | `clarity`       | §Non-goals                               |
| "varies significantly" — vague, unquantified                      | `clarity`       | §Risks                                   |

**Method:** the user pasted the document **section by section**, waiting for each to be processed before the next. At the point of capture they had pasted: **Background, Goal, Success metrics, Proposed solution, Scope — what's in** — and stopped there.

**Important consequence of the partial paste:** _neither_ planted contradiction can fire yet — both require the Technical approach / Timeline sections, which had not been pasted. So the contradiction detector had no true positive available to find; everything it surfaced is therefore noise by construction at this stage.

**State at capture:**

- **27 active observations** in the feed.
- **11 archived observations**, all `superseded`, none user-dismissed (the supersede mechanic working correctly).
- A debug log of triggers / requests / responses across ~20:42–20:48.

**Pipeline recap (from the log):** each settled block gets one `router.fast` call returning `{summary, claims, clarity, unsupported_claim, undefined_jargon}`. Document-level review (`missing_topic`, `underexposed_topic`, `audience_mismatch`, `structure_flow`) and contradiction detection run on `router.strong` against the claim ledger. On the **free tier both tiers resolve to `gemini-3.1-flash-lite`** by design (`src/model/gemini.ts`: `FREE_STRONG_POOL` starts with flash-lite; `gemini-2.5-pro` excluded at 0 RPD).

---

## 2. Findings & assessment

### Finding 1 — Headings are evaluated as standalone blocks → hallucination _(highest leverage)_

When a section is pasted, the markdown heading and its body become **separate ProseMirror blocks**, and the heading is evaluated **on its own with no body text**. There is no heading/node-type filter; `src/editor/Editor.tsx:286` fires a `settle-blur` for any block whose `text.trim().length >= 10`, and the blur path has **no terminal-punctuation requirement**. "Background" (10 chars), "Success metrics" (15), "Scope — what's in" (17), "Proposed solution" (17) all qualify.

Evidence from the debug log:

- Request `7xHAdB3poe` — user payload is literally `"Background\n..."`. With nothing to analyze, the model **hallucinated**: claimed _"This document is a Product Requirements Document (PRD)"_, flagged `PRD` as undefined jargon, emitted a clarity flag.
- Request `mWReKrAghx` — `"Success metrics"` alone → **"The document lacks specific metrics or success criteria… 'success' ambiguous."** _False_ — the three metrics exist in the body, evaluated separately as `cxyo5GUDky`.
- Request `XwDQ18AEcZ` — `"Scope — what's in"` alone → **"The scope section is empty."** _False_ — the four bullets were evaluated separately as `2RrV9Hn3Kj`.

**Assessment:** this single bug produces ~3–4 of the worst, most trust-destroying observations (telling the user a populated section is "empty"), and is the upstream source of Finding 2. **Highest-priority fix.**

### Finding 2 — Self-reinforcing ledger pollution

The hallucinated **"This document is a Product Requirements Document (PRD)"** claim (a) was written to the claim ledger, and (b) was promoted into the **"Defined terms (do not flag as undefined jargon)"** block fed into every subsequent per-block prompt — where it appears **duplicated**:

```
Defined terms (do not flag as undefined jargon):
- This document is a Product Requirements Document (PRD).
- This document is a Product Requirements Document (PRD).
```

It then shows up as **Existing Claim #7** in every contradiction comparison (e.g. request `WdmvKBoRNv`), permanently inflating the ledger.

Two distinct defects compound:

1. **Heading hallucination** (Finding 1) is the source.
2. The claim extractor treats a **meta-statement about the document** ("this is a PRD") as a **claim made in the document**. Meta-claims about the artifact should never enter the ledger.

**Assessment:** one hallucination becomes permanent, self-reinforcing context. Fixing Finding 1 stops new occurrences; we also need a guard against meta-claims and a dedup on the defined-terms list.

### Finding 3 — Free-tier "strong" tier runs on a weak model → confident false contradictions

Every response in the log shows `model: gemini-3.1-flash-lite` **regardless of `"tier": "strong"`**. This is by design (`FREE_STRONG_POOL` leads with flash-lite because `gemini-2.5-pro` is 0 RPD on the free tier). So the reasoning-heaviest checks — contradiction detection and doc-level review — run on the _fast-pool_ model on the free tier.

Both contradictions surfaced were **false positives** (and, per the Context note, no true positive was even available yet):

1. `2HW4PXM6Ic` — _"Single retry on successful challenge"_ vs _"transaction expires after 60s"_ → **not a contradiction.** A retry _within_ the window does not conflict with expiry _after_ it; the source even says "retry once" explicitly.
2. `DZLIj7yT50` — _"Support volume decreases 20%"_ vs _"unblock without contacting support"_ → the model **invented the premise** _"the initiative aims to eliminate support entirely"_. The doc never says that; a 20% reduction is fully consistent with "a path to self-serve."

The contradiction system prompt instructs `"Never hedge with 'might' or 'possibly'"`. Paired with a weak model, this **manufactures confident false positives** — the worst failure mode for a tool whose value is trust.

**Assessment:** the _infrastructure_ works (ledger comparison runs, prefilter bounds it, supersede fires). The _judgment_ is degraded on the free tier. This is a quality/cost tradeoff to make explicit, not a plumbing bug.

### Finding 4 — `unsupported_claim` misfires on goals/targets

The per-block prompt explicitly excludes _"opinions, plans, or goals."_ Yet response `CFe-Z7Kwrb` flagged **all three success metrics** ("drops by ≥30%", "decreases by 20%", "zero increase in fraud loss") as unsupported claims lacking evidence. These are **success targets** — exactly the excluded category. That's 3 false observations from one block, plus it overlaps the genuine §Non-goals planted clarity issue conceptually, muddying the signal.

**Assessment:** prompt-adherence failure by flash-lite on a subtle carve-out. Mitigations: strengthen/exemplify the carve-out in the prompt, or post-filter `unsupported_claim` hits whose substring was already extracted as a `metric`/`commitment`/`constraint` claim (targets are not fact-claims).

### Finding 5 — Heavy observation duplication

Of the 27 active observations, near-duplicates abound:

- `false-positive` flagged **three times**: `"False-positive"`, `"false-positive"`, `"false-positive friction"`.
- `block` flagged **twice**: once as clarity (_"what 'the block' refers to"_) and once as jargon (_"'block' used in a technical sense"_) — same underlying issue, two cards.

**Assessment:** no dedup pass exists across (type, anchored span/concept). Even when each individual flag is defensible, three cards for one phrase reads as noise and buries the high-signal items.

### Finding 6 — Trigger storm during the paste workflow

The paste-section-by-section workflow means the user repeatedly switches to the source app to copy → `window.blur` fires a `settle-blur:window-blurred`. Block `QuAiklt1JO` alone triggered at 20:47:11, 20:48:09, **and** 20:48:50 — re-evaluating unchanged content. `Editor.tsx:286` fires window-blur for any block ≥10 chars with **no content-changed guard**.

**Assessment:** on a free tier with finite RPD, re-evaluating unchanged blocks on every window-blur wastes budget and risks 429s mid-session. Trigger _coalescing_ exists (250 ms window, `orchestrator.ts:38`) but it doesn't dedup against "already evaluated this exact text."

### Finding 7 — A 40.6-second "fast" response

Request `CllsM0CQC1` (a _rerun_ of the "Success metrics" heading-only block) took **40,627 ms**; the median fast call is sub-2 s. Doubly bad: 40 s spent producing the _false_ "metrics ambiguous" observation (Finding 1). No per-request timeout or stall indicator is evident.

### What is working well (keep / don't regress)

- **Supersede / auto-archive** — when the doc-review re-ran after the stage was set, the 11 stale observations were correctly archived as `superseded`, none user-dismissed. The lifecycle mechanic works.
- **Claim typing** — metric / constraint / commitment / definition mostly assigned correctly.
- **Stage inference** — `suggested_stage` correctly inferred "PRD for internal stakeholders and engineering teams" from content alone (response `ADRrEKbyw0`).
- **"Provoke, don't prescribe" invariant holds** — every observation is an observation; zero fix/apply affordances. The product principle is intact.
- **Genuinely valuable observations did surface** (~8 of 27): missing security/privacy compliance for biometric data; missing technical architecture/API for the biometric service; missing fallback when push fails; underexposed fraud-model log ingestion; underexposed self-service flow beyond 60 s; clarity on unspecified "current levels" baseline; clarity on unspecified launch baseline; structure note on constraints-before-requirements ordering. These are exactly the prompts a PM should be nudged on.

### Signal-to-noise summary

Of 27 active observations: **~8 high-signal, ~6 duplicate/borderline, ~7+ outright false or misapplied** (2 empty-section artifacts, 2 false contradictions, 3 target-as-unsupported-claim). Roughly **30% high-signal** — too low for a trust-dependent tool. Crucially, the false set is concentrated in the three most authoritative-sounding types (contradiction, "section is empty," "no evidence"), which do the most damage to trust per occurrence.

---

## 3. Suggestions & implementation plan

Ordered by leverage (false-observations removed per unit of effort).

### Tier A — correctness

**A1. Don't evaluate heading-only blocks.** _(removes Findings 1 + root of 2)_

- Option (preferred): when gathering a block for eval, if its ProseMirror node is a `heading`, **merge it with the following content block** as leading context (`## Scope — what's in\n- bullet…`) rather than evaluating it alone. This also improves body-block summaries by giving them their section title.
- Option (cheaper): **skip** blocks whose node type is `heading` entirely — they carry no claims.
- Touch points: block-gathering in `src/editor/Editor.tsx` (settle paths) and/or the eval entry in `src/services/orchestrator.ts`. Add a node-type signal to the settle trigger.
- Test: paste a `## Heading` + body; assert no observation anchors to the heading alone and no "section is empty" flag appears. Seed via `__sidecar__.loadDoc`.

**A2. Reject document meta-claims at ledger write.** _(Finding 2)_

- In the claim-extraction → ledger upsert path, drop claims that are _about the document/artifact_ ("This document is a…", "The document is intended for…"). Either a small denylist of meta-patterns or a prompt instruction ("do not extract claims about the document itself; only claims the document asserts about the world").
- De-dup the **Defined terms** list before building the per-block prompt (set semantics by claim text).
- Test: assert these strings never appear in `getState().ledger`; assert defined-terms list has no duplicates.

**A3. Enforce the goals/targets carve-out for `unsupported_claim`.** _(Finding 4)_

- Strengthen the per-block prompt with explicit examples that **success metrics / targets are NOT unsupported claims**, and/or post-filter: suppress an `unsupported_claim` whose substring was also emitted as a `metric`/`commitment`/`constraint` claim in the same block.
- Test: replay the "Success metrics" body fixture; assert zero `unsupported_claim` observations on the three targets.

### Tier B — trust / noise

**B1. De-duplicate observations before the feed.** _(Finding 5)_

- Collapse observations sharing (type, normalized anchored span) and, across types, collapse a `clarity` and an `undefined_jargon` that point at the same token into one card (or suppress the weaker).
- Likely in the observation-write path the orchestrator already owns. Pure function → unit-testable without a mock.

**B2. Calibrate contradiction confidence to the active model tier.** _(Finding 3)_

- When the strong check is actually running on a fast-pool model (free tier), either (a) re-allow hedged language and a confidence threshold, or (b) gate contradiction detection behind a stronger model (BYO key / paid pool) and keep free-tier to the per-block checks it does well. Decision to be logged in `docs/plan.md` (free-tier behavior is a Phase-3 concern).
- This is a **product decision**, not just code — surface to the user before implementing.

### Tier C — cost / UX

**C1. Skip window-blur re-eval of unchanged blocks.** _(Finding 6)_

- The pipeline already has a trivial-change hash short-circuit for summaries (Phase 1). Extend the same content-hash guard to the `settle-blur` trigger so an unchanged block doesn't re-dispatch on every window-blur. Touch: `Editor.tsx` blur handlers + the orchestrator's per-block last-evaluated-hash.

**C2. Per-request timeout + stall affordance.** _(Finding 7)_

- Add a timeout to the Gemini call (abort + rotate, reusing the cool-down registry) and a user-visible "still thinking" state so a 40 s outlier doesn't silently stall the feed.

### Sequencing recommendation

Do **A1 → A2 → A3** before any further Phase 4 demo work — they remove the majority of false observations at low cost and unblock clean acceptance testing. **B1** next (cheap, high trust gain). **B2** requires a logged product decision. **C1/C2** are independent hardening, schedulable anytime.

### Verification

Re-run the paste-test in `docs/assets/phase1-test-text.md` after Tier A, ideally with the **full** document (so the two planted contradictions become available and we can confirm true positives fire while the false ones are gone). Use record/replay (`__sidecar__.setLlmMode`) to keep it quota-free and deterministic — noting the known mock-mode gap for the contradiction `strong` call (`docs/projects/agent_acceptance_harness.md`); for contradiction assertions, seed via `loadLedger` and assert `getState().ledger`/observations rather than replaying.

---

## 4. Open questions & decisions

Captured from design discussion on 2026-06-02. Each item is either a **decision made** (record what was decided and why) or an **open question** (record the framing for when it comes up during implementation).

---

### Section as evaluation unit _(decision: build it)_

**Decision:** the evaluation unit should be the **semantic section** (heading + body), not the individual ProseMirror block. → See `docs/projects/section_as_eval_unit.md` for the full design.

**Why:** a block is a formatting boundary, not a semantic one. Evaluating a heading without its body is the structural root of the hallucination and empty-section bugs. The section model also unifies the typing and paste workflows without any special-case handling.

**Consequence for Tier A:** item A1 ("skip or merge heading-only blocks") is superseded by the section-as-unit work. Schedule `section_as_eval_unit.md` instead of the band-aid.

---

### Structured claims for contradiction _(open question)_

**The problem:** contradiction detection compares flat claim strings. Two claims can be logically compatible but textually appear to conflict because the conditions are stripped — "retry once" and "transaction expires after 60s" are not contradictory but read that way without temporal scope. The false positive in Finding 3 (`2HW4PXM6Ic`) is a direct consequence.

**Two paths:**

1. **Structured claims** — extract polarity, temporal scope, and conditions as fields alongside `text`. More reliable contradiction matching; higher extraction complexity; may not be worth it if a capable model handles it implicitly.
2. **Stronger model** — rely on a model that reasons well enough to read conditions correctly, without structural scaffolding.

**Status: open.** Decision depends on how much of Finding 3 survives after the model-diversification work (#8 below). If false contradictions persist on a stronger model, revisit structured claims. Don't pre-build structure for a problem a better model might solve.

---

### Determinism as an ongoing discipline _(decision: yes, refine over time)_

**Decision:** determinism is not a one-time fix but an ongoing property to maintain. Known non-determinism (the auto-increment id in the contradiction prompt — see `agent_acceptance_harness.md` §Known gaps) should be resolved as encountered. Prompts and processing rules should be treated as refinable, not fixed.

**How to apply:** when adding or changing a prompt, add a corresponding fixture-replay test. When a test is flaky, treat the flakiness as a determinism bug, not a test infrastructure problem.

---

### Suggestions vs. warnings as message types _(decision: separate types)_

**Decision:** `missing_topic` (and similar speculative observations) will eventually be a **suggestion** type, distinct from the existing **warning** taxonomy. Suggestions have a lower falsifiability bar — they are allowed to be speculative in a way warnings are not. This resolves the "missing X on an unfinished doc" tension: a suggestion can say "you might want to address X" without implying X is definitely absent.

**Status:** the taxonomy extension is a later-phase design decision (not Phase 4 scope). Capture in `docs/features.md` when the suggestions type is designed. For now, no code change — just the intent logged here.

---

### Confidence / importance badge on observations _(open question)_

**The problem:** a contradiction observation (high stakes, frequently wrong on free tier) is displayed with the same visual weight as a clarity nit (low stakes, usually right). The "never hedge" prompt instruction makes the least reliable observations sound the most authoritative.

**Proposed direction:** add an optional confidence/importance indicator to observation cards. Could be derived (not manually assigned) from: observation type reliability × active model tier × whether the source was structured claims vs. heuristic. A contradiction caught by structured claims on a strong model = high-confidence badge; same check on free-tier flash-lite = no badge or "possible."

**Status: open.** This is a feed UX decision. The right time to design it is when the suggestions type is being added (they need a visual hierarchy anyway). Log here so it's not designed in isolation.

---

### Doc-level review efficiency _(open question)_

**The problem:** each `doc-idle` event re-sends the entire ledger + all block summaries — O(document size) tokens, every 12 seconds. The test session showed three near-identical doc-level reviews fire in quick succession on an unchanged document (requests `_ObTdY54LX`, `pKpPfrXEKd`, `3tFckjksnL`). On a realistic PRD edited over an hour, this will exhaust the free-tier RPD budget before the session ends.

**Options to evaluate (not yet decided):**

1. **Dirty-check before firing:** hash `(section summaries + ledger)`; skip the doc-level call if the hash matches the previous run. Kills redundant back-to-back reviews with minimal code change.
2. **Send shape, not full claims:** `missing_topic` / `structure_flow` need the document's _outline_ (which sections exist, which topics are covered), not every claim's full text. A compact section/topic map is much smaller than the whole ledger.
3. **Longer cadence:** doc-level checks are "stand back and look at the whole thing" checks. 12 s is too aggressive — they belong on a longer idle (60–120 s), on doc-open, or on an explicit "review now" trigger. Not per-keystroke-idle.
4. **Local coverage check first:** for known doc types (PRD), expected-section coverage can be computed locally (is there a Risks section? a Success Metrics section?) and an LLM call only fires when coverage changes — not on every idle.

**Status: open.** The dirty-check (#1) is safe to implement at any time. The others involve product/UX decisions about when doc-level feedback should appear. Decide during Phase 4 hardening.

---

### Model diversification and free-tier contradiction strategy _(open question)_

**The problem:** on the free tier, `router.strong` resolves to `gemini-3.1-flash-lite` (same model as `router.fast`) because `gemini-2.5-pro` has 0 RPD. Contradiction detection — the product's flagship "wow" check — runs on a model not strong enough to reliably distinguish compatible-but-similar claims from true contradictions.

**Options (not mutually exclusive):**

1. **Gate contradiction behind BYO key:** on the free tier, suppress contradiction detection entirely and surface a "add an API key to enable contradiction detection" prompt. Clear value proposition for upgrading; avoids trust erosion from confident false positives.
2. **Free-tier contradiction via structured claims:** if claims carry explicit polarity/scope fields (see §Structured claims above), a weaker model can do reliable pairwise comparison without open-ended reasoning. Reduces but does not eliminate the model quality gap.
3. **Richer model rotation pool:** as new free-tier models become available, `FREE_STRONG_POOL` can be updated without architectural change. Monitor Google's free-tier offerings — this situation may improve.
4. **Re-allow hedging on free tier:** the "never hedge" instruction trades precision for confidence. On the free tier, re-enable hedging ("this may contradict…") so a wrong call costs less trust than a confidently wrong one.

**Status: open.** This is a product positioning decision (what does the free tier offer?) as much as a technical one. Recommend discussing before Phase 5 / any public launch.

---

### API key aliasing in logs _(decision: alias, never log raw key)_

**Decision:** API keys must never appear in logged endpoints, event streams, or debug-panel output. Log the _tier_ instead: `key=<free>` / `key=<byo>`. The tier is the useful signal; the secret is not.

**Why:** the full key appears in every `endpoint` field in the current debug log (e.g. `?key=AIzaSy…IBD1w`). Any debug dump a user shares — in a support ticket, a bug report, or this conversation — leaks a live credential. This is a security issue, not a UX issue.

**Scope:** the alias must be applied at the point of logging in the model router / logger, not as a display-layer scrub, so the raw key never enters the event stream at all. → Implementation note in `docs/projects/model_rotation_and_debugging.md`.
