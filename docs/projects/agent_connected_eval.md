---
status: idea
kind: spec
phases: [9]
summary: Bring-your-own-agent as an alternative eval source — an external coding-agent session (Claude Code, Codex, …) connects to the writtten document and emits typed observations through a taxonomy- and register-enforcing boundary, inheriting the user's existing model access with no API key and no writtten-side egress. Spec only; build is ungated and undecided.
---

# Agent-connected eval source (bring-your-own-agent)

> **What this is.** Today writtten produces observations one way: the app holds a model key and calls a provider through the model router. This spec designs a second source: an external, general-purpose agent session the user already runs (Claude Code, Codex, a local agent) _connects to the document_ and submits observations into the feed. The user pastes a skill into their agent once; the agent reads the doc and emits — no API key pasted into writtten, no writtten-side egress at all. It is the productized, non-dev version of the bridge `window.__sidecar__` already is (`src/debug/harness.ts` exposes `getState`/`getEvents`/`loadLedger` today).
>
> **What this is not.** This is **not** Proof-style AX. `docs/snapshots/2026-06-13_competitor_proof_editor.md` documents the model we invert: agents joining a doc as _co-authors_ with edit APIs and accept/reject suggestions. `docs/concept.md` (non-goals) forbids exactly that — a doc-as-shared-workspace bridge for outside agents to **write in**. The boundary this spec designs admits observations and nothing else: no edit API, no suggestion API, no comment thread, no presence-as-author. The distinction is load-bearing and enforced in code, not in the skill's prose.

## Status

> Canonical status lives in the frontmatter above and is mirrored in the Projects Index in `docs/plan.md`. This block carries the human-readable scope only.

**Idea — Phase 9 (spec written 2026-07-16 per the plan milestone; build ungated/undecided).** The Phase-9 plan milestone's deliverable was this document: bridge protocol, taxonomy + register enforcement at the boundary, and the trust/attribution model. Building any of it needs (1) an explicit owner GO (it is a strategic surface, not a feature), and (2) an amendment to the `docs/concept.md` non-goal — the non-goal stays true as written ("no external-agent _collaboration_"), but shipping this without touching that sentence would look like drift; the amendment should name the distinction (observation source ≠ co-author) and cite this spec.

Read alongside:

- `docs/projects/agent_acceptance_harness.md` — the dev-only bridge this productizes; the harness stays DEV-gated and separate (it has write affordances — `loadDoc`, `loadLedger`, `clear` — the product bridge must never expose).
- `docs/projects/byok_capability_model.md` · `docs/projects/hosted_proxy.md` — the two existing answers to "where does model access come from"; this is the third, and the only one with zero key handling.
- `docs/snapshots/2026-06-13_competitor_proof_editor.md` — the competitor mechanism borrowed (skill + bridge) and the affordance explicitly refused (edits).

## Phased Plan

| Phase | Contributes                                                                                                                                                                     |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **9** | This spec (done at write time). If the build is ever green-lit: B1 boundary module + B2 transport v1 + B3 attribution UI, in that order — each independently shippable behind a flag. |

## Todo

> Pre-build gates first; the build checklist below them is inert until both gates pass.

- [ ] **Gate 1 — owner GO/NO-GO** on the surface itself. The real question is not transport; it is whether writtten _wants_ third-party observation sources at all (quality is no longer ratchet-guarded for them — see _Trust model_).
- [ ] **Gate 2 — amend the `docs/concept.md` non-goal** to carve out "observation-source bridge, per `agent_connected_eval.md`" from "no external-agent collaboration", in the same PR as any build start.

Build checklist (when scheduled):

- [ ] **B1 — Boundary module** (`src/services/externalObservations.ts`): `submitExternalObservation(input): Accepted | Rejected` implementing the full validation pipeline (§ _The boundary_). Pure + unit-tested; no transport dependency. Rejections are machine-readable (`{ code, rule, hint }`) so an agent can self-correct.
- [ ] **B2 — Transport v1** (§ _Bridge protocol_): outbound loopback WebSocket client in the app + Settings connect UI (URL + token) + the published skill file (`docs/skills/writtten-agent.md` or equivalent) that tells an agent how to serve the other end. Feature-flagged.
- [ ] **B3 — Attribution UI**: source chip on external cards, the connection indicator, disconnect/revoke, and the stale-source treatment (§ _Trust & attribution_).
- [ ] **B4 — Lifecycle exemption**: external observations are invisible to `reconcileObservations`' orphan auto-close (they are not the evaluator's to close) while remaining subject to user dismissal, suppression matching (`isSpanSuppressed`), anchor-collapse (`ObservationHighlighter` deletion detection), and agent retraction.
- [ ] **B5 — Register fixtures**: a boundary test corpus of adversarial submissions (rewrites dressed as observations, leading questions, apply-me phrasing, out-of-taxonomy types, grammar nits) asserting hard rejection — the philosophy-guardrail equivalent of the prompt ratchet, applied to input instead of output.

## Design

### The one constraint that shapes everything

`proofeditor.ai` proves the transport is easy; the hard part is that their bridge lets the agent _suggest edits and leave comments_, and writtten's Invariant 1 forbids exactly that. **Whether an external, general-purpose agent can be held to "provoke, don't prescribe" is the design risk.** The answer this spec takes: don't hold the _agent_ to it — hold the _boundary_ to it. The agent is untrusted input, like any network peer. Everything the product principle requires is enforced where the observation enters, in code the agent cannot negotiate with:

1. **Fixed taxonomy at the type level.** A submission names one of the existing `Observation["type"]` values (`src/store/db.ts`) or it is rejected. No free-form types, no agent-invented categories — the fixed-taxonomy invariant (#2) applies to sources, not just prompts.
2. **Register discipline at the text level.** Every submission runs `lintRegister` (`src/services/registerLint.ts`) as a **hard reject**, not a warning — prescriptive phrasing ("change this to…", "consider rewriting"), leading questions, claim-index leaks. The anti-taxonomy (grammar/style/surface nits) is enforced the same way: a `clarity`-typed nit that is really a style comment gets rejected by the same rules the prompt ratchet uses on our own model output.
3. **No edit surface, by construction.** The protocol has no message that carries document mutations. This is not a permission flag an agent could ask to elevate — the message doesn't exist. Read access is snapshot-shaped (below), never a write handle.
4. **Anchoring is resolved locally.** The agent supplies `anchorText` (a quote from the doc), never offsets or block ids. The boundary resolves it against the live document with the existing substring machinery (`evaluatorAnchoring.ts`); an anchor that doesn't resolve degrades to `scope: "document"` or is rejected (decide at build: reject is safer for span types). The agent never learns or names internal block identity.

What code cannot enforce is _insight quality_ — a connected agent may emit dull or wrong observations in perfect register. That's the trust model's problem (below), not the boundary's.

### Bridge protocol

**Read side — snapshot pull, not event-stream push.** The agent requests a document snapshot: `{ docVersion, title, stage, sections: [{ heading, text }], activeObservations: [{ type, scope, text, anchorText, source }] }`. Deliberately _not_ the harness's live event stream: an external agent doesn't need settle-grain events to review a document, and a snapshot API can't become a de-facto collaboration presence channel. The agent polls (or re-pulls on a doc-version bump notification); the quiet-while-generating rhythm is preserved by the app only serving snapshots of _settled_ state (same gate as the evaluator, invariant #4). Active observations are included so the agent can avoid duplicating what the feed already shows.

**Write side — one message type.** `submit_observation { type, scope, anchorText?, text, confidence? }` → `accepted { observationId }` | `rejected { code, rule, hint }`. Plus `retract { observationId }` (only for observations this session submitted). Severity/priority are computed locally by the existing `computePriority` path — the agent doesn't set its own volume.

**Transport (v1 decision): outbound loopback WebSocket, app-as-client.** A static PWA can't listen; something must. Options considered:

- **(a) Agent-drives-browser via the harness** — works _today_ for agents with browser tooling (it's how our own acceptance sessions run), but the harness is DEV-only, carries write affordances, and "install browser automation" is not a user on-ramp. Kept as the internal prototype path only.
- **(b) App connects out to a loopback server the agent runs** — **chosen.** The skill instructs the agent to start a tiny localhost WebSocket server (agents that can run code can do this trivially) and print a `ws://127.0.0.1:<port>` URL + a one-time token; the user pastes both into writtten Settings; the app initiates the connection. Local-first holds: loopback only, user-initiated, token-gated, zero writtten infrastructure. _Compat check at build:_ secure-context pages connecting to `ws://localhost` — modern Chromium/Firefox exempt loopback from mixed-content blocking, but verify against the deployed writtten.com origin and document the self-hosted fallback.
- **(c) A hosted relay** — rejected: introduces writtten-side egress and a server (invariant #5), for convenience only.
- **(d) File-handshake (File System Access API)** — rejected for v1: polling a shared file is workable but strictly worse ergonomics than (b) with no privacy gain.

**Identity:** the token authenticates the pairing, nothing more. The agent self-reports a display name (`"Claude Code"`, `"Codex"`); it is attribution metadata, not a permission tier.

### Trust & attribution

External observations are **first-class in lifecycle, visibly second-party in origin**:

- **Attribution chip.** Every external card carries a quiet source chip (the agent's display name) — same visual weight class as the "Whole doc" scope chip (`doc_scope_legibility.md`). The user always knows which critic is speaking; the feed never launders an agent's observation as writtten's own. `Observation` gains an optional `source?: { kind: "agent"; name: string; sessionId: string }` (absent = built-in evaluator; no migration needed).
- **Quality is not ratchet-guarded — say so honestly.** The evaluator's observations sit behind precision floors and fixture ratchets; a connected agent's do not and cannot. The trust the product spends when an external observation is wrong is real; the chip is the containment (the user learns to discount _that source_, not the feed). This is the strongest argument for Gate 1 being a genuine owner decision.
- **Lifecycle:** user dismissal works identically (and writes the same `DismissalSuppression`, so the agent re-submitting a dismissed observation is filtered by `isSpanSuppressed` — the flattery-resistance rules, G1, apply unchanged). Anchor deletion collapses the card via the existing highlighter path. The **evaluator never auto-closes external cards** (its reconcile only owns what it emitted); the agent may `retract` its own. Disconnect: cards persist but the chip gains a "source disconnected" state — decide at build between persist-quietly (default lean: an observation's validity doesn't depend on its author being present) and grace-expiry.
- **Revocation:** one control in Settings drops the connection and offers "archive everything this source submitted".
- **Budget:** external observations enter the same feed-budget partition (`feedBudget.ts`) — they compete for the same top-N attention slots rather than getting a reserved lane, and a per-session submission rate cap (e.g. reject beyond N pending unreviewed submissions) keeps a runaway agent from flooding the drawer.

### Why this may be worth building (and the honest case against)

**For:** it inherits the user's existing model access — no key to obtain, no tier ambiguity, and the strongest models most users touch are inside their agent subscription, not their API console. It is also the only eval source with _zero_ writtten-visible egress: the document goes to whatever the user's agent already is, under terms they already accepted. The privacy page could say something meaningfully stronger than BYOK can.

**Against:** it hands the product's voice to an unratcheted critic (the trust argument above); the setup dance (start a server in your agent, paste a URL) is only an on-ramp win for people already living in a coding agent; and the maintenance surface (a published skill + a protocol contract) outlives the experiment. The free-tier BYOK path may simply be good enough for the same audience.

## Non-goals

- **No edit, suggestion, comment, or presence APIs. Ever.** Not v2, not behind a flag. The message types are the invariant.
- **No agent-to-agent or multi-agent choreography** — one paired session at a time is the design point; N sources is feed-noise multiplication with no user demand behind it.
- **No harness exposure in prod.** `window.__sidecar__` stays DEV-only with its write affordances; the product bridge is a separate, narrower module.
- **No writtten-hosted relay or directory** — pairing is local and manual by design.
