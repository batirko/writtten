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
- [x] **Research probe: Reddit-opportunity** — ran 2026-07-18; findings in [§ Probe 1](#probe-1--reddit-opportunity-research-ran-2026-07-18). Ran `reddit-opportunity-research` (onvoyage-ai) feeding `concept.md` + `product-requirements.md` as brand DNA → pain-point map, target subreddits, ranked earned-participation opportunities, and the search/AI-prompt language people use (feeds the manifesto). See § Tooling.
- [x] **Research probe: GEO baseline** — ran 2026-07-18; findings in [§ Probe 2](#probe-2--geo-baseline-ran-2026-07-18). Search-surface + assistant-answer proxy: writtten surfaces nowhere; the "critique-never-rewrite" and contradiction-at-distance category terms are uncontested. Sets the Phase-9 GEO baseline.

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

## Probe 1 — Reddit-opportunity research (ran 2026-07-18)

> Ran the `reddit-opportunity-research` skill (installed from `onvoyage-ai/gtm-engineer-skills`, MIT) with `concept.md` + `product-requirements.md` as brand DNA — its `research-brand` prerequisite skipped, since those docs already *are* the DNA.
>
> **Method caveat / confidence.** Reddit blocks Anthropic's web crawler, so this is **community-and-pattern-level, not live-thread-URL-level.** The subreddits and pains below are grounded in the *verified* open-web pain discourse (the MIT cognitive-debt study, the voice-preservation and "critique-not-rewrite" essays surfaced in Probe 2) plus the known structure of these communities — not in scraped thread links. Treat **subreddit fit as high-confidence** and any single "go post *here* today" as **verify-before-acting** (skill rule #5: no fake certainty). Every recommendation is *earned participation, not a link-drop*: lead with the argument, mention the tool only where it genuinely answers the thread.

**Summary:** ~9 target subreddits · 3 immediate (earned-participation) patterns · 2 build-content-first · 2 monitor.

### 1. Pain points users discuss (verified discourse)

| Pain point | How people phrase it | Who feels it | Opportunity |
|---|---|---|---|
| AI is eroding my own thinking/writing | "cognitive debt", "brain atrophy", "am I getting dumber", "clean draft, emptier head" | knowledge workers, students, writers | **Immediate** — the manifesto *is* the answer |
| AI rewrites flatten my voice | "it doesn't sound like me anymore", "everything sounds like slop / generic" | writers, PMs, academics | **Immediate** |
| I want critique, not a rewrite | "feedback without rewriting", "play devil's advocate on my draft" | writers, PMs, students | **Immediate** |
| Grammarly only catches surface nits | "flags passive voice, misses the logic", "nothing checks whether my argument holds" | writers, PMs | Build content first |
| My PRD/spec has hidden contradictions | "§2 says X, §7 says Y and I didn't catch it" | PMs | Build content first (this is the hero capability) |
| Want private/offline, no-account writing help | "local-first", "no cloud", "open source" | privacy / OSS crowd | Monitor |

### 2. Target subreddits

| Subreddit | Why it matters | Discussion types | Fit | Recommended motion |
|---|---|---|---|---|
| r/ProductManagement | primary persona; PRD/spec pain, tool threads | recommendations, "how do you review your own PRD" | High | reply where self-review / contradiction pain shows — not a launch drop |
| r/writing | writing-as-thinking believers; voice-loss + "is AI making me worse" recur | opinion, tool advice | High | POV comments; the manifesto lands here |
| r/ObsidianMD · r/PKMS · r/Zettelkasten | tools-for-thought crowd; "augment thinking, don't replace it" is doctrine | tool discovery, workflow | High | most philosophically aligned; local-first resonates |
| r/ArtificialIntelligence · r/ChatGPT · r/OpenAI | where the cognitive-debt / AI-slop discourse lives | debate, links | Med | join the *pain* thread, not to sell |
| r/technicalwriting | clarity/consistency-obsessed | tool advice | Med | build content first |
| r/selfhosted · r/opensource · r/LocalLLaMA | OSS + local-first + BYOK angle | project shares | Med | a "Show r/…"-style share fits their norms |

### 3. Ranked opportunity list (earned participation)

| # | Where | Discussion pattern | Intent | Brand fit | Best move | Asset needed |
|---|---|---|---|---|---|---|
| 1 | r/writing · r/ArtificialIntelligence · r/ChatGPT | the "cognitive debt" / "is AI making me a worse writer" recurring thread | debate | writtten's whole thesis; the manifesto *is* the comment | comment with the argument (not the link) | manifesto essay |
| 2 | r/ProductManagement | "how do you catch inconsistencies in your own PRD" / tool threads | recommendation | hero = internal-contradiction detection | reply where it truly answers | short "self-review your PRD" guide |
| 3 | r/ObsidianMD · r/PKMS | "AI that augments thinking without doing it for you" | discovery | local-first + provoke-don't-prescribe | earned share | demo GIF |
| 4 | r/writing · r/productivity | "AI rewrites flatten my voice" | troubleshooting | writtten never touches your prose | comment | manifesto |
| 5 | r/selfhosted · r/opensource | local-first / OSS writing tools | discovery | OSS + BYOK + no account | Show-style share | README + demo |

### 4. Search simulation (the sleeper output — feeds the manifesto *and* GEO)

**Likely Google/Reddit searches:** "AI writing tool that doesn't write for you" · "AI feedback on my writing without rewriting" · "Grammarly alternative that catches logic not grammar" · "how to find contradictions in my own PRD/document" · "is AI making me a worse writer" · "tool to critique my draft not rewrite it" · "local-first open-source writing assistant".

**Likely AI prompts:** "Is there a writing tool that critiques my draft but never rewrites it?" · "What catches contradictions between different sections of my PRD?" · "Grammarly but for logic/meaning, not grammar?" · "AI writing help that won't erode my own thinking?"

### 5. Content ideas (Reddit language → asset)

| Content idea | Source pain | Where it travels | Format |
|---|---|---|---|
| "I built an AI writing tool that refuses to write for you" (the manifesto) | cognitive debt / voice loss | r/writing, HN, r/ArtificialIntelligence | essay |
| "How to catch the contradiction between §2 and §9 of your own PRD" | hidden PRD contradictions | r/ProductManagement | short guide + demo |
| "Grammarly checks your grammar. Nothing checks your argument." | surface-only tools | r/writing, LinkedIn | POV post |
| "Provoke, don't prescribe: building against the apply button" | tools-for-thought doctrine | r/ObsidianMD, Dev.to | build-in-public post |

### 6. Next actions

1. Publish the manifesto, then show up in the **cognitive-debt / voice-loss** threads with the *argument* (not the link) — that discourse is live and aligned right now.
2. Write the one PM-specific asset — **"self-review your PRD for contradictions"** — the hero capability, the highest-differentiation wedge, and r/ProductManagement's actual pain.
3. Set a keyword listener (GummySearch / F5Bot / Syften) on the verified phrases above so participation is real-time and authentic. *(Phase-9 depth — parked; don't pre-build.)*

## Probe 2 — GEO baseline (ran 2026-07-18)

> **Method:** search-surface + assistant-answer proxy (owner call — no login/CAPTCHA driving of ChatGPT/Perplexity). For each target query I read the **citable surface** (the sources an AI engine synthesizes from) and checked whether **writtten** appears, plus this assistant's own cold answer as a data point. This is the before-picture for the Phase-9 GEO/AEO workstream — explicitly a proxy, not a live ChatGPT/Perplexity read.

**Headline: writtten surfaces nowhere.** Across every query the citable surface is owned by SEO listicles/roundups (inkshift, kinsta, becomeawritertoday, Forbes Vetted, eesel, ideaplan, buildbetter) and adjacent tools. A **brand-name** search (`writtten.com …`) doesn't even return writtten — the crawler returns *Writer.com* and AI-humanizer tools, i.e. the double-t name currently reads as a typo of the AI-detection/"humanizer" category. Zero brand presence; a wide-open category.

| Target query | What the surface returns | writtten? |
|---|---|---|
| "AI writing tool that doesn't write for you" | Northeastern "Using AI for Writing Feedback" guide, "I wrote without AI" essays, generic best-of listicles | No |
| "AI feedback on my writing without rewriting" | voice-preservation tools (Noren, Bookmoth, Thesify), humanizers | No |
| "Grammarly alternative that just flags issues" | Hemingway, LanguageTool, ProWritingAid, listicles | No |
| "AI editor that critiques instead of rewriting" | Ollo blog, LessWrong "Defend your Thoughts from AI Writing", "prompt ChatGPT as Devil's Advocate" hacks | No |
| "best AI tool to review a PRD" | ChatPRD (#1), BuildBetter, Telos, Notion AI — all *generate* PRDs | No |
| "local-first open-source AI writing assistant" | LocalWrite, Proton Scribe, Jan.ai, AnythingLLM | No |

**Assistant-answer data point.** Asked cold *"is there an AI writing tool that doesn't write for you?"*, this assistant (Opus 4.8, Jan-2026 cutoff — pre-dates the 2026-07-10 launch) names Hemingway (surface-only), Thesify (academic), ProWritingAid, and the "prompt a chatbot to critique" pattern — **not writtten**. Expected, and a clean baseline: models don't know it yet.

**The GEO wedge (what Phase-9 should target).** Two capabilities that *nobody* in the citable surface claims:

- **"Critique, never rewrite" as a stance.** Others offering "feedback" still rewrite (humanizers) or are surface-only (Hemingway). Writtten's *structural refusal* to touch your prose is uncontested.
- **Internal-contradiction-at-distance.** No result claims "catches the tension between §2 and §9." This is the hero capability *and* an unclaimed GEO term.

So writtten.com should carry structured, citable content answering exactly those queries — a static PWA makes this trivial (per § Tooling), and it's the "findable *by* AI" edge most OSS launches skip. **Two-motion guardrail:** publish *hand-written* citable pages; do **not** auto-generate SEO content (off-brand for a tool that mocks AI slop). Also worth fixing early: the double-t name has a **discoverability tax** — searchers/engines read `writtten` as a typo, so citable pages should spell the name prominently and pair it with the category phrase.

**Competitor read (surfaced in passing).** The PRD space is crowded with *generators* — **ChatPRD** leads and sits positioning-closest ("reviews like a CPO, questions your assumptions, coaches you to think deeper") but it still *writes the doc*; writtten's non-generation is the clean differentiator. The strongest *pain* asset is the viral **MIT Media Lab "Your Brain on ChatGPT: cognitive debt"** study — the manifesto should cite it by name.

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

**Probe sources (2026-07-18):**

- [MIT Media Lab — "Your Brain on ChatGPT: Accumulation of Cognitive Debt"](https://www.media.mit.edu/publications/your-brain-on-chatgpt/) — the viral pain anchor (EEG evidence of weakened neural connectivity + reduced ownership over writing). Cite it in the manifesto.
- [Northeastern — "Using AI for Writing Feedback"](https://learning.northeastern.edu/ai-student-guides-using-ai-for-writing-feedback/) — mainstream framing of "critique, don't rewrite"; the POV writtten productizes is already being voiced.
- [LessWrong — "And Yet, Defend your Thoughts from AI Writing"](https://www.lesswrong.com/posts/ksCwps6YjsMFBkEFQ/and-yet-defend-your-thoughts-from-ai-writing) — the tools-for-thought / defend-your-thinking audience.
- [BuildBetter — "Best ChatPRD Alternatives in 2026"](https://blog.buildbetter.ai/best-chatprd-alternatives-in-2026-ai-prd-generators-for-product-teams/) — the crowded PRD-**generator** field writtten is *not* in (ChatPRD, BuildBetter, Telos, PRDKit, Prodini, Notion AI). Positioning contrast.
- Grammarly-alternative + local-first roundups (Hemingway, LanguageTool, ProWritingAid; LocalWrite, Proton Scribe, Jan.ai) — the surface writtten must displace for its two uncontested GEO terms.
