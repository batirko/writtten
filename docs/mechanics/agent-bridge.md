# Agent-source attribution and lifecycle

> **Keep this current.** If you change the source chip's states, the evaluator exemption rule, the teardown/archive flow, or where `agentSourceSignal` is written, update this file in the same task. Design contract: `docs/projects/agent_connected_eval.md` § _Trust & attribution_. The bridge transport itself (pairing, SSE, the boundary) is PR1/PR2 territory and documented in that spec.

What happens to an observation **after** an external agent's submission clears the boundary: how the feed says who produced it, and what may and may not close it.

The whole mechanic exists to pay for one accepted cost. writtten's own observations sit behind precision floors and fixture ratchets; a connected agent's cannot. Gate 1 accepted that in exchange for two containments — the user always knows **which critic is speaking**, and the evaluator never quietly disposes of **another critic's cards**. Everything below is one of those two.

---

## The field

`Observation.source` (`src/store/db.ts`) — `{ kind: "agent", name, sessionId }`, added by PR1.

- **Absent** means the built-in evaluator produced it. That is the unmarked, overwhelmingly common case, and it renders no chip: marking it would turn attribution into noise.
- **Present** means an external session submitted it through `submitExternalObservation`.
- `sessionId` is bridge-generated per run and is what attribution, retract, and revoke all scope on. `name` is a display label, sanitized at the boundary — never a permission tier.

Optional and additive, so **no IDB version bump**: legacy rows simply lack it, which reads correctly as "the evaluator wrote this".

## Attribution — the source chip

`SourceChip` (`src/sidecar/SourceChip.tsx`), rendered by `GroupedObsCard` below the quote / scope marker, on its own line. State mapping is the pure `sourceChipView` (`src/sidecar/sourceChipView.ts`).

It sits **below** the context slot rather than in the card header because the header already carries the two highest-signal elements — the type tag and the severity badge — and `doc_scope_legibility.md` is explicit that a marker must not compete with those. A doc-scoped external card therefore stacks two quiet chips (scope, then source), which is correct: both are true.

The chip subscribes to `agentSourceSignal` itself rather than taking a prop, because `GroupedObsCard` renders from two different trees (the feed, and the `SpanPeek` float) and neither should thread pairing state through.

| Chip state | When | Reads as |
| --- | --- | --- |
| `live` | the connected session **is** this card's `sessionId` | filled dot, solid border |
| `disconnected` | anything else — bridge dropped, never connected, or a *different* session is connected | hollow dot, dashed border |
| `revoked` | the user tore the pairing down and kept the cards | hollow dot, dashed border |

The third row of that table is the subtle one: **re-pairing mints a new `sessionId`**, so cards from a previous run read `disconnected` even while an agent of the same name is connected. They are not that session's cards, and saying otherwise would attribute them to a session that never wrote them.

States are carried by dot fill and border style, never hue alone (`.card-source[data-source-state]` in `styles.css`).

## Attribution survives grouping

`obsAggregation.ts`'s grouping key includes `source.sessionId`. Same-span observations from different sources **never** collapse into one card.

This is a correctness rule, not a preference. Grouping keeps only `primary` prominent and renders the rest as bare tag + text inside "N more on this passage" — with no room for a chip. An agent's observation grouped under a built-in primary would appear with **no attribution at all** until expanded, which is exactly the laundering the chip exists to prevent. Two critics on one passage stay two cards.

Two observations from the *same* session on one span still group normally.

## Reaching it at all: the preview gate

Shipped ON but **runtime-gated** (`agentBridgeEnabled()`, `src/services/featureFlags.ts`). A session sees BYOA only after opting in with **`?agent=1`**, which is remembered in `localStorage["writtten_agent_preview"]` so it survives reloads and in-app navigation — without persistence the query string would have to be re-appended for every step of the flow, and the first-run modal would lose it the moment anything navigated.

```
https://writtten.com/?agent=1     → opts this browser in, permanently
https://writtten.com/             → still on, from the stored key
```

The gate is temporary and exists for one reason: Chrome's Local Network Access prompt only fires from a **public** origin, so it is untestable anywhere but production. PR4 ships to writtten.com to answer that, and is a *verification release*, not a launch. `public/agent/index.html` carries `noindex` for the same window.

**Removing the gate is the launch action** — replace the body of `agentBridgeEnabled()` with `true` and restore `index,follow` on the page. Do it after the Phase-8 follow-ups (prompt slimming, engine exclusivity, observability), not before.

## How a user reaches the connect section

Three entry points, all landing in the same section of the Settings modal. All three are gated on `agentBridgeEnabled()` — see the preview gate above.

| Entry point | Carries |
| --- | --- |
| `WelcomeModal` (first run only) | `Connect your agent`, an **equal** peer of `Add your key` — same accent fill, joined by "or" |
| `KeylessBanner` (standing, any keyless state) | the same pair as two accent text links, both arrowed |
| Settings itself | the section, always present |

The two on-ramps are styled identically **on purpose**. Spec decision 3 calls them two equal paths, and giving either one an outline ranks them — the version that shipped first did exactly that and was corrected at review. `See it in action` sits below a short centred rule instead of third in the row: it is a different kind of choice (watch, don't set up), and peer placement flattened that.

**The deep-link starts the pairing.** `openSettings("connect-agent")` (`sidecar/settingsGate.ts` → `SettingsIntent`) opens Settings, scrolls the section into view, and calls `connect()` — but **only from `idle`**. Two reasons this is not merely a scroll:

- The modal button and the section button carry the same label. Landing on a collapsed section showing the words you just pressed reads as a failed click.
- Starting is cheap and reversible — `createPairing` only writes `localStorage`, and Cancel sits directly beneath.

The `idle` guard is load-bearing: re-starting a live pairing mints a new token and invalidates the one the user's agent is already holding.

## The connection indicator

A third row in the control-center process readout (`ControlCenter.tsx`, mapping in `agentStatusView.ts`), alongside model and status. Absent entirely when no pairing exists — most users never connect an agent, and a permanent empty row would be the one dead value in a readout of otherwise-live ones.

It carries the pairing's **own** state (`waiting` / `connected` / `disconnected`), independent of the model's status row, reusing `.connect-dot`'s visual vocabulary so the same state reads the same way in Settings and in the readout. The connect section only shows connection state while Settings is open; a second critic writing into the feed should be visible without opening a modal.

### The process readout — one verb, one noun

Two rows, split by part of speech, because they were doing overlapping jobs:

- **`status` is the verb** — what is happening right now, whichever engine is responsible. Said once. The dot mirrors it by one rule.
- **`agent` is the noun** — who is attached and whether they are still there. It carries no phase word of its own.

An earlier draft had `status` read "agent reading" while the `agent` row's sub-line read "reading · 0:20": the same fact twice in adjacent lines. The sub-line is gone; `agentStatusPhrase` feeds the status row directly.

The status vocabulary, and what the dot does with each:

| `status` | Means | Dot |
| --- | --- | --- |
| `idle` | Nothing attached, or attached and gone quiet. | rest |
| `awaiting pickup` | Snapshot sent; the agent has not read it. | rest |
| `watching` | Agent parked in `GET /wait`. | rest |
| `reading · 0:20` | Agent pulled `/doc` and is reviewing. | pulse |
| `evaluating · 2` | writtten is computing. | pulse + tier hue |
| `still working…` | Our stall detector fired. | stalled |

**`watching` vs `idle` is the distinction this vocabulary exists for.** Neither is computing, so neither pulses — but one means a critic is attached and will react the moment you type, and the other means nothing is going to happen. Collapsing them is what let a stalled watch-loop look exactly like a finished pass; a real session spent six minutes in a poll loop and the readout was indistinguishable from an agent that had wandered off.

**The dot is shared.** It answers one question — *is something reading my document right now?* — which an agent pass makes true exactly as a model call does, so it gets one vocabulary. A first draft gave the agent its own concentric ring to avoid "reusing the computation semantics"; that over-applied the rule. The constraint worth keeping is *don't imply progress you can't measure*; it does not follow that "busy" needs a second colour, and splitting the channel encoded a distinction the author has no reason to care about at the moment they most want a yes/no.

Three things stay writtten's alone, each for a mechanical reason rather than for symmetry:

| | Why |
| --- | --- |
| **Tier hue** (`fast` blue / `strong` violet) | Names *which model we called*. An agent pass has no tier, so `dotTier` keys on our own `pending`, never on the shared `working` state. |
| **`stalled` red** | Our stall detector watches our own outstanding calls. It has nothing to watch on an agent, and an agent that simply stopped is absent, not faulty. |
| **How it resolves** | Ours resolves because `pending` returns to 0; the agent's has to resolve itself, because no message ever says it finished. Different mechanism, identical visible outcome. |

`processStatusView.ts` holds the whole matrix and is the only place it lives.

### Reporting the agent's pass

Connection state is **liveness, not activity** — a chip reading `connected` says nothing about whether the agent is doing anything. And the `status` row cannot answer it either: `setActivityPending` has exactly one writer (`orchestrator.ts`) publishing *writtten's own* outstanding eval work, and BYOA makes zero model calls, so it reads `idle` for the entire time an agent is reviewing.

So the row carries a second line, derived by `agentActivityView.ts` from four raw facts on `BridgeStatus.pass` — `lastPushAt` · `lastPullAt` · `lastSubmissionAt` · `submitted`:

`agentPassPhase` derives one of five phases from four timestamps on `BridgeStatus.pass` — `lastPushAt` · `lastPullAt` · `lastSubmissionAt` · `lastWaitAt`. Whichever signal is most recent wins, which orders the watch cycle (park → wake → pull → submit → park) with no state machine. `quiet` yields the status row entirely rather than coining a second word for the same non-event; the hollow dot on the `agent` row already says "attached, not active".

**Two signals feed it that the bridge previously kept to itself.** `GET /doc` is the agent picking the document up — the missing "started" signal — and `GET /wait` is the agent parking in watch mode. Both are now one `broadcast()` in their handler and one named `addEventListener` client-side.

**Submissions are tracked as a timestamp, never a displayed count.** A rejected burst is still the agent working, so it re-arms the decay window — but it counts *submissions*, not acceptances, so a visible "5 submitted" could sit above a feed that gained nothing. The cards themselves are the honest report of what an agent contributed.

**Three constraints shape this, and each rules out an obvious alternative.**

**1. "Started" is observable; "finished" is not.** `GET /doc` is the agent picking the document up, and the bridge now `broadcast("pulled", …)`es from its `/doc` handler. There is no counterpart: the agent simply stops, and the skill tells it to report to the *user*, not to writtten. Adding a required agent-side "done" call was rejected — it grows the prompt, and a protocol that leans on a well-behaved peer to clear UI state will strand that state the first time the peer crashes.

**2. Therefore the working state must decay — and decay is *derived*, never scheduled.** `agentPassPhase(pass, now)` is a pure function of timestamps, so there is no timer to leak, no state to get stuck, and a render at any moment yields the correct phase. An unresolvable spinner is worse than no spinner; this one cannot exist. A submission re-arms the window, because an agent still submitting is still working.

**3. The vocabulary is deliberately disjoint from the `status` row.** For the API engine "in progress" means *writtten is computing*; for the agent engine writtten is *waiting on a peer*. Those are different kinds of state and must not share words — so this line never says `idle`, `working`, or `thinking` (pinned by a test), and reports facts rather than progress writtten cannot measure. The ticking elapsed counter is the liveness cue precisely because elapsed time is something we actually know; the dot is deliberately **unanimated**, and goes hollow on `quiet`.

The pass resets on a content-bearing snapshot push (a new version supersedes what the agent was reading) — done *before* the POST is awaited, so a pull or submission arriving mid-flight isn't wiped — and on a `hello` carrying a **different `sessionId`**, since a restarted bridge is a new run and must not be credited with its predecessor's output.

`pulled` is additive: the app registers *named* SSE listeners, so an older app ignores the event and an older bridge simply never sends it. **No `protocolVersion` bump.**

### When the agent goes away

`dropToDisconnected` fires after `DISCONNECT_GRACE_MS`, and until 2026-07-20 the only readout was the `agent-chip` — inside the hover/tap-gated control center, i.e. "always-on" only once you open it. The author kept writing, believing a critic was reading, and found out by opening Settings.

`AgentDroppedNote` (`SidecarFeed.tsx`) now states it in the feed. Each design note is load-bearing:

- **A strip, not a toast.** The state persists and clears itself when a background retry reconnects, so an interruption would be both missed by anyone not looking and wrong the instant it succeeded. Rendering is derived from `agentSourceSignal`, which is what makes it self-clearing.
- **System voice** (the `TruncationNote` grey rule), not the accent-tinted `KeylessBanner`: the client retries unattended, so there is no action to offer and an accent CTA would promise one. Amber stays reserved for document problems; this is a tool state.
- **The copy adapts to whether anything else is reading.** Keyed: "its observations stay in your feed; writtten's own checks keep running." Keyless: "nothing is reading your document" — the sharper and truer statement, and the only one under engine exclusivity.
- **`disconnected` only, never `revoked`.** Telling someone their agent is gone immediately after they disconnected it is noise, not honesty.

This is silence about the **tool's own broken state**, which is a different thing from the product's deliberate quiet. writtten is quiet about observations; that is the philosophy. It must not be quiet about not working — the same reasoning that put the standing keyless banner on screen. The app cannot distinguish "user shut the session down" from "bridge crashed", and doesn't need to: the honest message is identical either way.

### Browsers that cannot reach a bridge at all

The bridge is plain HTTP on loopback, which WebKit on Apple platforms refuses from an HTTPS page as mixed content — with no permission prompt to grant it (Chrome and Firefox both prompt for local-network access; Safari has nothing to prompt with). `agentBrowserSupport.ts` detects this **before the first probe**, and the connect panel states it — instead of starting an infinite port poll and parking the user on "Waiting for your agent…" forever against a limit already knowable at render time.

The predicate is `navigator.vendor === "Apple Computer, Inc."` **and** an `https:` origin. Vendor rather than a UA substring: it catches iOS Chrome and iOS Firefox, which are WebKit underneath and equally blocked, and does not false-positive on desktop Chrome (whose UA carries a `Safari` token for historical reasons). Scoped to HTTPS because from an `http://localhost` origin the request is same-scheme and unblocked — refusing there would deny the self-hoster a path that works.

## Lifecycle — what may close an external card

**The rule: an observation carrying `source` is not the evaluator's to close.** Our model has no standing to decide another critic's finding is resolved, and no precision floor covering that judgement.

Enforced by `isEvaluatorOwned(obs)` (`evaluatorReconcile.ts`), applied at **every** system-driven closure arm:

| Site | Arm |
| --- | --- |
| `evaluatorReconcile.ts` ~`:224` | `resolved_prior` force-close |
| `evaluatorReconcile.ts` ~`:299` | supersedable pick (external is never *chosen*) |
| `evaluatorReconcile.ts` ~`:332` | the blanket orphan close |
| `evaluatorReconcile.ts` ~`:407` | doc-scope `resolved_prior` |
| `evaluatorReconcile.ts` ~`:460` | doc-scope orphan grace — skips the `missCount` bump too |
| `evaluatorReconcile.ts` ~`:539` | tension superseded by a contradiction |
| `evaluatorReconcile.ts` ~`:566` | strong-sweep absence grace (the `else` arm only) |
| `evaluatorReconcile.ts` ~`:793` | `reconcileConflictCardsOnEdit` — one guard covers its three closes |
| `evaluator.ts` ~`:161` | snapshot-restore stray close |

### Two deliberate choices in that table

**The guards sit at the close sites, never as a filter when `existing` is loaded.** External cards must still take part in matching and dedup: an incoming native observation landing on an external card's span should be *absorbed* by it, not rendered a second time. Filtering at load would exempt them and double the feed in one move. `evaluatorReconcile.external.test.ts` pins this distinction directly.

**`evaluator.ts:161` is not in the spec's list.** A snapshot records what *our* evaluator held at the time, so an agent's card is always "missing" from it — unguarded, a plain undo silently closed every external card in the section. Found during the build; the guard is verified by removing it and watching the test fail.

### What is *not* exempt

- **`text_removed`** (`orchestrator.ts` `handleBlockRemoved`). The anchored block was deleted, so the card is dead whoever wrote it. This is not an evaluator judgement, and exempting it would leave permanently unanchored zombies. Owner-confirmed 2026-07-19.
- **User dismissal and collapse** (`App.tsx`). The user may close anything.

## Dismissal is deliberately source-blind

Dismissing an external card writes the same `DismissalSuppression` as any other, keyed on type / kind / severity / span — **not** on source. So dismissing an agent's observation also suppresses a matching *native* re-emission.

That is intended. The user rejected **the observation**, not the source. It also keeps the boundary's `duplicate_suppressed` check symmetric with the evaluator's, and it preserves G1: the suppression list is never disclosed to the agent, which would invite it to self-censor whole categories.

## Retract and revoke

Both live in `externalObservationLifecycle.ts`. Neither writes a `DismissalSuppression` — an agent withdrawing its own card and a user clearing a source are different acts from a user rejecting a finding, and conflating them would mute observations the user never dismissed.

**Retract** — `retractExternalObservation(id, sessionId)`, driven by the bridge's `retract` event. Closes with reason `retracted`. Refuses, writing nothing, when the observation is missing, already closed, belongs to another session, or is native. That last case matters: an agent guessing an id must not be able to close writtten's own findings.

> **Shipped unwired until 2026-07-20.** `retractExternalObservation` had **zero production call sites**: `useAgentBridge` built the bridge without an `onRetract` dep, so `agentBridgeClient`'s `if (env.observationId && onRetract)` dropped every frame — while the bridge had already answered the agent `{ok:true}`. An agent that withdrew a card left it on screen and was told otherwise. Wired now, and the handler returns a **boolean**: the bridge acks unconditionally, so "applied" and "refused" are indistinguishable from the agent's side and only the debug log can tell them apart. A missing handler is logged as `applied: false` rather than swallowed, so the same class of gap surfaces next time instead of going quiet.

**Revoke + bulk archive** — `archiveExternalSource(docId, sessionId)`, closure reason `source_revoked`, scoped by `sessionId` rather than display name so revoking one run never sweeps up cards kept from an earlier one.

The UI folds revoke into the existing teardown rather than adding a competing control: PR2's Disconnect/Forget already clears the pairing and invalidates the token, so the only thing missing was the offer. Clicking it when the source has active cards opens a confirm naming the count, with an **unchecked** "Archive its N observations too" — the observations belong to the user, not to the connection. With no cards to strand there is no dialog at all. Kept cards flip their chip to `revoked`.

Both paths call `notifyObservationsChanged()`: no eval pass ran, so nothing else would tell the feed to reload.

## Signals

| Module | Carries | Written by |
| --- | --- | --- |
| `model/agentSourceSignal.ts` | pairing state + `name` + `sessionId` + `pass` for the chip and the dropped-agent note | `useAgentBridge` only |
| `model/observationsSignal.ts` | "the store changed, reload" (PR2) | boundary accepts, retract, bulk archive |

## The debug export

A BYOA session used to be invisible in the one artifact a user sends when something goes wrong. A real dogfood session with **7 accepted observations and 4+ retractions** exported `{ triggers: 88, calls: 0, archives: 0 }` — 88 triggers from the *idle* built-in engine, and not one event from the engine that did the work. `debugLog.ts` contained zero occurrences of agent/submission/external; its record kinds were all built-in-pipeline concepts.

`LLMLogEntry.type = "agent"` (+ `AgentEventInfo`) closes it, projected as an `agent` record with a `counts.agentEvents` tally (envelope `schemaVersion` 3). Five events: `pairing` state changes · `snapshot` pushes with `docVersion` · `pull` · `submission` with type/scope and the boundary's verdict or rejection code · `retract` with whether it applied.

Two deliberate properties:

- **Not DEV-gated,** unlike `archiveObs`. For a BYOA session these events are the *only* evidence that exists, because BYOA makes no model calls and the call log is empty by construction.
- **No observation text and no document content** — types, codes, versions, and counts only. That is what makes shipping them to production safe, and it is the same reason `archiveObs` (which carries the author's prose) stays dev-only.

> **Caveat — `archive` records are DEV-only, so a production export always reads `archives: 0`.** `archiveObs` (`evaluatorReconcile.ts:67`) returns early outside DEV, by design: an archive record carries the observation's **text**, and the debug drawer ships to production, so surfacing it would put the author's prose into a file users are invited to send us. The consequence is easy to misread — the milestone that motivated this section reasoned *"`archives: 0` is wrong on its own terms, a retraction closes a card,"* which is true in dev and **not** something a real user's export will ever show. Read a production `archives: 0` as "not captured", never as "nothing was closed". The `agent` records above are the prod-visible evidence: a `retract` with `applied: true` proves the closure without carrying any document content, which is exactly why that family is not DEV-gated.

`agent` is deliberately **not** in the logger's `LIFECYCLE_TYPES` retention bucket: those get evicted first, and bridge events are both low-frequency and the whole evidentiary record.

`agentSourceSignal` is a module-level observable, not React context, because the chip renders outside `ControlCenter`'s tree. It is production code, not a debug affordance — the dev-only `window.__sidecar__` harness must never become its carrier.

## Dev affordances

`window.__sidecar__.seedObservation({ type, text, blockId?, name?, sessionId? })` writes an agent-attributed card directly, and `setAgentStatus(state, name?, sessionId?)` drives the pairing signal — both DEV-only, both bypassing the boundary, so attribution and lifecycle can be exercised with no live bridge. The real path is `submitExternalObservation`, which validates.

## Dropped from the spec: the "Agent only" source toggle

Spec decisions 2/8 called for a Settings toggle pausing built-in checks while an agent is connected, to save free-tier RPD. **Dropped at build time, 2026-07-19 (owner).**

The rationale did not survive contact: a keyless user has no built-in checks to pause, a paid user saves pennies, so the only beneficiary is someone on a free-tier BYOK key who *also* connects an agent — a group BYOA exists to shrink. The trust-relevant half of decision 2 is unaffected and still holds: connecting an agent never pauses the built-in evaluator, because nothing can pause it. Both sources always run.

Consequences: no `agentOnlyMode` store, no orchestrator gate, and no "paused" state to represent in the process readout. If RPD pressure shows up in dogfooding it is a small add-back.

## When a connected agent gets woken (the materiality floor)

> Added 2026-07-20. Change `stableContentHash` / `agentPushFingerprint` and update this section in the same task.

Two different questions, deliberately decoupled in `pushSnapshot` (`src/services/agentBridgeClient.ts`):

| Question | Answer |
| --- | --- |
| Should we push? | **Every settle**, always — so `GET /doc` is a complete, current snapshot. |
| Should `docVersion` bump? | Only on a **material** change — this is what resolves the agent's `/wait` and costs it a re-review. |

`docVersion` does **not** bump in two cases:

- **Only the observations changed.** Bumping would wake `/wait` → re-review → possibly re-submit → wake itself, forever. Every accepted external card changes `activeObservations`, so this is the common case, not a corner.
- **The edit was not material.** The words are unchanged; only their partition moved.

The second gate was a byte-exact hash over `[title, stage, sections]` until 2026-07-20. It answered *did the bytes change* when the question is *could the conclusions change*: splitting a heading into its own section changes `sections[]`, so the agent woke, re-read the document, and reported back "No new content — just the heading was split into its own section" — a measured **~4.1k tokens** out of the user's own agent budget, and watch mode repeats the cycle.

The gate is now `agentPushFingerprint` (`src/services/docPassMateriality.ts`), which flattens heading and body text together and collapses whitespace, so **section boundaries contribute no distinguishing token**. Consequences:

- A pure re-partition — heading split out, or demoted back to body text — is invisible. No wake.
- New prose, a reword, a renamed heading, and a deletion all bump.
- A **section reorder** bumps: reordering permutes the token stream, and flow is a real conclusion.

It is not the doc pass's five-clause `isMaterialDelta`, though it lives beside it and shares its normalizer. That floor's clause 2 (*section count or ordered headings differ*) calls a heading split material — correct for a `structure_flow` conclusion, wrong here — and three of its five clauses read summaries, claims, and maturity, none of which exist at the bridge, whose snapshot is `{heading, text}` and id-free by the boundary invariant. The full reasoning is in `docs/projects/agent_connected_eval.md` § _Bridge protocol → Materiality floor_.

## What changed, not just that something did (the delta hint)

> Added 2026-07-20 alongside the floor. Same rule: change the hint, update this section.

Waking the agent is only half the cost — it then re-read the *whole* document, while our own eval is per-section incremental. The snapshot now carries an optional hint, both fields present or neither:

| Field | Meaning |
| --- | --- |
| `changedSections` | Indices into **this snapshot's** `sections[]` whose words changed |
| `changedSectionsSince` | The `docVersion` the hint is measured against |

`changedSectionsSince` is the safety catch. The bridge holds only the latest snapshot, so the hint is always relative to the immediately-previous material version; an agent that missed intermediate versions would under-read if it trusted it. The skill instructs: act on the hint only when `changedSectionsSince` equals the version you last reviewed — otherwise re-read everything.

**The hint is omitted whenever the section count changed** (split, merge, insert, delete): every later index shifts, so an index-wise diff would name sections whose words never moved, and an over-reporting hint costs the agent context. Absence reads correctly as "re-read everything". It is also absent on the first push (no baseline). Same-length reorders are reported index-wise.

It is carried unchanged across non-material re-pushes, since those re-send the same `docVersion` and the hint describes that version.

Per-section fingerprints come from `sectionProseFingerprints`, the same normalization `agentPushFingerprint` applies document-wide — so the wake gate and the hint can never disagree about whether a section's words changed.

**No protocol bump was needed.** The bridge script stores the pushed body wholesale (`snapshot = body`) and `/doc` returns it, so the fields reach the agent through an unmodified bridge; an older pasted skill simply never reads them.
