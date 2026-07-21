# Agent-source attribution and lifecycle

> **Keep this current.** If you change the engine-selection rules, the evaluator exemption rule, the teardown/archive flow, or where `agentSourceSignal` is written, update this file in the same task. Design contract: `docs/projects/agent_connected_eval.md` § _Engine exclusivity_ and § _Trust & attribution_. The bridge transport itself (pairing, SSE, the boundary) is PR1/PR2 territory and documented in that spec.

What happens to an observation **after** an external agent's submission clears the boundary: which engine was allowed to produce it, and what may and may not close it.

The whole mechanic exists to pay for one accepted cost. writtten's own observations sit behind precision floors and fixture ratchets; a connected agent's cannot. Gate 1 accepted that in exchange for two containments. The first has since **moved**: it used to be a per-card chip saying which critic was speaking, and is now the **moment of choosing** — exactly one engine holds the slot, so there is no concurrent critic to disambiguate (§ _The engine slot_). The second is unchanged and now matters more: the evaluator never quietly disposes of **another critic's cards**.

## The engine slot

`src/services/evalEngine.ts` holds `EngineId = "builtin" | "agent"`, persisted in `localStorage["writtten_engine"]`. A key and a connected agent are two ways to get model access, so they occupy one slot rather than stacking; running both would bill the user twice for overlapping observations competing over one feed budget (owner, 2026-07-20).

It lives in `services/`, not `model/`, because selection sits **above** `ModelRouter` — an agent builds no `LLMRequest` and reads no key, so it is not a `ProviderAdapter`. The module imports only `featureFlags`, which is what keeps it cheap for `orchestrator.ts` to read.

**Gating is two-layer, and both layers are needed.** `scheduleEval` stops work being _armed_ (so no coalesce timer forms, `recomputePending()` stays 0, and the activity dot rests rather than pulsing for work that will never run). Guards in `dispatch`, `handleDocIdle`, and `handleBootstrapSweep` stop already-armed work from _firing_ — a switch during a coalesce window or a 30 s RPM deferral would otherwise leak exactly the call the user opted out of. In-flight work is never cancelled.

**`block-removed` is deliberately not gated.** It makes no model call, and a card anchored to a deleted block is dead whoever wrote it — the one auto-close that is not an evaluator judgement (`isEvaluatorOwned`). Gating it would strand every agent-era card on a deleted block.

| Event                                                                             | Slot goes to                            | Where                          |
| --------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------ |
| picking "Your agent" in Settings, or the `connect-agent` deep-link                | `agent`                                 | `ControlCenter`                |
| picking a key provider                                                            | `builtin`, **tearing the pairing down** | `ControlCenter.selectEngine`   |
| `cancel()` / `revoke()`                                                           | `builtin`, via `releaseAgentEngine()`   | `useAgentBridge`               |
| boot with `agent` selected but no pairing, or a browser that can't reach loopback | `builtin`, via `releaseAgentEngine()`   | `useAgentBridge` resume effect |
| the BYOA flag is off                                                              | `builtin`, whatever storage says        | `evalEngine` hydrate           |

Two asymmetries are load-bearing. Moving **to** `agent` is always a deliberate gesture — connecting does not auto-select, and a `disconnected` (but not revoked) bridge stays selected, because silently falling back to a key would start burning RPD over a hiccuped terminal. Moving **to** `builtin` is always the agent _losing_ the ability to serve, which is why those sites call `releaseAgentEngine()` rather than `setEngine("builtin")`.

Deselecting a live pairing tears it down rather than leaving it connected-but-ignored: a bridge that keeps pushing and submitting into a writtten that ignores it is the parallel-source world through the back door, and it parks the user's agent in a wait loop forever. When it has active cards the switch asks first (`engine-switch-confirm`, archive unchecked — the cards belong to the user); with none it is silent, matching Disconnect's own rule.

---

## The field

`Observation.source` (`src/store/db.ts`) — `{ kind: "agent", name, sessionId }`, added by PR1.

- **Absent** means the built-in evaluator produced it.
- **Present** means an external session submitted it through `submitExternalObservation`.
- `sessionId` is bridge-generated per run and is what attribution, retract, and revoke all scope on. `name` is a display label, sanitized at the boundary — never a permission tier.

Optional and additive, so **no IDB version bump**: legacy rows simply lack it, which reads correctly as "the evaluator wrote this".

## No per-card attribution (the chip is gone)

There was a `SourceChip` on every external card until 2026-07-20. It existed **only because both engines ran**: with a concurrent critic in the feed, the user had to be able to tell which one was speaking, and to learn to discount a bad _source_ rather than the whole feed.

Engine exclusivity removed the premise. One engine holds the slot, so there is nothing to disambiguate, and the containment relocates to the moment of choosing — which is explicit rather than silent, and where Settings names what each path costs and where the document goes. The chip, `sourceChipView`, and their CSS were deleted outright rather than made conditional.

**Accepted consequence, recorded so it is not rediscovered as a bug:** a feed spanning an engine switch shows agent-era and key-era cards **identically**. That is judged acceptable because the user performed the switch and knew the selected engine at production time — it is their own history, not a concurrent source masquerading as the ratcheted pipeline.

`Observation.source` **stays in the model**. Removing the chip was a view change; the field is what the reconciler exemptions, revoke, and bulk archive all key on, and the archive still names the source on closure. It gets _more_ load-bearing after an agent→key switch, not less (see below).

## Grouping keys on the span, not the source

`obsAggregation.ts`'s key is `blockId:startOffset:endOffset`. It briefly included `source.sessionId`, back when a grouped card could hide an external observation's chip inside "N more on this passage" — the laundering the chip existed to prevent.

With the chip gone that argument goes too, and keeping the split would actively contradict the ruling above: two cards on one passage, for a reason the reader can no longer see, read as an unexplained duplicate. Cross-source coexistence is now _historical_ only. Grouping is presentational — near-duplicate absorption happens upstream, at the boundary and in `evaluatorReconcile`.

## Reaching it at all: the preview gate

Shipped ON but **runtime-gated** (`agentBridgeEnabled()`, `src/services/featureFlags.ts`). A session sees BYOA only after opting in with **`?agent=1`**, which is remembered in `localStorage["writtten_agent_preview"]` so it survives reloads and in-app navigation — without persistence the query string would have to be re-appended for every step of the flow, and the first-run modal would lose it the moment anything navigated.

```
https://writtten.com/?agent=1     → opts this browser in, permanently
https://writtten.com/             → still on, from the stored key
```

The gate is temporary and exists for one reason: Chrome's Local Network Access prompt only fires from a **public** origin, so it is untestable anywhere but production. PR4 ships to writtten.com to answer that, and is a _verification release_, not a launch. `public/agent/index.html` carries `noindex` for the same window.

**Removing the gate is the launch action** — replace the body of `agentBridgeEnabled()` with `true` and restore `index,follow` on the page. Do it after the Phase-8 follow-ups (prompt slimming, engine exclusivity, observability), not before.

## How a user reaches the connect section

Three entry points, all landing in the same section of the Settings modal. All three are gated on `agentBridgeEnabled()` — see the preview gate above.

| Entry point                                   | Carries                                                                                      |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `WelcomeModal` (first run only)               | `Connect your agent`, an **equal** peer of `Add your key` — same accent fill, joined by "or" |
| `KeylessBanner` (standing, any keyless state) | the same pair as two accent text links, both arrowed                                         |
| Settings itself                               | the section, always present                                                                  |

The two on-ramps are styled identically **on purpose**. Spec decision 3 calls them two equal paths, and giving either one an outline ranks them — the version that shipped first did exactly that and was corrected at review. `See it in action` sits below a short centred rule instead of third in the row: it is a different kind of choice (watch, don't set up), and peer placement flattened that.

**The deep-link starts the pairing.** `openSettings("connect-agent")` (`sidecar/settingsGate.ts` → `SettingsIntent`) opens Settings, scrolls the section into view, and calls `connect()` — but **only from `idle`**. Two reasons this is not merely a scroll:

- The modal button and the section button carry the same label. Landing on a collapsed section showing the words you just pressed reads as a failed click.
- Starting is cheap and reversible — `createPairing` only writes `localStorage`, and Cancel sits directly beneath.

The `idle` guard is load-bearing: re-starting a live pairing mints a new token and invalidates the one the user's agent is already holding.

## The process readout — one verb, one noun

**Two rows, not three.** There used to be a dedicated `agent` row _beneath_ the model name, which is how the readout showed `gemini-2.0-flash` above a connected agent with no key at all — field-confirmed 2026-07-20 and left unpatched precisely because fixing it means picking a selected engine, which is what engine exclusivity does.

- **Row 1 is the noun — the engine identity.** Which thing is reading, named once: the model name plus tier chip under the built-in engine, or the agent's name and dot (via `agentStatusView`) under the agent. Selected-but-not-yet-connected reads `not connected`, resolved in `ControlCenter` rather than by teaching `agentStatusView` about engine selection. The agent variant reuses `.connect-dot`'s visual vocabulary, so the same state reads the same way in Settings and in the readout.
- **Row 2 is the verb — `status`.** What is happening right now, for the selected engine. Said once. The dot mirrors it by one rule.

`processStatusView` takes `engine` as a **required** input, and only consults `agentPhrase` when the agent holds the slot. That is not tidiness: `agentSource.pass` outlives a revoke, so an unselected agent would otherwise keep painting "reading · 0:05" with nothing reading. `pending` and `stalled` stay unconditional — under the agent engine a non-zero `pending` is a call armed before the switch and deliberately not cancelled, and printing `idle` over it would lie while writtten is demonstrably computing.

The anchor's `aria-label` names the selected engine too — otherwise a screen reader announces a Gemini model while an agent does the reading, the same defect one channel over.

An earlier draft had `status` read "agent reading" while the agent row's sub-line read "reading · 0:20": the same fact twice in adjacent lines. The sub-line is gone; `agentStatusPhrase` feeds the status row directly.

The status vocabulary, and what the dot does with each:

| `status`          | Means                                         | Dot              |
| ----------------- | --------------------------------------------- | ---------------- |
| `idle`            | Nothing attached, or attached and gone quiet. | rest             |
| `awaiting pickup` | Snapshot sent; the agent has not read it.     | rest             |
| `watching`        | Agent parked in `GET /wait`.                  | rest             |
| `reading · 0:20`  | Agent pulled `/doc` and is reviewing.         | pulse            |
| `reading · 2:14 · 2 landed` | …with cards accepted this stretch.  | pulse            |
| `evaluating · 2`  | writtten is computing.                        | pulse + tier hue |
| `still working…`  | Our stall detector fired.                     | stalled          |

**`watching` vs `idle` is the distinction this vocabulary exists for.** Neither is computing, so neither pulses — but one means a critic is attached and will react the moment you type, and the other means nothing is going to happen. Collapsing them is what let a stalled watch-loop look exactly like a finished pass; a real session spent six minutes in a poll loop and the readout was indistinguishable from an agent that had wandered off.

**The dot is shared.** It answers one question — _is something reading my document right now?_ — which an agent pass makes true exactly as a model call does, so it gets one vocabulary. A first draft gave the agent its own concentric ring to avoid "reusing the computation semantics"; that over-applied the rule. The constraint worth keeping is _don't imply progress you can't measure_; it does not follow that "busy" needs a second colour, and splitting the channel encoded a distinction the author has no reason to care about at the moment they most want a yes/no.

Three things stay writtten's alone, each for a mechanical reason rather than for symmetry:

|                                              | Why                                                                                                                                                                        |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tier hue** (`fast` blue / `strong` violet) | Names _which model we called_. An agent pass has no tier, so `dotTier` keys on our own `pending`, never on the shared `working` state.                                     |
| **`stalled` red**                            | Our stall detector watches our own outstanding calls. It has nothing to watch on an agent, and an agent that simply stopped is absent, not faulty.                         |
| **How it resolves**                          | Ours resolves because `pending` returns to 0; the agent's has to resolve itself, because no message ever says it finished. Different mechanism, identical visible outcome. |

`processStatusView.ts` holds the whole matrix and is the only place it lives.

### Reporting the agent's pass

Connection state is **liveness, not activity** — a chip reading `connected` says nothing about whether the agent is doing anything. And the `status` row cannot answer it either: `setActivityPending` has exactly one writer (`orchestrator.ts`) publishing _writtten's own_ outstanding eval work, and BYOA makes zero model calls, so it reads `idle` for the entire time an agent is reviewing.

`agentPassPhase` derives one of five phases from the raw facts on `BridgeStatus.pass` — `lastPushAt` · `lastPullAt` · `lastSubmissionAt` · `lastWaitAt` · `readingSince` · `accepted` · `partedAt`. Whichever signal is most recent wins, which orders the watch cycle (park → wake → pull → submit → park) with no state machine. `quiet` yields the status row entirely rather than coining a second word for the same non-event; the hollow dot on the `agent` row already says "attached, not active".

**Two signals feed it that the bridge previously kept to itself.** `GET /doc` is the agent picking the document up — the missing "started" signal — and `GET /wait` is the agent parking in watch mode. Both are now one `broadcast()` in their handler and one named `addEventListener` client-side.

**Submissions re-arm decay on any verdict; only acceptances are displayed.** A rejected burst is still the agent working, so the timestamp moves regardless — but the visible count is `accepted`, not attempts. An earlier `N submitted` was dropped for the right reason (a register-lint burst could read "5 submitted" above a feed that gained nothing) and then nothing replaced it, leaving the agent's output entirely unreported (UX-036). `N landed` counts what actually reached the feed, so the number can never claim more than the author can see.

**The elapsed counter is anchored to the reading _stretch_, not the last pull** (UX-035). `now - lastPullAt` re-zeroed on every `GET /doc`, so an agent polling in a loop read `reading · 0:00` through a pass that was minutes old and appeared to "start" only when it stopped pulling. The label named a pass while the number measured an event, and it reported the smaller — understating the wait, the one direction this readout must not err in. `readingSince` holds while `agentPassPhase` still says `reading`, so consecutive pulls extend a stretch; parking, departing, or decaying ends it and the next pull starts a fresh one with a fresh `accepted` count. `agentPassPhase` is the arbiter rather than a hand-rolled comparison, so "is it still reading" has exactly one definition.

**A departure is observed where one is observable** (UX-034). The bridge's `/wait` handler already registered `res.on("close")` to clean up a parked waiter — so it knew the instant a watching agent's connection dropped, and said nothing, while the app went on reporting `watching` for the full idle window. It now broadcasts `parted`, distinguished from its own timeout reply by an `answered` flag on the waiter (that reply closes the response too, and reporting it would flicker a healthy watch loop to `quiet` every `WAIT_TIMEOUT_MS`). `partedAt` is compared against the newest other signal rather than latching, so an agent that reconnects and pulls is `reading` again. **Known limit:** this catches the agent going _away_, not the agent deciding to _stop_ — one whose process is alive but which never calls `/wait` again leaves no connection to close, and only decay covers that.

**Three constraints shape this, and each rules out an obvious alternative.**

**1. "Started" is observable; "finished" is not.** `GET /doc` is the agent picking the document up, and the bridge now `broadcast("pulled", …)`es from its `/doc` handler. There is no counterpart: the agent simply stops, and the skill tells it to report to the _user_, not to writtten. Adding a required agent-side "done" call was rejected — it grows the prompt, and a protocol that leans on a well-behaved peer to clear UI state will strand that state the first time the peer crashes.

**2. Therefore the working state must decay — and decay is _derived_, never scheduled.** `agentPassPhase(pass, now)` is a pure function of timestamps, so there is no timer to leak, no state to get stuck, and a render at any moment yields the correct phase. An unresolvable spinner is worse than no spinner; this one cannot exist. A submission re-arms the window, because an agent still submitting is still working.

**3. The vocabulary is deliberately disjoint from the `status` row.** For the API engine "in progress" means _writtten is computing_; for the agent engine writtten is _waiting on a peer_. Those are different kinds of state and must not share words — so this line never says `idle`, `working`, or `thinking` (pinned by a test), and reports facts rather than progress writtten cannot measure. The ticking elapsed counter is the liveness cue precisely because elapsed time is something we actually know; the dot is deliberately **unanimated**, and goes hollow on `quiet`.

The pass resets on a content-bearing snapshot push (a new version supersedes what the agent was reading) — done _before_ the POST is awaited, so a pull or submission arriving mid-flight isn't wiped — and on a `hello` carrying a **different `sessionId`**, since a restarted bridge is a new run and must not be credited with its predecessor's output.

`pulled` is additive: the app registers _named_ SSE listeners, so an older app ignores the event and an older bridge simply never sends it. **No `protocolVersion` bump.**

### When the agent goes away

`dropToDisconnected` fires after `DISCONNECT_GRACE_MS`, and until 2026-07-20 the only readout was the `agent-chip` — inside the hover/tap-gated control center, i.e. "always-on" only once you open it. The author kept writing, believing a critic was reading, and found out by opening Settings.

`AgentDroppedNote` (`SidecarFeed.tsx`) now states it in the feed. Each design note is load-bearing:

- **A strip, not a toast.** The state persists and clears itself when a background retry reconnects, so an interruption would be both missed by anyone not looking and wrong the instant it succeeded. Rendering is derived from `agentSourceSignal`, which is what makes it self-clearing.
- **System voice** (the `TruncationNote` grey rule), not the accent-tinted `KeylessBanner`: the client retries unattended, so there is no action to offer and an accent CTA would promise one. Amber stays reserved for document problems; this is a tool state.
- **One sentence, because there is only one truth left.** The copy used to branch on whether a key existed ("writtten's own checks keep running"). Under engine exclusivity this strip only renders while the agent _holds the slot_, so a dropped bridge always means nothing is reading — key or no key. The branch was removed, not re-worded. Deliberately **no** "switch to your key" link: an engine switch costs RPD and must not sit one stray click away inside a transient error strip.
- **`disconnected` only, never `revoked`, and only while the agent is the selected engine.** Telling someone their agent is gone immediately after they disconnected it is noise; so is flagging a stale pairing from before they switched back to a key.

This is silence about the **tool's own broken state**, which is a different thing from the product's deliberate quiet. writtten is quiet about observations; that is the philosophy. It must not be quiet about not working — the same reasoning that put the standing keyless banner on screen. The app cannot distinguish "user shut the session down" from "bridge crashed", and doesn't need to: the honest message is identical either way.

### Browsers that cannot reach a bridge at all

The bridge is plain HTTP on loopback, which WebKit on Apple platforms refuses from an HTTPS page as mixed content — with no permission prompt to grant it (Chrome and Firefox both prompt for local-network access; Safari has nothing to prompt with). `agentBrowserSupport.ts` detects this **before the first probe**, and the connect panel states it — instead of starting an infinite port poll and parking the user on "Waiting for your agent…" forever against a limit already knowable at render time.

The predicate is `navigator.vendor === "Apple Computer, Inc."` **and** an `https:` origin. Vendor rather than a UA substring: it catches iOS Chrome and iOS Firefox, which are WebKit underneath and equally blocked, and does not false-positive on desktop Chrome (whose UA carries a `Safari` token for historical reasons). Scoped to HTTPS because from an `http://localhost` origin the request is same-scheme and unblocked — refusing there would deny the self-hoster a path that works.

## Lifecycle — what may close an external card

**The rule: an observation carrying `source` is not the evaluator's to close.** Our model has no standing to decide another critic's finding is resolved, and no precision floor covering that judgement.

Enforced by `isEvaluatorOwned(obs)` (`evaluatorReconcile.ts`), applied at **every** system-driven closure arm:

| Site                            | Arm                                                                |
| ------------------------------- | ------------------------------------------------------------------ |
| `evaluatorReconcile.ts` ~`:224` | `resolved_prior` force-close                                       |
| `evaluatorReconcile.ts` ~`:299` | supersedable pick (external is never _chosen_)                     |
| `evaluatorReconcile.ts` ~`:332` | the blanket orphan close                                           |
| `evaluatorReconcile.ts` ~`:407` | doc-scope `resolved_prior`                                         |
| `evaluatorReconcile.ts` ~`:460` | doc-scope orphan grace — skips the `missCount` bump too            |
| `evaluatorReconcile.ts` ~`:539` | tension superseded by a contradiction                              |
| `evaluatorReconcile.ts` ~`:566` | strong-sweep absence grace (the `else` arm only)                   |
| `evaluatorReconcile.ts` ~`:793` | `reconcileConflictCardsOnEdit` — one guard covers its three closes |
| `evaluator.ts` ~`:161`          | snapshot-restore stray close                                       |

### Two deliberate choices in that table

**The guards sit at the close sites, never as a filter when `existing` is loaded.** External cards must still take part in matching and dedup: an incoming native observation landing on an external card's span should be _absorbed_ by it, not rendered a second time. Filtering at load would exempt them and double the feed in one move. `evaluatorReconcile.external.test.ts` pins this distinction directly.

**`evaluator.ts:161` is not in the spec's list.** A snapshot records what _our_ evaluator held at the time, so an agent's card is always "missing" from it — unguarded, a plain undo silently closed every external card in the section. Found during the build; the guard is verified by removing it and watching the test fail.

### What is _not_ exempt

- **`text_removed`** (`orchestrator.ts` `handleBlockRemoved`). The anchored block was deleted, so the card is dead whoever wrote it. This is not an evaluator judgement, and exempting it would leave permanently unanchored zombies. Owner-confirmed 2026-07-19.
- **User dismissal and collapse** (`App.tsx`). The user may close anything.

## Dismissal is deliberately source-blind

Dismissing an external card writes the same `DismissalSuppression` as any other, keyed on type / kind / severity / span — **not** on source. So dismissing an agent's observation also suppresses a matching _native_ re-emission.

That is intended. The user rejected **the observation**, not the source. It also keeps the boundary's `duplicate_suppressed` check symmetric with the evaluator's, and it preserves G1: the suppression list is never disclosed to the agent, which would invite it to self-censor whole categories.

**This stays true for `user_lens`** (added 2026-07-21). Lens suppression keys on type and span, never on source — what changed is only its *breadth*, below.

### Suppression breadth: category-wide by default, span-only for four types

`isSpanSuppressed` (`evaluatorAnchoring.ts`) has two modes. By default a dismissal is **category-wide** for the document: dismiss one `clarity` card and no further `clarity` cards arrive. Four types are **span-only** instead — the dismissal suppresses that passage and nothing else:

- `contradiction`, `unsupported_claim`, and anything at `severity: "high"` — because of **G1 (flattery-resistant dismissal)**: a high-severity defect must not be silenceable as a whole category.
- **`user_lens` — for a different reason, and the distinction is easy to misread.** G1 deliberately does *not* govern solicited searches: muting a lens is retracting your own request, which is not the sycophancy G1 exists to prevent. Lens cards are span-only because suppression keys on **type**, and every lens shares the one `user_lens` type — so the category-wide branch would silence *every* lens at once rather than the one the user tired of. The mechanism coincides with G1's; the reasoning does not. Do not "simplify" the two into one rule.

Verified end to end 2026-07-21: dismissing one lens hit leaves other lenses standing, still admits the same lens at a different span, and still rejects a resubmission of the dismissed hit as `duplicate_suppressed`. See `docs/projects/user_directed_review.md` § R2.

## Retract and revoke

Both live in `externalObservationLifecycle.ts`. Neither writes a `DismissalSuppression` — an agent withdrawing its own card and a user clearing a source are different acts from a user rejecting a finding, and conflating them would mute observations the user never dismissed.

**Retract** — `retractExternalObservation(id, sessionId)`, driven by the bridge's `retract` event. Closes with reason `retracted`. Refuses, writing nothing, when the observation is missing, already closed, belongs to another session, or is native. That last case matters: an agent guessing an id must not be able to close writtten's own findings.

> **Shipped unwired until 2026-07-20.** `retractExternalObservation` had **zero production call sites**: `useAgentBridge` built the bridge without an `onRetract` dep, so `agentBridgeClient`'s `if (env.observationId && onRetract)` dropped every frame — while the bridge had already answered the agent `{ok:true}`. An agent that withdrew a card left it on screen and was told otherwise. Wired now, and the handler returns a **boolean**: the bridge acks unconditionally, so "applied" and "refused" are indistinguishable from the agent's side and only the debug log can tell them apart. A missing handler is logged as `applied: false` rather than swallowed, so the same class of gap surfaces next time instead of going quiet.

**Revoke + bulk archive** — `archiveExternalSource(docId, sessionId)`, closure reason `source_revoked`, scoped by `sessionId` rather than display name so revoking one run never sweeps up cards kept from an earlier one.

The UI folds revoke into the existing teardown rather than adding a competing control: PR2's Disconnect/Forget already clears the pairing and invalidates the token, so the only thing missing was the offer. Clicking it when the source has active cards opens a confirm naming the count, with an **unchecked** "Archive its N observations too" — the observations belong to the user, not to the connection. With no cards to strand there is no dialog at all. Kept cards flip their chip to `revoked`.

Both paths call `notifyObservationsChanged()`: no eval pass ran, so nothing else would tell the feed to reload.

## Signals

| Module                        | Carries                                                                               | Written by                              |
| ----------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------- |
| `model/agentSourceSignal.ts`  | pairing state + `name` + `sessionId` + `pass` for the chip and the dropped-agent note | `useAgentBridge` only                   |
| `model/observationsSignal.ts` | "the store changed, reload" (PR2)                                                     | boundary accepts, retract, bulk archive |

## The debug export

A BYOA session used to be invisible in the one artifact a user sends when something goes wrong. A real dogfood session with **7 accepted observations and 4+ retractions** exported `{ triggers: 88, calls: 0, archives: 0 }` — 88 triggers from the _idle_ built-in engine, and not one event from the engine that did the work. `debugLog.ts` contained zero occurrences of agent/submission/external; its record kinds were all built-in-pipeline concepts.

`LLMLogEntry.type = "agent"` (+ `AgentEventInfo`) closes it, projected as an `agent` record with a `counts.agentEvents` tally (envelope `schemaVersion` 3). Five events: `pairing` state changes · `snapshot` pushes with `docVersion` · `pull` · `submission` with type/scope and the boundary's verdict or rejection code · `retract` with whether it applied.

Two deliberate properties:

- **Not DEV-gated,** unlike `archiveObs`. For a BYOA session these events are the _only_ evidence that exists, because BYOA makes no model calls and the call log is empty by construction.
- **No observation text and no document content** — types, codes, versions, and counts only. That is what makes shipping them to production safe, and it is the same reason `archiveObs` (which carries the author's prose) stays dev-only.

> **Caveat — `archive` records are DEV-only, so a production export always reads `archives: 0`.** `archiveObs` (`evaluatorReconcile.ts:67`) returns early outside DEV, by design: an archive record carries the observation's **text**, and the debug drawer ships to production, so surfacing it would put the author's prose into a file users are invited to send us. The consequence is easy to misread — the milestone that motivated this section reasoned _"`archives: 0` is wrong on its own terms, a retraction closes a card,"_ which is true in dev and **not** something a real user's export will ever show. Read a production `archives: 0` as "not captured", never as "nothing was closed". The `agent` records above are the prod-visible evidence: a `retract` with `applied: true` proves the closure without carrying any document content, which is exactly why that family is not DEV-gated.

`agent` is deliberately **not** in the logger's `LIFECYCLE_TYPES` retention bucket: those get evicted first, and bridge events are both low-frequency and the whole evidentiary record.

`agentSourceSignal` is a module-level observable, not React context, because the chip renders outside `ControlCenter`'s tree. It is production code, not a debug affordance — the dev-only `window.__sidecar__` harness must never become its carrier.

## Dev affordances

`window.__sidecar__.seedObservation({ type, text, blockId?, name?, sessionId? })` writes an agent-attributed card directly, and `setAgentStatus(state, name?, sessionId?)` drives the pairing signal — both DEV-only, both bypassing the boundary, so attribution and lifecycle can be exercised with no live bridge. The real path is `submitExternalObservation`, which validates.

## Dropped from the spec: the "Agent only" source toggle

Spec decisions 2/8 called for a Settings toggle pausing built-in checks while an agent is connected, to save free-tier RPD. **Dropped at build time, 2026-07-19 (owner).**

The rationale did not survive contact: a keyless user has no built-in checks to pause, a paid user saves pennies, so the only beneficiary is someone on a free-tier BYOK key who _also_ connects an agent — a group BYOA exists to shrink. The trust-relevant half of decision 2 is unaffected and still holds: connecting an agent never pauses the built-in evaluator, because nothing can pause it. Both sources always run.

Consequences: no `agentOnlyMode` store, no orchestrator gate, and no "paused" state to represent in the process readout. If RPD pressure shows up in dogfooding it is a small add-back.

## When a connected agent gets woken (the materiality floor)

> Added 2026-07-20. Change `stableContentHash` / `agentPushFingerprint` and update this section in the same task.

Two different questions, deliberately decoupled in `pushSnapshot` (`src/services/agentBridgeClient.ts`):

| Question                  | Answer                                                                                              |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| Should we push?           | **Every settle**, always — so `GET /doc` is a complete, current snapshot.                           |
| Should `docVersion` bump? | Only on a **material** change — this is what resolves the agent's `/wait` and costs it a re-review. |

**What "settle" means, and what it must never mean again.** The wake comes from `docSettleSignal` (`src/model/docSettleSignal.ts`), announced by the orchestrator when a burst of section-settle triggers drains — **above** the engine gate, so the built-in evaluator standing down cannot silence it.

> It used to come from the falling edge of the orchestrator's outstanding-work count (`activitySignal`, 5→4→…→0), on the reasoning that our eval queue draining implied the document had settled. Engine exclusivity broke that implication: with an agent holding the slot the built-in evaluator never arms, the count never leaves 0, and there is no falling edge — in exactly the mode the bridge exists for. The agent kept the empty snapshot it received at connect and was never sent another, for the whole session (UX-033).
>
> The two facts — _the document settled_ and _writtten has no outstanding work_ — coincided for one release and are now separate modules. `pending` is specifically **not** reused to carry the settle: `processStatusView` reads a non-zero count under the agent engine as a real in-flight call armed before the switch and prints `evaluating · N` for it, so arming a counter for work that will never run would make that readout lie. `orchestrator.engine.test.ts` pins both properties side by side, since satisfying either one by breaking the other is the failure mode.

`docVersion` does **not** bump in two cases:

- **Only the observations changed.** Bumping would wake `/wait` → re-review → possibly re-submit → wake itself, forever. Every accepted external card changes `activeObservations`, so this is the common case, not a corner.
- **The edit was not material.** The words are unchanged; only their partition moved.

The second gate was a byte-exact hash over `[title, stage, sections]` until 2026-07-20. It answered _did the bytes change_ when the question is _could the conclusions change_: splitting a heading into its own section changes `sections[]`, so the agent woke, re-read the document, and reported back "No new content — just the heading was split into its own section" — a measured **~4.1k tokens** out of the user's own agent budget, and watch mode repeats the cycle.

The gate is now `agentPushFingerprint` (`src/services/docPassMateriality.ts`), which flattens heading and body text together and collapses whitespace, so **section boundaries contribute no distinguishing token**. Consequences:

- A pure re-partition — heading split out, or demoted back to body text — is invisible. No wake.
- New prose, a reword, a renamed heading, and a deletion all bump.
- A **section reorder** bumps: reordering permutes the token stream, and flow is a real conclusion.

It is not the doc pass's five-clause `isMaterialDelta`, though it lives beside it and shares its normalizer. That floor's clause 2 (*section count or ordered headings differ*) calls a heading split material — correct for a `structure_flow` conclusion, wrong here — and its summary and claim clauses read state that does not exist at the bridge, whose snapshot is `{heading, text}` and id-free by the boundary invariant. The full reasoning is in `docs/projects/agent_connected_eval.md` § _Bridge protocol → Materiality floor_.

**One clause was added 2026-07-20 (UX-029): the `maturity` band.** `stableContentHash` is `agentPushFingerprint(body) + "|" + maturity`, so a band change bumps `docVersion` even when the prose fingerprints identically. This is not symmetry with the doc pass — it closes a hole the flattening itself opens. The fingerprint's purpose is to make re-partitioning invisible, but `blockCount` **is** a re-partition signal: splitting a paragraph at ~120 words moves the band `unformed → forming` without moving a fingerprint byte. Since a `unformed` band tells the agent to park until the draft is reviewable, an agent would sleep through precisely the event it was waiting for. The table case never self-heals — table text is excluded from `sections[]` entirely, so arbitrarily much of it can be typed with the fingerprint frozen.

It cannot reintroduce self-waking: maturity is derived from the document, never from the observations.

## What changed, not just that something did (the delta hint)

> Added 2026-07-20 alongside the floor. Same rule: change the hint, update this section.

Waking the agent is only half the cost — it then re-read the _whole_ document, while our own eval is per-section incremental. The snapshot now carries an optional hint, both fields present or neither:

| Field                  | Meaning                                                           |
| ---------------------- | ----------------------------------------------------------------- |
| `changedSections`      | Indices into **this snapshot's** `sections[]` whose words changed |
| `changedSectionsSince` | The `docVersion` the hint is measured against                     |

`changedSectionsSince` is the safety catch. The bridge holds only the latest snapshot, so the hint is always relative to the immediately-previous material version; an agent that missed intermediate versions would under-read if it trusted it. The skill instructs: act on the hint only when `changedSectionsSince` equals the version you last reviewed — otherwise re-read everything.

**The hint is omitted whenever the section count changed** (split, merge, insert, delete): every later index shifts, so an index-wise diff would name sections whose words never moved, and an over-reporting hint costs the agent context. Absence reads correctly as "re-read everything". It is also absent on the first push (no baseline). Same-length reorders are reported index-wise.

It is carried unchanged across non-material re-pushes, since those re-send the same `docVersion` and the hint describes that version.

Per-section fingerprints come from `sectionProseFingerprints`, the same normalization `agentPushFingerprint` applies document-wide — so the wake gate and the hint can never disagree about whether a section's words changed.

**No protocol bump was needed.** The bridge script stores the pushed body wholesale (`snapshot = body`) and `/doc` returns it, so the fields reach the agent through an unmodified bridge; an older pasted skill simply never reads them.

## Document-type calibration rides in the snapshot

> Added 2026-07-21 (OBS-039). Change `agentCalibrationBlock` or the paste's calibration pointer and update this section in the same task.

The snapshot carries `calibration: string` beside `stage` and `maturity` — `agentCalibrationBlock(classifyDocumentClass(stage))` from `src/services/documentClass.ts`. It is **empty on `prd_spec`**, which is the strict anchor, and the paste says so explicitly so an agent doesn't read the blank as a missing value and fall back to guessing.

**Why it is data rather than prose in the prompt.** Two reasons, and the second is the load-bearing one.

- **Cost.** A paste-side rule would have to carry the whole decision table, so the agent could classify the document itself — paid every session, in every genre. Shipped as data it is *resolved*: the strict-anchor case (the PM persona writing PRDs) pays nothing at all, and only the relaxed genres carry ~200 tokens per `/doc` pull.
- **The app already knows.** `stage` is a value the user set. Handing the agent a conclusion drawn from it beats handing it a rule and hoping it applies it the same way our own pipeline does.

**Why it cannot move behind the reference URL, unlike almost everything else the prompt slimming moved.** The boundary validates taxonomy and register, and every rule it enforces teaches itself on rejection — a prescriptive submission comes back with the rule named and the fragment quoted, so guidance about phrasing can be fetched on demand or skipped entirely without lasting harm. **A miscalibrated observation has no such channel.** A PRD-strict `unsupported_claim` on a personal essay is register-clean and taxonomy-valid, so `submitExternalObservation` accepts it and the author sees it. Nothing downstream can notice. So calibration must arrive unbidden — in the snapshot, with the pointer to read it in the paste where it cannot be missed.

**It is a strictness dial, never an off switch.** Every non-empty block ends by restating that contradiction, clarity, and undefined_jargon are unchanged and fully in play, and `agentSnapshot.test.ts` asserts that across every genre. Relaxing contradiction off-genre would drop the check users value most on exactly the documents where an agent is least sure of itself.

**It is a sibling of the two built-in blocks, not a reuse of them.** `sectionCalibrationBlock` / `docCalibrationBlock` spend most of their words on what to extract into the claim ledger. A connected agent has no extraction stage and no ledger — it reads and posts in one pass — so those sentences would be describing machinery it cannot see. `agentCalibrationBlock` carries the same policy in the agent's own vocabulary and folds both tiers into one block.

## When the draft is too thin to review (the maturity band)

> Added 2026-07-20 (UX-029). Change `snapshotMaturity` or the skill's band rules and update this section in the same task.

The snapshot carries `maturity: "unformed" | "forming" | "mature"` beside `stage`. It is the **same** `documentMaturity()` the built-in engine gates its doc-level pass on — deliberately shipped as data rather than restated as thresholds in the skill prose, so recalibrating the constants (they are flagged provisional; the V1 corpus study is scheduled to tune them) moves both engines at once instead of leaving the skill describing numbers that no longer hold.

**Why it exists at all.** A real session connected to an *empty* document and polled `/wait` → `/doc` → `/wait` for ~6 minutes while the author typed, then announced *"the document has settled (no changes in the last 60s), so I'll do the review pass now."* Nothing in the skill instructed a settle-wait — it had read the bridge's own `WAIT_TIMEOUT_MS` as a statement about the document and built a policy on it. The policy it invented was writtten's invariant 4 (*quiet while generating, opinionated while revising*), reached by accident and invisibly. The trigger is the starting condition: connect-then-write, rather than connect-to-an-existing-draft.

What the skill now instructs per band:

| Band | The agent's move |
| --- | --- |
| `unformed` | Don't review. Say so **once**, then park on `/wait`, re-pulling `/doc` on every return — timeout included — until the band moves. Then run the pass. |
| `forming` | Review, but send `missing_topic` / `underexposed_topic` at `"confidence": "low"` — on a half-written draft an absence is as often a section not yet reached as a real omission. |
| `mature` | The full pass. |

**It defers; it never refuses.** The band is a coarse structural proxy and can be wrong about an unusual document, so the skill tells the agent to name the hold-off and to proceed anyway if the author says so. The failure this converts is not "the agent reviewed too early" — it is six minutes of unexplained silence becoming one sentence.

**`confidence: "low"` is a real lever, not decoration.** `externalConfidence` is a downward-only clamp in `computePriority`, dropping the confidence factor 0.75 → 0.5. Note it moves *priority*, not `kind`: `missing_topic` and `underexposed_topic` are already `"opportunity"`, which is why the rule names those two and not `structure_flow` (unconditionally `"problem"` — promising a soft voice for it would be false).

### Known reading: a deferral renders as `watching`

While parked, the agent is in `/wait`, so the bridge broadcasts `waiting`, and `agentPassPhase` reports `watching` — re-armed every ≤60 s, so it never decays to `quiet` for as long as the deferral lasts.

This is accurate on its own terms (someone is attached and will react the moment you type) and it is the right thing for the author to see. It was worth stating plainly when the readout could not distinguish a deferred first pass from opt-in watch mode, since both park on the same endpoint. **Since 2026-07-21 the distinction mostly dissolved: watching is the default.** The skill now instructs the agent to keep watching after its first pass rather than stopping, so `watching` is the ordinary resting state rather than an opt-in the readout was quietly conflating. UX-029's secondary note — an agent appearing to enter watch mode unasked — is retired by the same change: it is asked, by default. If a deferral-versus-watching distinction is ever needed, it is still a change in `agentActivityView` / `ControlCenter`, not here.

### `docVersion` is app-local, and can move backwards

> Recorded 2026-07-20. Pre-existing; surfaced while building the maturity deferral.

The app's `docVersion` is function-local to `startAgentBridge` and starts at **0** on every mount (`agentBridgeClient.ts`). The **bridge process** keeps whatever it was last told and assigns it verbatim in its `/snapshot` handler, with no monotonicity guard. So reloading the tab after, say, 7 material versions makes the app push `1` to a bridge that had been serving `7`.

An agent parked on `/wait?since=7` then sees nothing resolve until six more material edits accumulate. When watching follows a completed first pass the author has already seen output and would notice the silence; a deferral parks **unattended**, before anything has been reported, which is what turns this from a nuisance into something that reads as a hang.

**What makes it survivable** is the skill's park rule: re-pull `/doc` on every `/wait` return, `{"timeout": true}` included, and decide from `maturity` rather than from the version number. The worst case is then 60 s of latency, not an indefinite park. That rule is load-bearing for this reason as much as for the missed-wake one — **do not "simplify" it into waiting on `docVersion` alone.**

The honest fix, if it ever earns its keep, is to reconcile on connect: read the bridge's current `docVersion` from `/handshake` or `/doc` and seed the local counter above it. Deliberately not done as part of UX-029 — it is a separable bug, and the park rule removes its teeth.
