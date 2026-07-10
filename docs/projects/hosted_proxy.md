---
status: idea
kind: infra
phases: [6, 9]
summary: An OPTIONAL, capped hosted proxy so first-time visitors to writtten.com can evaluate their own writing with zero configuration — a small serverless function holding the owner's paid Gemini key, protected by a hard global daily budget + per-client throttle. DECISION 2026-07-06 → NO-GO for launch (owner declined the infra + bill); the BYOK-only demo ships instead, and this doc is the documented option to revisit post-launch if funnel friction proves costly.
---

# Hosted proxy (optional zero-config on-ramp)

> Design written 2026-07-06. Read alongside `docs/architecture.md` § _Privacy_ and § _Model router_, `CLAUDE.md` hard invariant #5 (local-first / no required server/egress), `docs/plan.md` Phase 3 "Decision point — free tier proxy" (the `[x]` decision this reopens), the OSS "Hosted live demo at writtten.com" milestone (which this makes real), and `docs/projects/multi_provider_router.md` (the free tier rides on Gemini only).

## Status

> Canonical status is the frontmatter above, mirrored in the Projects Index in `docs/plan.md`. This block is human-readable scope only.

**Status: `idea` — Phase 6 (decision) → Phase 9 (revisit). DECIDED: NO-GO for launch (2026-07-06).** The owner declined to own the serverless deployment + a (hard-capped) recurring bill for the initial launch. Consequently: the **BYOK-only demo ships** (see §_The zero-cost alternative_, which is now the launch behavior — canned example + a clear paste-your-key flow), and this document remains on the shelf as the **fully-specced option to revisit post-launch** if the funnel shows first-use friction is losing people. The design below is unchanged and build-ready should that revisit happen; nothing here is scheduled. This is why the Phase-6 plan milestone is closed as a decided NO-GO rather than an open build item.

## The problem this exists to solve

**writtten.com is effectively BYOK-only for real use today, and the README oversells it.** With no key, the app only serves the bundled canned example (`activateExampleReplay({ keyless: true })` in `src/App.tsx`). A visitor **cannot evaluate their own writing** without pasting a Gemini key. The README's "no key required to see it work" is true only of the demo. For the single biggest conversion asset — "try it on your own doc before you clone" — that's a wall.

## Why the Phase-3 decision is legitimately reopened

Phase 3 logged (`docs/plan.md`): _"Decision point — free tier proxy: stays fully client-side … A thin proxy would add infra cost, a mandatory server, and a privacy-model change — none of these are worth it at current scale. Revisit if the free-tier model list changes."_ That decision was correct **for its context** (private tool, no launch, no funnel). Two things changed:

1. **Launch + OSS go-public** makes a zero-config hosted demo the top-of-funnel conversion asset (the OSS plan already lists "Hosted live demo … works zero-key on first run" — which is exactly the thing that doesn't work today without a proxy).
2. The objection "a **mandatory** server" is avoidable: the proxy is **opt-in and origin-scoped**. The app stays local-first and BYOK; local clones and BYOK users never touch it. So invariant #5 is preserved as _"no **required** server"_ — the proxy is an optional convenience on the hosted origin, which still requires the logged decision below.

## The counterintuitive privacy win (worth surfacing)

A hosted proxy on the owner's **paid** Gemini key has a **better** privacy posture than a visitor's **free** BYO key. Google's free-tier terms permit training on submitted content; paid-tier terms do not. So "use writtten.com's free allowance" can be honestly pitched as _more_ private than "bring your own free key" — an inversion of the usual hosted-is-less-private assumption. (This does not make it private in absolute terms — content still leaves the browser for Google's paid API. Say so plainly.)

## Phased Plan

| Phase | Contributes |
| ----- | ----------- |
| **6** | The launch decision: **NO-GO** — no proxy ships; the hosted demo is BYOK-only. This doc records the design and the decision so it isn't re-litigated from scratch. |
| **7** | (If revisited, gated on funnel evidence + an owner GO) A single serverless proxy endpoint holding the owner's paid Gemini key, a hard global daily spend cap + per-client throttle, the "N free evals / day, then BYOK" client UX, the plan.md egress-decision entry, and honest privacy copy. Gemini-only (the only free-tier-relevant provider). |

## Todo

> **Gate:** everything below is contingent on a GO decision. Until then, this is a spec on the shelf and the fallback (§_The zero-cost alternative_) is the shipped behavior.

### Decision & guardrails (do first, even to decide)

- [ ] **Owner decision:** set a hard **global daily budget** (e.g. a few dollars/day) you are comfortable losing to abuse in the worst case. This single number bounds the entire risk. Record GO/NO-GO + the number in `docs/plan.md` as an explicit logged egress decision (invariant #5 requires it).
- [ ] Confirm the proxy uses a **paid** Gemini key (for both the privacy story and non-trivial shared throughput — a free key's ~20 RPD/model is useless shared across visitors).

### Proxy endpoint

- [ ] One serverless function (Cloudflare Worker / Vercel Edge / Netlify Function — pick per hosting). Accepts the same `{system, user, json}` payload the client already builds, injects the owner key server-side, forwards to Gemini, returns the text. The key never reaches the browser.
- [ ] **Two caps, enforced server-side:**
  - **Global daily budget:** a running spend/request counter in edge KV; once the day's cap is hit the proxy returns a soft 429 with a "free allowance used up for today — bring your own key" signal. This is the surprise-bill firewall: the proxy _cannot_ exceed it.
  - **Per-client throttle:** IP + a client-generated fingerprint token, a modest per-client daily allowance so one visitor can't drain the global pool. Best-effort (not auth) — the global cap is the real backstop.
- [ ] No document storage, no logging of document content server-side (local-first spirit; the proxy is a stateless relay). Log only counters needed for the caps.

### Client integration

- [ ] A `hosted` provider mode in the router that points `fast`/`strong` at the proxy endpoint instead of direct-to-Gemini. Slots cleanly beside the `multi_provider_router.md` provider registry — the proxy is "just another adapter" whose `buildRequest` targets the owner's endpoint and carries no key. Default mode on the hosted origin when no BYO key is set.
- [ ] **Transparent allowance UX:** a small, honest indicator — "You've used X of Y free evaluations today" — and, on exhaustion, a calm hand-off to the existing BYOK Settings ("add your own free key for unlimited — 30s, here's how"). No dark patterns, no fake urgency.
- [ ] **Honest privacy line** in the same surface: your text is sent to Google's (paid) Gemini API for evaluation and is not stored by writtten; nothing is saved on any server. Link `SECURITY.md`.
- [ ] Local clones / BYOK users: unaffected. The proxy mode is only the default when running on the hosted origin with no key.

### Docs

- [ ] Correct the README overclaim: distinguish "explore the canned example (zero key)" from "evaluate your own doc (free hosted allowance **or** your key)".
- [ ] `docs/architecture.md` § Privacy: add the opt-in-proxy exception and the paid-key privacy nuance.
- [ ] Flip this doc to `done` + update the Projects Index and the OSS "Hosted live demo" milestone when shipped.

## The zero-cost alternative (the NO-GO path)

If the owner would rather run **no infra**: keep the hosted app BYOK-only but make the empty state carry the weight. The canned "See it in action" example already lands the hero moment; pair it with a single, clear, low-friction "paste a free key (here's the 30-second how-to) to analyze your own document" flow. Honest, free to the owner, and it keeps invariant #5 absolutely clean. The only cost is first-use friction — real, but not fatal, and reversible later if the funnel proves the friction is losing people. **This is the default until a GO decision lands.**

## Non-goals / guardrails

- **Not a mandatory backend.** The proxy is opt-in convenience on the hosted origin only; the product remains fully usable local-first with BYOK and no server. Invariant #5 holds as "no _required_ server."
- **Not multi-provider.** Only Gemini has a free tier, so the proxy is Gemini-only by definition. OpenAI/Anthropic support is BYOK-only (`multi_provider_router.md`).
- **Not accounts or auth.** Anonymous, best-effort throttling. The hard global cap — not per-user identity — is what makes the economics safe.
- **No server-side document storage or content logging.** Stateless relay; only cap counters persist.
- **Cost safety is the design center.** If the global daily cap can't be enforced hard, don't ship it. The whole point is that the worst case is a known, bounded number.
