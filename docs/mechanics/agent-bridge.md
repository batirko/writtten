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

## How a user reaches the connect section

Three entry points, all landing in the same section of the Settings modal. All three are gated on `FEATURE_AGENT_BRIDGE` (ON since 2026-07-20).

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

**Revoke + bulk archive** — `archiveExternalSource(docId, sessionId)`, closure reason `source_revoked`, scoped by `sessionId` rather than display name so revoking one run never sweeps up cards kept from an earlier one.

The UI folds revoke into the existing teardown rather than adding a competing control: PR2's Disconnect/Forget already clears the pairing and invalidates the token, so the only thing missing was the offer. Clicking it when the source has active cards opens a confirm naming the count, with an **unchecked** "Archive its N observations too" — the observations belong to the user, not to the connection. With no cards to strand there is no dialog at all. Kept cards flip their chip to `revoked`.

Both paths call `notifyObservationsChanged()`: no eval pass ran, so nothing else would tell the feed to reload.

## Signals

| Module | Carries | Written by |
| --- | --- | --- |
| `model/agentSourceSignal.ts` | pairing state + `name` + `sessionId` for the chip | `useAgentBridge` only |
| `model/observationsSignal.ts` | "the store changed, reload" (PR2) | boundary accepts, retract, bulk archive |

`agentSourceSignal` is a module-level observable, not React context, because the chip renders outside `ControlCenter`'s tree. It is production code, not a debug affordance — the dev-only `window.__sidecar__` harness must never become its carrier.

## Dev affordances

`window.__sidecar__.seedObservation({ type, text, blockId?, name?, sessionId? })` writes an agent-attributed card directly, and `setAgentStatus(state, name?, sessionId?)` drives the pairing signal — both DEV-only, both bypassing the boundary, so attribution and lifecycle can be exercised with no live bridge. The real path is `submitExternalObservation`, which validates.

## Dropped from the spec: the "Agent only" source toggle

Spec decisions 2/8 called for a Settings toggle pausing built-in checks while an agent is connected, to save free-tier RPD. **Dropped at build time, 2026-07-19 (owner).**

The rationale did not survive contact: a keyless user has no built-in checks to pause, a paid user saves pennies, so the only beneficiary is someone on a free-tier BYOK key who *also* connects an agent — a group BYOA exists to shrink. The trust-relevant half of decision 2 is unaffected and still holds: connecting an agent never pauses the built-in evaluator, because nothing can pause it. Both sources always run.

Consequences: no `agentOnlyMode` store, no orchestrator gate, and no "paused" state to represent in the process readout. If RPD pressure shows up in dogfooding it is a small add-back.
