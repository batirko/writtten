---
status: in-progress
kind: research
phases: [8, 9]
summary: The go-to-market strategy for writtten — the manifesto-as-distribution thesis, a ranked channel taxonomy beyond the obvious LinkedIn/friends/PM-communities push, the sequencing plan, and the GTM-skill/tooling landscape research (two-motion split; which skills fit an OSS bottom-up product and which are actively wrong for it). Complements `oss_launch_readiness.md` (launch venues/checklist) and `field_validation.md` (soft-launch = V2 validation).
---

# Go-to-market

> **What this is.** The deliberate distribution strategy for writtten, captured 2026-07-18 in a working session with the owner. It starts from the owner's own shortlist — post to LinkedIn, send to relevant friends, share in a couple of closed PM communities (Lenny's newsletter community + a Ukrainian PM community) — and widens it into a ranked channel taxonomy, a sequencing plan, and a survey of the emerging "GTM-engineer skill" tooling (prompted by the owner sharing the `reddit-opportunity-research` skill).
>
> **What this is not.** Not a launch-readiness checklist (that's `oss_launch_readiness.md` — repo hygiene, positioning assets, the launch-venue sequence). Not a metrics/telemetry plan — invariant #5 (local-first / no telemetry) means GitHub-side signals + qualitative feedback are the measurement, and that stance is unchanged here. This doc is the **why + where + in-what-order** of getting writtten in front of people, plus the tools that help do it.

## Status

> Canonical status lives in the frontmatter above and is mirrored in the Projects Index in `docs/plan.md`. This block carries the human-readable scope only.

- **Phase 8 (active outreach, now):** public launch happened 2026-07-10 and outreach has started. The near-term GTM push — manifesto essay, warm circle, the concentrated Show HN / Product Hunt spike, newsletter follow-on — runs in the current phase. It is the **same motion as external-PM (V2) recruiting** (`field_validation.md` § V2 — itself deferred to unscheduled 2026-07-17 by owner call): getting writtten in front of PMs and recruiting session participants are the same act, and the attention this outreach creates is what makes reviving V2 cheaper ("V2 recruiting is easier while launch attention lasts", plan.md, Phase 8 intro).
- **Phase 9 (compounding depth, post-traction):** the slower-burning channels — deliberate GEO/AEO content, systematic Reddit participation, backlink/directory work — accrete once the drafting habit shows signs of taking hold. Don't pre-build the depth work; the near-term push is what earns the traction that unlocks it.

## Phased Plan

- **Phase 8 — the launch push.** Write and publish the manifesto. Run the warm circle (owner's shortlist). Fire the one concentrated public spike (Show HN + Product Hunt, sequenced, not big-banged). Pitch the highest-fit newsletters. Run the two zero-cost research probes below (Reddit-opportunity + GEO baseline) to sharpen framing and target threads.
- **Phase 9 — compounding channels.** Treat GEO/AEO as a standing workstream (a tool about AI should be findable *by* AI). Systematic authentic Reddit participation via a keyword listener. Awesome-list / directory backlinks. This is the "go-to-market execution" depth that `oss_launch_readiness.md` parks in its Phase-9 Superb tier.

## Todo

**Phase 8 — launch push**

- [ ] **Write the manifesto essay** — *"I built an AI writing tool that refuses to write for you."* Adapt from `docs/launch/why-writtten.md` (already drafted) + `docs/concept.md` + `docs/product-requirements.md`. This is the load-bearing asset; every channel is a delivery vehicle for it. Hand-written, not AI-generated (off-brand otherwise).
- [ ] **Warm circle** (owner's shortlist) — LinkedIn post; DM relevant friends; share in Lenny's community + the Ukrainian PM community. Lead with the argument, mention the tool second.
- [ ] **Show HN** — *"Show HN: writtten – an AI writing tool that never writes for you."* Line up first-hour engagement from the warm circle rather than spraying. (Already flagged in `oss_launch_readiness.md` § Go-to-market.)
- [ ] **Product Hunt** — needs the hero visual + demo GIF. Concentrate warm-circle upvotes/comments in the first hour.
- [ ] **Newsletter pitches** — one good placement beats ten community posts. Shortlist below.
- [x] **Research probe: Reddit-opportunity** — ran 2026-07-18. Ran `reddit-opportunity-research` (onvoyage-ai) with `concept.md` + `product-requirements.md` as brand DNA; the pain-point/community map and the search/AI-prompt language it produced are kept in internal GTM notes and feed the manifesto. See § Tooling.
- [x] **Research probe: GEO baseline** — ran 2026-07-18. Search-surface + assistant-answer proxy establishing the Phase-9 GEO baseline (writtten's current discoverability + the uncontested category terms); details kept in internal GTM notes.

**Phase 9 — compounding channels (parked; don't pre-build)**

- [ ] GEO/AEO as a standing workstream — structured, citable content on writtten.com so AI engines cite it for category queries.
- [ ] Systematic authentic Reddit/forum participation via a keyword listener (GummySearch / F5Bot / Syften).
- [ ] Awesome-list + directory backlinks (`awesome-local-first`, `awesome-privacy`, `awesome-selfhosted`, `awesome-productivity`).

---

## The governing thesis: for this product, the manifesto *is* the distribution

Writtten's wedge is not a feature — it's a **point of view**: *the AI never writes your prose; it provokes your thinking* ("provoke, don't prescribe"; "Grammarly-with-extra-steps is the enemy"; "silence during idea formation is a feature"). In a moment when everyone is drowning in AI slop and quietly worried it's atrophying the muscle it claims to help, that POV is contrarian, screenshottable, and emotionally resonant.

**Consequence:** the highest-leverage GTM move is not picking more Slack groups to post in — it's packaging the argument well enough that other people spread it for you. A tool link gets a shrug; a sharp argument about AI and thinking gets forwarded. So the **manifesto essay is the actual distribution engine**, and every channel below is just a delivery vehicle for it. The raw material already exists (`docs/launch/why-writtten.md`, `concept.md`, `product-requirements.md`).

**Corollary — lead with the argument, mention the tool second.** This also protects standing in communities like Lenny's where the owner is a real member; a bare "check out my tool" link reads as spam and burns goodwill.

## Channel taxonomy (beyond the obvious three)

The owner's shortlist (LinkedIn, friends, Lenny's + Ukrainian PM communities) is the **warm circle** — right first move. Beyond it, ranked by fit:

**Highest-leverage launch moves**

1. **Show HN.** OSS + local-first + privacy + a contrarian AI take is exactly HN's sweet spot. Title carries the inversion: *"Show HN: writtten – an AI writing tool that never writes a word for you."* Can outperform every community post combined.
2. **Product Hunt.** The anti-slop framing + the visual live-feed demo do well here. Concentrate the warm circle as first-hour upvotes/comments rather than spreading them thin.
3. **Tools-for-Thought crowd** — the most philosophically-aligned audience, and easy to miss. The Obsidian / Roam / Tana / "augment thinking, don't replace it" people love this on principle. Channels: r/ObsidianMD, TfT Discords, Ness Labs (Anne-Laure Le Cunff), Dense Discovery.

**PM-specific** (extends the warm circle): r/ProductManagement, Mind the Product Slack, Reforge community, Department of Product. Note: Lenny's is more than the Slack — a *guest post* or newsletter mention is ~100× a community thread.

**Builder / OSS:** Indie Hackers (build-in-public), Dev.to / Hashnode (the local-first technical angle), awesome-list PRs, GitHub hygiene (README opening with the manifesto, demo GIF, good topics/tags for Trending).

**Writing / thinking communities:** Foster, Write of Passage community, Ship 30 for 30 — people who treat writing *as thinking* are arguably truer believers than PMs.

**Newsletters to pitch** (always hungry for a fresh AI angle):
- AI: Ben's Bites, The Neuron, TLDR AI, The Rundown.
- Taste/curation: Dense Discovery, The Browser, Recomendo, Why Is This Interesting.

**Founder-voice content:** a 30–60s demo video/GIF of the live feed reacting to a PRD (the mechanic is inherently visual — use it); an X/Twitter thread version of the manifesto for the AI-discourse crowd.

## Sequencing (don't big-bang)

Aligned with `oss_launch_readiness.md` § Go-to-market:

1. **Manifesto essay** published first — the asset everything points at.
2. **Warm circle** — friends, LinkedIn, PM communities. Lead with the argument.
3. **Concentrated public spike** — Show HN + Product Hunt, with the warm circle marshalled for first-hour engagement. One spike, not the same link sprayed everywhere the same day.
4. **Newsletter follow-on** — the second wave, once there's a launch story to point at.

**What not to do:** don't spray the identical link across 20 groups (spam; burns goodwill); don't launch everywhere simultaneously; don't auto-generate SEO content (off-brand for a tool that mocks AI slop).

## Tooling — the GTM-engineer skill landscape

Prompted by the owner sharing [`reddit-opportunity-research`](https://skillsmp.com/creators/onvoyage-ai/gtm-engineer-skills/reddit-opportunity-research). Researched the broader ecosystem 2026-07-18.

### The key finding: two motions, only one fits writtten

The 2026 "GTM-engineer skills" world has bifurcated:

- **Outbound / sales-engineering motion** — cold email, lead enrichment, ICP scraping, sequencing, signal-based prospecting. Most of the noise lives here (ColdIQ, Extruct, GTM Flywheel, GTM Agents, the "Claude GTM Plugin" outbound sub-skills; enrichment platforms like ZoomInfo / MadKudu / Clay).
- **Content / community / discovery motion** — brand research, keyword + AI-prompt research, Reddit-opportunity finding, GEO/AEO, backlinks, content.

**Only the second motion fits writtten.** A free, OSS, local-first tool whose entire soul is "provoke your thinking, don't do it for you" cannot run cold-email automation without immediately contradicting itself — there's no ICP to blast, no deal to close, and a scraped-and-sequenced outreach motion is tonally self-defeating for this product. **The recommendation is to ignore the entire outbound half of the ecosystem** even though it's ~70% of what's out there. Community-led + POV-led is the motion.

### The skill the owner shared — strong fit

`reddit-opportunity-research` (part of `onvoyage-ai/gtm-engineer-skills`, MIT-licensed, ~12 skills) finds threads where PMs/writers already voice the pain (drowning in AI slop, PRDs that don't force thinking, "is AI making me a worse writer"), scores them by whether *genuine helpful participation* fits, and — the sleeper output — **simulates the actual search queries and AI prompts people use.** That language is gold for both manifesto framing and knowing which threads to authentically show up in.

Its one prerequisite is a "brand DNA" doc (via `research-brand`). **Skip that** — `concept.md` + `product-requirements.md` already *are* the brand DNA, and better than a URL scrape. Feed them in directly.

### Rest of that collection worth using

- **GEO/AEO skills** (`audit-website-aeo`, `improve-aeo-geo`, `geo-content-research`) — the **sleeper win specific to this product.** When a PM asks ChatGPT / Perplexity *"is there an AI writing tool that doesn't write for me?"*, writtten should be the cited answer. A product whose whole story is about AI should be *findable by* AI. writtten.com is a static PWA on Cloudflare — trivial to add structured, citable content. Most OSS launches ignore this; it's a real edge.
- **`build-backlinks`** — finds free mention/directory opportunities (overlaps the awesome-lists idea; low effort).
- **Skip** its content-*generation* skills (`write-seo-geo-content`, `build-resource-pages`) — auto-generated SEO content is off-brand for a tool that mocks AI slop. The manifesto is hand-written.

### Other collections / tools worth knowing

- **Corey Haines "Marketing Skills"** (`coreyhaines31/marketingskills`, ~12.8k★) — the most-vetted repo in the space; the **copywriting + positioning** skills are useful for sharpening the manifesto and landing page.
- **`ComposioHQ/awesome-claude-skills`** — a directory, not a library; use as the discovery layer.
- **Non-skill pairing tools for the Reddit motion:** GummySearch / F5Bot / Syften — keyword listeners that ping when someone posts the pain on Reddit/HN/forums, so participation is authentic and real-time rather than a dig.

### Caution

These are third-party skills — installing one runs its instructions in the environment. Mostly thin markdown, but skim the `SKILL.md` before running any, and never let a content-gen skill touch writtten.com's copy on autopilot.

## Metrics — unchanged from `oss_launch_readiness.md`

Keep them honest and privacy-respecting. GitHub-side signals (stars, forks, issues, PRs, incoming signal-quality reports) need no instrumentation and are enough. Any demo-usage analytics touches invariant #5 (local-first / no telemetry) — only an explicit logged decision, privacy-respecting, never a default. Community FP/FN reports are themselves the field-validation corpus the project lacks (route them into `docs/logs/prompt_quality_observations.md`).

## Cross-references

- `docs/projects/oss_launch_readiness.md` — launch venues, positioning assets, the launch-sequence checklist, metrics stance. This doc is the strategy/tooling layer over that checklist.
- `docs/projects/field_validation.md` (§ V2) — the soft-launch *is* validation; GTM outreach and V2 external-PM recruiting are the same motion.
- `docs/projects/where_users_write.md` — the long-term "live where users already write" play; downstream of traction this GTM push helps create.
- `docs/projects/hosted_proxy.md` — the BYOK-only demo funnel; revisit only if launch shows first-use friction is costing conversions.
- `docs/concept.md`, `docs/product-requirements.md`, `docs/launch/why-writtten.md` — the manifesto's raw material.

## Sources (2026-07-18 research)

- [onvoyage-ai/gtm-engineer-skills](https://github.com/onvoyage-ai/gtm-engineer-skills) (MIT) — the collection the shared skill belongs to.
- [SyncGTM — 7 best Claude Code GTM skills 2026](https://syncgtm.com/blog/claude-code-gtm-skills-2026) — the outbound-heavy ecosystem survey.
- [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) — vetted marketing/copywriting/positioning skills.
- [GTM Engineer Club — AI lead-gen guide](https://www.gtmengineerclub.com/guides/ai-lead-generation/) — the signal-based outbound motion (context for why it's the wrong fit).
- [xseek — best GEO/SEO Claude Code skills 2026](https://www.xseek.io/blogs/articles/best-geo-seo-skills-claude-code) — the GEO/AEO skill landscape.
