# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> From here on this changelog is maintained automatically by **release-please** from
> conventional-commit PR titles; a new version section is prepended when a release PR merges.
> See `docs/mechanics/release_and_deploy.md`.

## [0.4.1](https://github.com/batirko/writtten/compare/writtten-v0.4.0...writtten-v0.4.1) (2026-07-10)


### Fixed

* **onboarding:** re-key stale "See it in action" demo recording + drift guard ([#166](https://github.com/batirko/writtten/issues/166)) ([047a17b](https://github.com/batirko/writtten/commit/047a17bc22dff5336241145278c3d4928bf6a676))

## [0.4.0](https://github.com/batirko/writtten/compare/writtten-v0.3.0...writtten-v0.4.0) (2026-07-09)


### Added

* **eval:** catch intra-section contradictions while typing (mechanism A, OBS-033/UX-018) ([#161](https://github.com/batirko/writtten/issues/161)) ([800abdd](https://github.com/batirko/writtten/commit/800abddb9ad662c35430a990c65cbd208930e601))
* **eval:** OBS-036 calibration cold-open — soften unknown default + rhetorical-question carve-out ([#162](https://github.com/batirko/writtten/issues/162)) ([41d165b](https://github.com/batirko/writtten/commit/41d165bf5df3752761756b20a7dcd3961ec1b439))
* **mobile:** pre-release polish — feed open by default, tap collision, note prominence ([#160](https://github.com/batirko/writtten/issues/160)) ([86f8481](https://github.com/batirko/writtten/commit/86f84814ebc1f38ad541af8b715bdd7615faccb9))


### Fixed

* **anchoring:** case-insensitive claim/anchor matching for cross-claim highlights ([#158](https://github.com/batirko/writtten/issues/158)) ([0484987](https://github.com/batirko/writtten/commit/04849877886f1898d4bbd3a1b130aacc2998ad93))
* **anchoring:** tolerate extractor-appended punctuation on re-anchor ([#164](https://github.com/batirko/writtten/issues/164)) ([13bbde4](https://github.com/batirko/writtten/commit/13bbde4731e6d78e852b840a634162df36fa0f64))
* **model:** modernize Gemini paid pools + add pool-liveness early-warning ([#163](https://github.com/batirko/writtten/issues/163)) ([a51ba9d](https://github.com/batirko/writtten/commit/a51ba9d76ba58190741843249baea2160ab64af6))
* **ui:** restore activity-center "working" pulse in production builds ([#165](https://github.com/batirko/writtten/issues/165)) ([065afcf](https://github.com/batirko/writtten/commit/065afcf69d75b49671e52e8d6fa72094b6dc6898))

## [0.3.0](https://github.com/batirko/writtten/compare/writtten-v0.2.0...writtten-v0.3.0) (2026-07-09)


### Added

* **control-center:** ship the LLM debug drawer in production ([#152](https://github.com/batirko/writtten/issues/152)) ([dae2c16](https://github.com/batirko/writtten/commit/dae2c16c7b7dc43e818145123b3d4a93272899c9))
* **control-center:** weak/strong tier colour cue on the activity dot ([#122](https://github.com/batirko/writtten/issues/122)) ([c4bb1aa](https://github.com/batirko/writtten/commit/c4bb1aa58f2de635ddb92abcaab13ad75be5db4f))
* **editor:** C8 — pin a highlighted span's card on click ([#119](https://github.com/batirko/writtten/issues/119)) ([c777c6c](https://github.com/batirko/writtten/commit/c777c6cdee406a7bf11f122df6b65a41984eddf4))
* **evaluator:** UX-008 backend — emit anchorQuote verbatim excerpt ([#123](https://github.com/batirko/writtten/issues/123)) ([742550b](https://github.com/batirko/writtten/commit/742550b39633d839dbb23dd9c9f8cba4d8eb424b))
* **feed:** document-scope card marker + honest affordance ([529fd03](https://github.com/batirko/writtten/commit/529fd033e7e111415abaf0c962eb5bcd8993df3d))
* **feed:** document-scope card marker + honest affordance ([31aa184](https://github.com/batirko/writtten/commit/31aa1849581720f4cee4ddb577744741cb0cc064))
* **feed:** mid-sentence anchor quote — ellipsis fence, no forced capital (UX-008) ([#137](https://github.com/batirko/writtten/issues/137)) ([f2c06ae](https://github.com/batirko/writtten/commit/f2c06ae0a747de96eb752bc76c20ede87814c180))
* **onboarding:** curate "See it in action" demo for observation-type variety ([#141](https://github.com/batirko/writtten/issues/141)) ([d73a701](https://github.com/batirko/writtten/commit/d73a70130454e1803543f71a4da65b61a0f93fff))
* **onboarding:** demo coachmarks + clearer tension/missing-topic cards ([#143](https://github.com/batirko/writtten/issues/143)) ([ab54853](https://github.com/batirko/writtten/commit/ab54853b1f805f68b265984a086dbe388ba05127))
* **onboarding:** first-run activation — blocking welcome modal + keyless banner ([#114](https://github.com/batirko/writtten/issues/114)) ([5f347bd](https://github.com/batirko/writtten/commit/5f347bde1bde52910b5153ec952aad829dbea066))
* **onboarding:** redesign coachmarks — gutter stack, spread, two-layer cards ([#147](https://github.com/batirko/writtten/issues/147)) ([6f03265](https://github.com/batirko/writtten/commit/6f0326542a6e9273e6d2796d8d6ce8a70f664cbb))
* **settings:** affirm the active provider with an inline checkmark ([#117](https://github.com/batirko/writtten/issues/117)) ([40263d2](https://github.com/batirko/writtten/commit/40263d2481d0391aa81d1a0a94191286f1ff86ca))
* **settings:** dynamic per-provider model list (replaces preset catalogs) ([#125](https://github.com/batirko/writtten/issues/125)) ([5c7da3f](https://github.com/batirko/writtten/commit/5c7da3f607168857d26b710f6826c8dd9cb49073))
* **settings:** flat layout + simplified copy (revert sections, thin redundancy) ([#142](https://github.com/batirko/writtten/issues/142)) ([16eba1b](https://github.com/batirko/writtten/commit/16eba1b4dc34ffc8dd0262b5e5500e69f0406c68))
* **settings:** shared key-privacy line + Remove-key control (all providers) ([#115](https://github.com/batirko/writtten/issues/115)) ([566cecc](https://github.com/batirko/writtten/commit/566cecc1669f057e33686f66937b72bed370b5e2))
* **settings:** widen + regroup the settings modal into labeled sections ([#139](https://github.com/batirko/writtten/issues/139)) ([a7d6878](https://github.com/batirko/writtten/commit/a7d6878fabd7ecf7ca7f276cbf670c1ef9877576))


### Fixed

* **byok:** make the "Key set" subtitle honest about verification ([#151](https://github.com/batirko/writtten/issues/151)) ([7ff0006](https://github.com/batirko/writtten/commit/7ff0006f21061b8f9cf0a03ee249af65ce30e3a3))
* **deploy:** match release-please's component tag + add manual dispatch ([#110](https://github.com/batirko/writtten/issues/110)) ([7edc781](https://github.com/batirko/writtten/commit/7edc7815d386c8cc252ad8e004beef7fbe5fc9ef))
* **diagnostics:** L9 — persist the debug log + switch, add a top-level ErrorBoundary ([#120](https://github.com/batirko/writtten/issues/120)) ([a361969](https://github.com/batirko/writtten/commit/a36196966e85927fd59587c244b39d170836f436))
* **editor:** C10 — drop the redundant canvas focus outline ([#118](https://github.com/batirko/writtten/issues/118)) ([8f78593](https://github.com/batirko/writtten/commit/8f7859315c142d9f149271f240c81acae04eef0a))
* **editor:** C9 — resolve overlapping/co-located highlights by coordinate ([#116](https://github.com/batirko/writtten/issues/116)) ([6c9ffac](https://github.com/batirko/writtten/commit/6c9ffac1a2f0a22cae6d3c4111b8c8c4dbe63159))
* **evaluator:** OBS-032 — anchor reworded cross-claims to the body, not the heading ([#121](https://github.com/batirko/writtten/issues/121)) ([4073e8c](https://github.com/batirko/writtten/commit/4073e8c242996853bd308501af6d78b0ada8137c))
* **feed:** C9 — stack co-located cards in the SpanPeek float, not the feed ([#126](https://github.com/batirko/writtten/issues/126)) ([f88875d](https://github.com/batirko/writtten/commit/f88875d5d297c063029345d04da1fd500dd33f1d))
* **highlight:** suppress stale exact-anchor highlights instead of painting wrong words ([#140](https://github.com/batirko/writtten/issues/140)) ([ed055ce](https://github.com/batirko/writtten/commit/ed055cec2bcb8f5a87d0bd119f49ea7ddf8e8054))
* **ledger:** evict former-representative claims when a section's rep id migrates ([#146](https://github.com/batirko/writtten/issues/146)) ([25575a8](https://github.com/batirko/writtten/commit/25575a8a0a9b182f0c13376e3d4a628f271015b1))
* **model:** drop temperature from OpenAI requests — GPT-5.x rejects it ([#128](https://github.com/batirko/writtten/issues/128)) ([df7bda7](https://github.com/batirko/writtten/commit/df7bda77127377c5ad09067db3d051583b8f92cb))
* **onboarding:** coachmark canvas ring covers the whole canvas; obvious dismiss ([#145](https://github.com/batirko/writtten/issues/145)) ([facbda1](https://github.com/batirko/writtten/commit/facbda1688cf83af7023575e10aa77a7ee0c5190))
* **onboarding:** welcome modal shouldn't auto-ring "Add your key" on open ([#124](https://github.com/batirko/writtten/issues/124)) ([da7a532](https://github.com/batirko/writtten/commit/da7a532f55c44546145c60e5492fc013aeee41c5))
* **settings:** honest "What's running" card — keyless preview + Gemini rotation ([#113](https://github.com/batirko/writtten/issues/113)) ([47a86a6](https://github.com/batirko/writtten/commit/47a86a60180283f5ddcb10486c1987e65ff0fa8b))
* **settings:** stop browser "save password" prompt on API-key fields ([#148](https://github.com/batirko/writtten/issues/148)) ([18da73a](https://github.com/batirko/writtten/commit/18da73abec65e5d69b7012313f15aea4fc598c21))
* **signal:** unsupported_claim card body was a verbatim restatement of the cited span (OBS-032) ([#127](https://github.com/batirko/writtten/issues/127)) ([0ccd87f](https://github.com/batirko/writtten/commit/0ccd87fa04140de7dc5eeac3cd719e24f1744f32))

## [0.2.0](https://github.com/batirko/writtten/compare/writtten-v0.1.0...writtten-v0.2.0) (2026-07-07)


### Added

* add code and architecture audit snapshots for 2026-06-10 ([d6a1cd4](https://github.com/batirko/writtten/commit/d6a1cd4d85c7e43f4f2fbd78d398d3a75ce6739f))
* add competitor analysis for Proof, highlighting key differences and implications for our approach ([bf61483](https://github.com/batirko/writtten/commit/bf61483c43469a28a7b7eb0e4846b66a64e6ffc8))
* add concept and features documentation for AI writing assistant ([185492a](https://github.com/batirko/writtten/commit/185492a22a672d3751768bd484e92ace6217702d))
* add evaluation signal quality findings and section as evaluation unit design ([26f76b2](https://github.com/batirko/writtten/commit/26f76b26abaf232c1eeea2607134b9fc78478e52))
* add message generation workflow and phased plan documentation ([c291ac1](https://github.com/batirko/writtten/commit/c291ac101e990ad021f9dafe3899c9bc617c76bb))
* Add UX quality observations log and implement placeholder extension in editor ([fb9eeda](https://github.com/batirko/writtten/commit/fb9eeda9965d9dc30a3a075083c49b756dcb86ec))
* **byok:** two-field Gemini free + paid key (dual-key rotation in-product) ([#105](https://github.com/batirko/writtten/issues/105)) ([f12866e](https://github.com/batirko/writtten/commit/f12866efd396622372d5c8174ef3683e5f2e4775))
* complete Phase 5 mid-tier deliverables (Egress, Trust, Accessibility, Debug Unify) ([74635e4](https://github.com/batirko/writtten/commit/74635e47ceb95d39983382aee89087ff62c140c0))
* **control-center:** fold the LLM debug panel into the process drawer ([#73](https://github.com/batirko/writtten/issues/73)) ([52a6e1c](https://github.com/batirko/writtten/commit/52a6e1c95f660ba3c30674ccc1354662e26da8b9))
* **deploy:** Cloudflare Pages hosted-demo infra + social meta ([#104](https://github.com/batirko/writtten/issues/104)) ([b139b24](https://github.com/batirko/writtten/commit/b139b243e4943f5d96ffa71aba7fd89726f9d274))
* **deploy:** release-gated deploys + versioning ([#107](https://github.com/batirko/writtten/issues/107)) ([356a56f](https://github.com/batirko/writtten/commit/356a56fac1c69ab34fedaee6a3e55346347e9d62))
* **editor:** bubble menu, slash menu, and Link extension (UX-004) ([#29](https://github.com/batirko/writtten/issues/29)) ([f96af6a](https://github.com/batirko/writtten/commit/f96af6ae88d7d55d555763c84613e281651bfc7a))
* **editor:** reveal the contradiction peek on span-hover (glance) ([#63](https://github.com/batirko/writtten/issues/63)) ([99d8cb8](https://github.com/batirko/writtten/commit/99d8cb84d398e1d3fa8c79bf10b86d5cc27b8bba))
* **editor:** section-boundary commit debounce (revert-aware eval, M1) ([#78](https://github.com/batirko/writtten/issues/78)) ([c64ff7d](https://github.com/batirko/writtten/commit/c64ff7d62fdc83dc745e7a33f6aebe53e1f514d3))
* Enhance documentation with quality remediation synthesis and UX/prompt quality observations analysis ([647c934](https://github.com/batirko/writtten/commit/647c934812aeedb9eb281d998651043e6f26c312))
* Enhance security by aliasing API keys in logs and improve Gemini routing logic ([2a8d0b5](https://github.com/batirko/writtten/commit/2a8d0b572089503a10eb72a2f78e00396abe47a5))
* **eval:** maturity-aware severity for structural gaps (R2 + UX-013) ([#71](https://github.com/batirko/writtten/issues/71)) ([c1d6065](https://github.com/batirko/writtten/commit/c1d60653636bd82988c471ab6ef3a4677111c05d))
* **eval:** Phase 4 — strategic_tension observation type ([dfc0be7](https://github.com/batirko/writtten/commit/dfc0be7bb232b37b731dcea2d8a3ecc52a7d0dc5))
* **eval:** R6 — fast-tier precision hardening (OBS-024 prompt fix + OBS-002 fixture) ([#23](https://github.com/batirko/writtten/issues/23)) ([13a5de4](https://github.com/batirko/writtten/commit/13a5de4f93cb272d20b7172ccfa2832e3ba335b5))
* **evaluator:** Phase 4 — jargon allow-list (preset + user dictionary) ([e56cb0b](https://github.com/batirko/writtten/commit/e56cb0b889cac22798845f075b7eeab2c78fae5e))
* **feed:** blend priority into feed display order (UX-015) ([#35](https://github.com/batirko/writtten/issues/35)) ([69ebe49](https://github.com/batirko/writtten/commit/69ebe49d229cd763035a394d29db519b829f88da))
* **feed:** C3 dismiss + Undo toast with suppression rollback ([#88](https://github.com/batirko/writtten/issues/88)) ([fcc6a09](https://github.com/batirko/writtten/commit/fcc6a09d3c3d0c2ba4c413f4995ae9c766536310))
* **feed:** C3 rework — in-place dismiss placeholder, deferred commit ([#91](https://github.com/batirko/writtten/issues/91)) ([0a4add1](https://github.com/batirko/writtten/commit/0a4add1481026016523b4db50f18347961e771e0))
* **feed:** C7 gentle always-on highlight density ([#84](https://github.com/batirko/writtten/issues/84)) ([1c84a6b](https://github.com/batirko/writtten/commit/1c84a6b58f14321a250768232af1c83eb9fafef2))
* **feed:** distant-contradiction peek + C2 click-to-locate & pulse (UX-009) ([#51](https://github.com/batirko/writtten/issues/51)) ([963e0a3](https://github.com/batirko/writtten/commit/963e0a33ab25732e5531fd4bfeb808c74b841224))
* **feed:** G4 — discomfort-budget ceiling (floor + ceiling hybrid) ([#18](https://github.com/batirko/writtten/issues/18)) ([bacd1a8](https://github.com/batirko/writtten/commit/bacd1a868751aff69f72c919f6f2c2dbdd0da5d0))
* **feed:** quoted-text subtitle on observation cards (UX-008) ([#49](https://github.com/batirko/writtten/issues/49)) ([78b270f](https://github.com/batirko/writtten/commit/78b270f87647a820caf7a85018cf6a6a5efa1ecc))
* **feed:** R3c — feed choreography (enter/exit animation + NEW badge) ([#22](https://github.com/batirko/writtten/issues/22)) ([e004404](https://github.com/batirko/writtten/commit/e0044045a66cb81976079930d172f4709450d47a))
* **feed:** R7a — impact legibility v2 (HIGH/MED/LOW label + popover) ([#21](https://github.com/batirko/writtten/issues/21)) ([37b5544](https://github.com/batirko/writtten/commit/37b55448beb702501c59220283d20f08f79c1499))
* **feed:** reverse hover — span → feed, collapse-aware (UX-006) ([#50](https://github.com/batirko/writtten/issues/50)) ([10ee529](https://github.com/batirko/writtten/commit/10ee5295318dc88101d28b90e501417184550550))
* **feed:** shorten dismiss placeholder window to ~3s ([#92](https://github.com/batirko/writtten/issues/92)) ([22ed1d2](https://github.com/batirko/writtten/commit/22ed1d2fac1215edadcbd6b38a545caa7352d347))
* implement acceptance harness for Phase 1 observability and contradiction detection ([d4119aa](https://github.com/batirko/writtten/commit/d4119aa20c2ede11928fe35e4f6cbd6b429ef9be))
* Implement document data clearing functionality in db.ts ([2106bef](https://github.com/batirko/writtten/commit/2106bef02a82baa2d1d8994c0d1293b117ea5804))
* implement egress and install milestones for Markdown export, rich-text copy, and PWA support ([167cf2b](https://github.com/batirko/writtten/commit/167cf2b39af8a3d115d06b8af2fac2a3f6641baa))
* implement evaluation orchestration and logging for editor blocks ([cdd17e5](https://github.com/batirko/writtten/commit/cdd17e57f2cfae9bc9ff0c6cd2b050e03cb0a92c))
* implement file import functionality and semantic paste handling in the editor ([764d802](https://github.com/batirko/writtten/commit/764d8021e40438f88520a4bac7656a178cf98e2c))
* Implement G1 flattery-resistant dismissal logic and anti-taxonomy guardrails ([17fe156](https://github.com/batirko/writtten/commit/17fe1561ee0dce5dc876623a69264a137ee36995))
* Implement LLM logging functionality ([2106bef](https://github.com/batirko/writtten/commit/2106bef02a82baa2d1d8994c0d1293b117ea5804))
* L1 — repair build/lint gates and add CI ([4bd3af3](https://github.com/batirko/writtten/commit/4bd3af3d1af97cce3c9b55e15d638235e4c975b2))
* L5a — match dismissal suppressions by anchor text (offset fallback) ([1d5c2f6](https://github.com/batirko/writtten/commit/1d5c2f68f28bd20c75b57231d711dcb13ed16bd2))
* L5b — re-anchor highlights by anchorText on rebuild ([f043e5c](https://github.com/batirko/writtten/commit/f043e5ced34b322debe3af48dbdf217db5384d75))
* L5c — unify per-section conflict identity on conflictPairKey ([28f0dbb](https://github.com/batirko/writtten/commit/28f0dbb3d0194bbfac62962fee86acf5abe43054))
* L6 — split evaluator.ts into focused submodules ([80f8b5e](https://github.com/batirko/writtten/commit/80f8b5eb748e58b1060c62475fe93dd7ca5adb65))
* L6 — split evaluator.ts into focused submodules ([b6a2c92](https://github.com/batirko/writtten/commit/b6a2c92b13f4b1e698704a2aedc7f5f1a87bb874))
* L7 — close prod prompt-leak (debug panel default off + DEV-gate) ([1952ef7](https://github.com/batirko/writtten/commit/1952ef71aed8c3bd12d0a445b09a9574f653ccf5))
* L7 — close prod prompt-leak (debug panel default off + DEV-gate) ([6a31c43](https://github.com/batirko/writtten/commit/6a31c430d6204784a6936b2c130a169093560264))
* **mobile:** Phase-6 courtesy pass — stack + collapse + honesty note ([#94](https://github.com/batirko/writtten/issues/94)) ([8e49fc5](https://github.com/batirko/writtten/commit/8e49fc5034475e89304d863d6a5994f065a7e40d))
* **model:** OpenAI + Anthropic adapters + provider registry (multi-provider PR 2) ([#98](https://github.com/batirko/writtten/issues/98)) ([c3c461b](https://github.com/batirko/writtten/commit/c3c461b67390bf163e2fa8c0fe64a1a5f196153f))
* **onboarding:** auto-dismiss welcome card + remove settings reactivation ([#90](https://github.com/batirko/writtten/issues/90)) ([a574f4e](https://github.com/batirko/writtten/commit/a574f4e00ea984529e73d94d35a3bfd7e1e72139))
* **onboarding:** fall back to the recording when a keyed example run fails ([#75](https://github.com/batirko/writtten/issues/75)) ([6d65196](https://github.com/batirko/writtten/commit/6d651965e9d1ca252a7b75da59ed87d81287859f))
* **onboarding:** first-run welcome moment + "See it in action" example ([#67](https://github.com/batirko/writtten/issues/67)) ([73f79a4](https://github.com/batirko/writtten/commit/73f79a4ed4779120c207a04cbb2b8f7662779742))
* **onboarding:** keyless replay so "See it in action" fires without a key ([#72](https://github.com/batirko/writtten/issues/72)) ([5e2a453](https://github.com/batirko/writtten/commit/5e2a45335f9aebb085b9d147a220907f36a74460))
* **onboarding:** reset path + verify first-settle & no-upfront-setup ([#79](https://github.com/batirko/writtten/issues/79)) ([0006aa9](https://github.com/batirko/writtten/commit/0006aa9ad25d08fbff4ee03e78ac2ed30f0ef8bf))
* Phase 0 scaffold — editor, persistence, model router ([c252f8f](https://github.com/batirko/writtten/commit/c252f8fe69d375fb231a9465a6f1d922aa21f782))
* Phase 4 field-test blockers — R5, R1, R3, R7a ([78f9e91](https://github.com/batirko/writtten/commit/78f9e9152264a61b5147fe79ed652a161c050f2a))
* R6 fast-tier precision hardening + clarity discrimination fixtures ([d19e3dc](https://github.com/batirko/writtten/commit/d19e3dce5b8d93699e8c0470959785ef1e0f02df))
* **R7a:** add severity/confidence impact badge to observation cards ([ca50746](https://github.com/batirko/writtten/commit/ca50746b20f70a48791f55952934645f600b520a))
* **ratchet:** add clarity discrimination fixtures (G2 audit [#8](https://github.com/batirko/writtten/issues/8)) ([#20](https://github.com/batirko/writtten/issues/20)) ([8b44ea4](https://github.com/batirko/writtten/commit/8b44ea4492f465a65f48a215fa36048ae4d6ca49))
* refactor evaluation to use sections instead of blocks ([e4baa6e](https://github.com/batirko/writtten/commit/e4baa6ed801276bbdf6e9ba20ecc45e8eb25a26b))
* **services:** Phase 4 Milestone B — priority function ([2cae10d](https://github.com/batirko/writtten/commit/2cae10da391021d7b2b7f6fca9eadb04bc784515))
* **settings:** auto-detect Gemini free-vs-paid tier, drop the manual checkbox ([#100](https://github.com/batirko/writtten/issues/100)) ([74d5381](https://github.com/batirko/writtten/commit/74d5381df4d3caa6388bffaa97231fa8688fd024))
* **settings:** multi-provider BYOK Settings UX + close-out (multi-provider PR 3) ([#99](https://github.com/batirko/writtten/issues/99)) ([a4cba34](https://github.com/batirko/writtten/commit/a4cba346a5d21348e059230db79711f538c11e29))
* **sidecar:** Phase 4 — observation aggregation (same-span grouping) ([64fd008](https://github.com/batirko/writtten/commit/64fd00862de9075896edc15144e3030301d9522f))
* **sidecar:** Phase 4 Milestone E — priority-budget calm feed (Stage 1) ([1975833](https://github.com/batirko/writtten/commit/1975833b6ce286462ad11471377165fa9c7e2c49))
* **signal:** document-class calibration — genre-aware strictness (OBS-023) ([#45](https://github.com/batirko/writtten/issues/45)) ([a59a30d](https://github.com/batirko/writtten/commit/a59a30d10241da1eb32b394b42e393e2f517bf74))
* **signal:** emotional register + context chip (Phase 6) ([#30](https://github.com/batirko/writtten/issues/30)) ([3bcd03b](https://github.com/batirko/writtten/commit/3bcd03b02f1ba0f3a19501078fc3059183c0622f))
* **signal:** faithful contradiction/tension messages, no Claim #N leak ([#80](https://github.com/batirko/writtten/issues/80)) ([f666481](https://github.com/batirko/writtten/commit/f66648161ec02b632b77a8cb95fa8cb6aedd9a74))
* **signal:** inject cross-section context into section-eval (OBS-027) ([#41](https://github.com/batirko/writtten/issues/41)) ([936ce75](https://github.com/batirko/writtten/commit/936ce7543bbf6452bd7af63a786507a9d7243fc4))
* **signal:** opinion/apprehension carve-out for unsupported_claim (OBS-028) ([#44](https://github.com/batirko/writtten/issues/44)) ([f5034dd](https://github.com/batirko/writtten/commit/f5034dd781265e1b4a66865967fa8d2c64057f2f))
* **signal:** tone as a measured eval dimension (emotional register, Phase 6) ([#85](https://github.com/batirko/writtten/issues/85)) ([22feb6a](https://github.com/batirko/writtten/commit/22feb6ab97fa49c6b63b5358f6016c1a256bdea2))
* **store:** Phase 4 Milestone A — observation metadata axes ([e6b5a2f](https://github.com/batirko/writtten/commit/e6b5a2f54d18f1a220537bb48e858d7272624fee))
* **ui:** Phase 4 — severity/kind/confidence badging on observation cards ([1958b54](https://github.com/batirko/writtten/commit/1958b54cf3c58046abc5df39cfffe58e3b82df6e))
* Update evaluation logic and documentation for clarity and consistency; implement discomfort-budget ceiling ([b7b3780](https://github.com/batirko/writtten/commit/b7b37803cb3017067a53c37b6d77d7d566f8334f))
* update evaluator quality ratchet for Phase 5 and enhance scoring precision ([7d97483](https://github.com/batirko/writtten/commit/7d97483058559b255a31ecc2c02c2693c3db41fc))
* **validation:** stratify V1 corpus by doc type + reproducible sourcing ([#89](https://github.com/batirko/writtten/issues/89)) ([6eed4a7](https://github.com/batirko/writtten/commit/6eed4a75f7a2f141f6a81a4646a51fab6c269532))
* **validation:** V1 base-rate corpus study — runner, scorers & labeling-sheet artifact ([#87](https://github.com/batirko/writtten/issues/87)) ([2d5d8ac](https://github.com/batirko/writtten/commit/2d5d8ac7b43ce0cb1fa5a691d15f5dee952bcc6c))


### Fixed

* **control-center:** calm-blue working dot, grey-green idle, consistent card cursor ([#61](https://github.com/batirko/writtten/issues/61)) ([1ae9a68](https://github.com/batirko/writtten/commit/1ae9a68ca92ac59ea43eed190620f61d5a09df6a))
* **control-center:** color the "working" status text calm blue, not amber ([#74](https://github.com/batirko/writtten/issues/74)) ([ce4c65d](https://github.com/batirko/writtten/commit/ce4c65d22b98de84cdfac09c6321d96bbb02a9c7))
* **debug:** restore LLM call log in debug panel + drop phantom call records ([#57](https://github.com/batirko/writtten/issues/57)) ([fff26c5](https://github.com/batirko/writtten/commit/fff26c5513b5bd3f065919311fc77216789d2849))
* **deploy:** feat commits bump minor, not patch, pre-1.0 ([#108](https://github.com/batirko/writtten/issues/108)) ([c0d17fd](https://github.com/batirko/writtten/commit/c0d17fda2984d40d00776f672a16a153fcc6d9cd))
* disable Markdown Studio autosave so opening a doc can't strip index links ([e1dca98](https://github.com/batirko/writtten/commit/e1dca9855b1a3d586df127a0d95126f1fb9d647d))
* disable Markdown Studio autosave so opening a doc can't strip index links ([c5d1e50](https://github.com/batirko/writtten/commit/c5d1e5037bdfbc04f99b63d847d432b16c8d0a47))
* **editor:** at-rest highlight for unsupported_claim & undefined_jargon spans ([#68](https://github.com/batirko/writtten/issues/68)) ([87ae3b7](https://github.com/batirko/writtten/commit/87ae3b775b2a2626ac2eb21451d83979ab0739da))
* **editor:** transient highlight for downgraded "also noticed" spans ([#64](https://github.com/batirko/writtten/issues/64)) ([3c2196a](https://github.com/batirko/writtten/commit/3c2196a661ca65c419e4f7c40eb5c0135538bee8))
* enhance lifecycle integrity and correct silent failure paths ([7d97483](https://github.com/batirko/writtten/commit/7d97483058559b255a31ecc2c02c2693c3db41fc))
* **eval:** anchor conflicts to the claim's real block, not the section heading ([#60](https://github.com/batirko/writtten/issues/60)) ([e02041e](https://github.com/batirko/writtten/commit/e02041e68017b59d7439b5b00e262ce9d651eda8))
* **eval:** dedup near-identical strategic_tension observations via text similarity (OBS-025) ([#19](https://github.com/batirko/writtten/issues/19)) ([bda63ea](https://github.com/batirko/writtten/commit/bda63eab41d643431df4f3515f5ab4c62131c949))
* **eval:** precise conflict anchoring + cross-type dedup + self-conflict guard ([#56](https://github.com/batirko/writtten/issues/56)) ([33f9fe9](https://github.com/batirko/writtten/commit/33f9fe90a14f04895dbb83ae741898e48dc24968))
* **eval:** run the import contradiction sweep against a populated ledger ([#70](https://github.com/batirko/writtten/issues/70)) ([7596e41](https://github.com/batirko/writtten/commit/7596e418f564655c870e536fbe76ecc978256ee1))
* **eval:** tolerate trailing punctuation when anchoring claims ([#62](https://github.com/batirko/writtten/issues/62)) ([0a09b18](https://github.com/batirko/writtten/commit/0a09b18870ead22f136b01652f0aa6cefdcc6b01))
* **eval:** wire loadBlockSummariesForDocument into the live-ratchet db mock ([#43](https://github.com/batirko/writtten/issues/43)) ([7ffe1cc](https://github.com/batirko/writtten/commit/7ffe1cc40864b322f12278c85bcc6976bacd1f4c))
* **feed:** default cursor across the whole observation card except the dismiss button ([#69](https://github.com/batirko/writtten/issues/69)) ([4ce9ca5](https://github.com/batirko/writtten/commit/4ce9ca5802250b82ca1af9bdddf10b0b0d4727f3))
* **feed:** differentiate NEW badge from impact labels; extend to 2s ([#24](https://github.com/batirko/writtten/issues/24)) ([a7f4e45](https://github.com/batirko/writtten/commit/a7f4e454133bbb58c57125c4a9e4aa9609d8ef40))
* **feed:** drop "Whole document" subtitle; show only the message when there's no quote ([#54](https://github.com/batirko/writtten/issues/54)) ([63f88f5](https://github.com/batirko/writtten/commit/63f88f57bc25861287a1ea86e7f57f34311a6684))
* **feed:** NEW badge now clears correctly after 2s ([#25](https://github.com/batirko/writtten/issues/25)) ([bede0ff](https://github.com/batirko/writtten/commit/bede0ff9731c9f11be636d020e9e12d50d3fd1f0))
* **feed:** session UI fixes — popover, NEW badge, page-reload flash ([#26](https://github.com/batirko/writtten/issues/26)) ([98a723b](https://github.com/batirko/writtten/commit/98a723bf1e8863cebd213cac62cadcdd5da4164b))
* **feed:** surfaced-only highlights + float reverse-hover at gutter top ([#53](https://github.com/batirko/writtten/issues/53)) ([32cc7e9](https://github.com/batirko/writtten/commit/32cc7e9ae6eb80a790d47f057a2c0e7564f13822))
* L2 — auto-close observations when their span is deleted ([4e06afb](https://github.com/batirko/writtten/commit/4e06afbedce2c9e00389df213b84020475a64ad4))
* L3 — atomic dirty-check so a failed strong call can't wedge a section ([bb49170](https://github.com/batirko/writtten/commit/bb49170b127ffc2bb6e919e06ebe664444b6ba62))
* L4 — generation guard so a removed section can't resurrect claims ([3007baa](https://github.com/batirko/writtten/commit/3007baa78c9c4f9dadab8d9a291e56626aaae006))
* **lifecycle:** revert-aware evaluation via content-hash snapshot/restore (UX-014) ([#40](https://github.com/batirko/writtten/issues/40)) ([b8942d9](https://github.com/batirko/writtten/commit/b8942d9cec03cc60cd86ad43099e0ab94365d3c2))
* **mobile:** make the control-center tap-to-open on touch ([#101](https://github.com/batirko/writtten/issues/101)) ([f90946b](https://github.com/batirko/writtten/commit/f90946bcbb4b2e4278d19d2f51dba09e1c17085d))
* **onboarding:** dial down welcome-card body text to 14px ([#83](https://github.com/batirko/writtten/issues/83)) ([498097b](https://github.com/batirko/writtten/commit/498097be9d16f27dee7bc0b1a63c2c72b675028a))
* **onboarding:** example link on the welcome card only; sans-serif welcome copy ([#82](https://github.com/batirko/writtten/issues/82)) ([447d493](https://github.com/batirko/writtten/commit/447d493b53715d6371fe7f542eccae1666e3bd46))
* **pwa:** real installable icons + maskable + apple-touch + screenshots ([#106](https://github.com/batirko/writtten/issues/106)) ([d6d174e](https://github.com/batirko/writtten/commit/d6d174e6aea75c5eeda43a8a83b7ce1d9d7a47f3))
* **R1:** remove window-blur settle trigger; serialize doc-idle with section evals ([3493109](https://github.com/batirko/writtten/commit/34931090c10c7b9e6f95c16dc0e7e03b9e3ff52f))
* **R3:** improve reconciliation/lifecycle engine and inject prior obs ([ca8248e](https://github.com/batirko/writtten/commit/ca8248e1d70c5d685e2a4ff0c662405dcda59ef7))
* **R5:** position-aware offset→PM-pos mapping in ObservationHighlighter ([f524503](https://github.com/batirko/writtten/commit/f5245033d53ac674eea0453eb5e531a504be7908))
* remove jargonAllowlist prop from SidecarFeed call-site in App.tsx ([4860f84](https://github.com/batirko/writtten/commit/4860f8460061aa8e11c1ace49714ecc6778e179f))
* remove unused jargonAllowlist props from SidecarFeed after UX-005 removal ([3b653bf](https://github.com/batirko/writtten/commit/3b653bf3883be6675eb79f75bb1869404c8d76a3))
* **settings:** Gemini "what's running" card now reflects the detected paid tier ([#102](https://github.com/batirko/writtten/issues/102)) ([4d66586](https://github.com/batirko/writtten/commit/4d665860824c85220b907805b5c5185275aeb8c2))
* stop Markdown Studio WYSIWYG editor from stripping index links ([c197928](https://github.com/batirko/writtten/commit/c1979281535d70d6c79be5b42a0a2ecd49b9cfbb))
* stop Markdown Studio WYSIWYG editor from stripping index links ([e5bdc64](https://github.com/batirko/writtten/commit/e5bdc6473eb5b7e3c23469e5fd0b718f0de68719))


### Changed

* **model:** lift Gemini resilience into provider-agnostic seam (multi-provider PR 1) ([#97](https://github.com/batirko/writtten/issues/97)) ([a45a532](https://github.com/batirko/writtten/commit/a45a5320cf7c8d9ade9b382275657b10bea769b7))

## [Unreleased]

### Added

- **Release-gated deploys + versioning.** Merges to `main` accumulate on a standing
  release PR (release-please) instead of shipping on every push; merging that PR tags a
  version and triggers the single public deploy to `writtten.com` via `wrangler`. The
  running build now shows `writtten vX.Y.Z · <git-sha>` at the foot of Settings.
- Open-source launch scaffolding: `LICENSE` (Apache-2.0), `README`, `CONTRIBUTING`,
  `SECURITY` (with an honest data-egress disclosure), `CODE_OF_CONDUCT`, and GitHub
  issue/PR templates — including a signal-quality (false-positive/negative) issue path.

## [0.1.0] — first public release

The first open-source release. The core inversion works end to end: you write, and a
calm, priority-ranked feed of AI **observations** rides alongside — it never rewrites
your prose.

### Highlights

- **The write → observe loop.** Incremental, debounced evaluation over semantic
  sections; observations settle in a calm feed as content stabilizes, and stay quiet
  while you're still forming ideas.
- **Contradiction detection (the hero).** A claim ledger powers cross-document checks;
  conflicting claims highlight both sides. Deliberate tradeoffs surface as softer
  `strategic_tension` rather than false contradictions.
- **A fixed, typed observation taxonomy** — clarity, contradiction, strategic tension,
  unsupported claim, undefined jargon, missing topic, structure/flow — never free-form
  chatter, and never an "apply fix" button.
- **Reverse-hover & click-to-locate** between the feed and the document.
- **Local-first PWA.** Document, claim ledger, and observations persist in the browser
  (IndexedDB). No accounts, no required backend, installable and offline-capable.
- **Model router** with a free Gemini tier and bring-your-own-key for stronger models.
- **Document-type calibration** so PRD-grade strictness doesn't fire on essays, memos,
  or comms.

### Known limitations

- The model router is Gemini-shaped; non-Gemini and local adapters are welcomed
  contributions.
- Free-tier evaluation sends settled text to Google's Gemini API (see `SECURITY.md`).
- Field validation with real users is early.

[Unreleased]: https://github.com/batirko/writtten/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/batirko/writtten/releases/tag/v0.1.0
