---
status: in-progress
kind: infra
phases: [4, 5]
summary: Redesign the debug/observability log into one call-centric, self-describing event model — merge request+response, dereference static prompts, add archival (user + system) records, and unify the two divergent logs — optimized for human reading and AI consumption (automated testing or pasted-by-user).
---

# Debug log — observability redesign

> The debug log is the one surface a human or an AI uses to answer "what did the app just do, and why?". Today it answers that badly: it logs raw HTTP calls, repeats ~1.5 KB of static prompt on every row, duplicates the payload across a request row and a response row, never records when an observation is **archived**, and exists as **two divergent logs that disagree**. This file specifies a single call-centric event model and a self-describing export envelope.

## Status

> Canonical status lives in the frontmatter above and is mirrored in the Projects Index in `docs/plan.md`. This block carries the human-readable scope only.

**Phase 4 slice shipped 2026-06-05; Phase 5 (log unify + token/cost) remains `idea`.** Triggered while debugging a Phase-4 field-test session whose "Copy All" log could not show observation archival at all. This is **dev/observability infrastructure**, gated behind the existing **Enable LLM Debug Mode** flag — entirely client-side, no server, telemetry, or egress (standing rule 5). It overlaps two shipped docs and should be read alongside them:

- `docs/projects/agent_acceptance_harness.md` — owns the structured **event stream** primitive (`window.__sidecar__.getEvents()`), the readiness signal, and the seedable-state/mock surfaces.
- `docs/projects/model_rotation_and_debugging.md` — owns the **LLM debug panel** + per-model quota/`getApiStats()` surface that the call log feeds.

This redesign is the third leg: the **log record model and export** shared by both.

**Phase scope:** Phase 4 (the call-centric merge + archival records + envelope — the insights needed to field-test signal quality *now*) · Phase 5 (unify the two logs behind one emitter; token/cost capture; retention/redaction polish that rides with hardening).

---

## Phased Plan

| Phase       | Contribution                                                                                                                                                                                                 |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 4** | The high-value, low-risk wins that make a pasted log legible: (1) **archival records** with actor + reason + metadata; (2) **merge request+response** into one call record with collapsed retries/rotation; (3) **dereference static system prompts + glossary** into an envelope dictionary; (4) **chronological, self-describing export**. |
| **Phase 5** | **Unify** the harness event stream and the `llmLogger` call log behind a single emitter with two read-views (agent stream vs. human panel), so an event added once shows up in both. Optional **token/cost capture** from Gemini `usageMetadata`. Retention tuning + secret redaction audit for the export path. |

---

## Todo

### Phase 4 — shipped 2026-06-05

- [x] Add an `archive` record emitted from every observation status transition — user dismissal (`App.handleDismissObservation`), auto-collapse (`handleObservationCollapsed`), block-removed + stage-changed (`orchestrator.ts`), and the three system transitions in `evaluator.ts` (`auto_closed`, `superseded`, `resolved_prior`). Carries `actor`, `reason`, `obsType`, `kind`, `severity`, `scope`, `blockId`, `text`, and `supersededBy` where applicable. Single emit point `harness.archive()` writes both logs (see D5 note below).
- [x] Merge the separate `request`/`response`/`error`/`retry` rows into a single **call record** keyed by a `callId` (minted in `gemini.callWithRotation`), with rotation attempts collapsed into an `attempts[]` array and the terminal `status`/`latencyMs`/`response` on the record. *Done as an export-time projection* (`debugLog.ts`) over the append-only raw log, so the quota accumulators and existing tests stay untouched.
- [x] Group calls and their triggering event under a shared `evalId` (minted in `orchestrator.logTrigger`, threaded via `LLMRequest.meta` → `gemini` → log entries; system archives stamped with it too).
- [x] Hoist static `payload.system` text into an envelope `systemPrompts` dictionary; store only a `promptRef` on each call. Same for the static defined-terms glossary in `payload.user` (`{{glossary}}` token).
- [x] Change "Copy All" to emit the **export envelope** (meta header + dictionaries + chronological `log`) instead of `JSON.stringify(logs)` newest-first.
- [x] Add `produced` linkage to the call record (observation types yielded, ledger-write count, `resolved_prior` indices) via `llmLogger.recordProduced(callId, …)`, so a reader sees a call's *effect*, not just its response string.
- [x] Drop the dead `fallback` type variant; trigger/call/archive are distinct record shapes in the projection.

**Files:** `model/router.ts` (`meta`/`callId` on the request/response types), `model/logger.ts` (correlation fields + `archive` type + `logArchive`/`recordProduced`), `model/debugLog.ts` (the projection + envelope, new) and `debugLog.test.ts`, `model/gemini.ts` (callId lifecycle), `services/orchestrator.ts` + `services/evaluator.ts` (evalId threading + archives + produced), `App.tsx` (user archives), `debug/harness.ts` (`archive()` dual-write + event type), `sidecar/SidecarFeed.tsx` (archive rendering + envelope export). Verified live: envelope shows merged calls, dereferenced prompt/glossary, archive `actor`/`reason`, and `produced` effects.

### Phase 5

- [ ] Single emitter feeding both the agent event stream and the human debug panel; reconcile the two type vocabularies and retention limits.
- [ ] Capture Gemini `usageMetadata` (prompt/candidate token counts) per call; surface per-call cost alongside latency.
- [ ] Redaction pass on the export envelope (ensure API keys never leave the `<free>`/`<paid>` masking; confirm no key material in `endpoint`).
- [ ] Retention review now that records are denser (merged + dereferenced): tune `maxLogs`/`MAX_EVENTS` against a realistic bulk-paste session.

---

## Background — the two logs we have today

There are **two independent logging systems**, with different vocabularies, buffers, ordering, and consumers. This is the root structural problem; the three reported symptoms are downstream of it.

| | **`llmLogger`** (`src/model/logger.ts`) | **`harness`** (`src/debug/harness.ts`) |
|---|---|---|
| Record type | `LLMLogEntry` | `HarnessEvent` |
| Event vocabulary | `trigger · request · response · retry · fallback* · error` | `settle · request · response · ledger-write · observation · block-removed · error` |
| Consumer | Debug **panel** UI + **"Copy All"** export (`JSON.stringify(logs, null, 2)`) | `window.__sidecar__.getEvents(sinceSeq)` — agent polling |
| Ordering | newest-first (`logs.unshift`) | oldest-first (monotonic `seq`) |
| Retention | `maxLogs = 50` | `MAX_EVENTS = 500` |
| Correlation key | none | monotonic `seq` only |
| Knows about archival? | **no** | **no** (emits `observation` on *create*, nothing on close) |

\* `fallback` is declared in the union but never emitted — dead schema.

**The pasted session that motivated this doc is the `llmLogger` "Copy All" output.** So every symptom below is in that path; the harness stream shares the structural cause and the Phase-5 fix.

Notice the vocabularies barely overlap: `llmLogger` has `trigger`/`retry` that the harness lacks; the harness has `settle`/`ledger-write`/`observation`/`block-removed` that `llmLogger` lacks. An agent watching `getEvents()` and a human reading "Copy All" are looking at **two different partial views of the same session**, and neither is complete. Adding "archival" to one would not surface it in the other.

---

## Problems

### P1 — Archival is invisible (the reported gap)

Observations change status through **five** code paths, and **none** emits a log record:

| Transition | Site | Actor |
|---|---|---|
| `dismissed` | `App.tsx` `handleDismissObservation` (+ writes a `DismissalSuppression`) | **user** |
| `auto_closed` (collapse) | `App.tsx` `handleObservationCollapsed` | **user** |
| `auto_closed` (no counterpart in new eval) | `evaluator.ts` reconcile loop | **system** |
| `auto_closed` (model confirmed `resolved_prior`) | `evaluator.ts` force-close | **system** |
| `superseded` (new obs overlaps old, different text) | `evaluator.ts` reconcile | **system** |

A reader of the log sees an observation appear (harness `observation` event) and then silently vanish. There is no way to tell *dismissed-by-user* from *auto-closed-by-system* from *superseded*, nor why. This is exactly the question that opened this session and the log could not answer it.

### P2 — The static system prompt is repeated on every row

Every `request`/`response`/`error`/`retry` entry carries the full `payload.system` — the ~1.5 KB editor persona + instructions. There is a **small fixed set** of distinct system prompts (section-eval fast, contradiction strong, doc-quality strong). In the pasted 25-entry log the *same* section-eval system prompt appears verbatim ~6 times and the doc-quality prompt ~4 times. This dominates the byte budget, pushes real signal out of the 50-entry buffer faster, and bloats anything pasted to an AI.

The same is true of the **defined-terms glossary** appended to every fast `payload.user` (~34 lines of `sprint/backlog/roadmap/...`) — static boilerplate repeated per call.

### P3 — request and response duplicate the whole payload

A single LLM call produces **two** rows — a `request` and a `response` — and both carry the identical `payload: {system, user}`. The response row re-logs the entire prompt just to attach a `response` string and a `latencyMs`. For one call you store the (large) prompt **twice**. A rotation retry adds a third copy via the `retry` row.

### P4 — No correlation; effects aren't linked to causes

Records are a flat stream with no shared key. To reconstruct "this `doc-idle` trigger fired this strong call which produced these 4 missing-topic observations and resolved prior [0]", a reader must eyeball matching `model` + `payload` + adjacent timestamps. There is no `callId` joining request↔response↔retries↔error, no `evalId` joining a trigger to the calls it spawned, and no link from a call to the **observations/ledger-writes it produced**. The log shows inputs and outputs but never *which output came from which input*.

### P5 — The export isn't self-describing

"Copy All" dumps a bare array, **newest-first**, with no header. An AI (or human) receiving the paste has no schema version, no app build, no indication of `llmMode` (live vs mock), no key-tier, and no legend for the trigger kinds — it must infer the decoder ring from the data. Newest-first ordering also fights causal reading (you scroll **up** to find the cause of a row).

### P6 — One flat schema with empty fields

`trigger` rows carry `model: "", endpoint: "", payload: {system:"", user:""}` — four dead fields, because every record shares one `LLMLogEntry` shape. The schema pays for fields most record types don't use.

---

## Design

### D1 — Three record shapes, one stream

Replace the single flat `LLMLogEntry` with a discriminated union of purpose-built records. The atomic unit is the **call**, not the HTTP request/response pair.

```ts
// A trigger: something asked the system to (re)evaluate.
type TriggerRecord = {
  kind: "trigger";
  evalId: string;            // groups everything this trigger spawned
  triggerKind: string;       // doc-idle | settle-pause | bootstrap-sweep | stage-changed | block-removed | rerun | ...
  blockId?: string;
  t: number;
};

// A call: one logical LLM call, including any rotation/retry attempts.
type CallRecord = {
  kind: "call";
  callId: string;
  evalId: string;            // back-link to the trigger
  tier: "fast" | "strong";
  keyTier: "free" | "paid";
  promptRef: string;         // dictionary key, NOT the full system text
  user: string;              // variable user content (glossary dereferenced — see D3)
  attempts: Array<{          // rotation collapsed here; one entry per model tried
    model: string;
    status: number | "timeout";
    latencyMs: number;
    retryDelayMs?: number;
    error?: string;
  }>;
  status: number | "timeout";// terminal outcome
  latencyMs: number;         // terminal attempt latency
  response?: string;         // parsed model output (the JSON the model returned)
  produced?: {               // what this call DID — the missing effect-linkage (P4)
    observations?: Array<{ id: string; type: string }>;
    ledgerWrites?: Array<{ blockId: string; action: "insert" | "overwrite" }>;
    resolvedPrior?: number[];
  };
  t0: number; t1: number;
};

// An archive: an observation left the active feed. The reported gap (P1).
type ArchiveRecord = {
  kind: "archive";
  observationId: string;
  obsType: string;           // missing_topic | clarity | contradiction | ...
  obsKind?: string;          // taxonomy kind axis
  severity?: string;
  scope: "span" | "document";
  blockId?: string;
  text: string;              // the observation text, so the log is readable standalone
  reason: "dismissed" | "collapsed" | "auto_closed" | "superseded" | "resolved_prior" | "block_removed";
  actor: "user" | "system";
  supersededBy?: string;     // observationId, when reason = superseded
  evalId?: string;           // which eval pass closed it, for system reasons
  t: number;
};
```

`actor` is the single field that answers the session's opening question: **user vs. system**. `reason` answers *why*. `supersededBy`/`evalId` answer *by what*.

### D2 — Correlation via `evalId` / `callId`

`logTrigger` mints an `evalId`; the orchestrator threads it through the eval so each `CallRecord` carries it; the reconcile step stamps the `evalId` onto the `ArchiveRecord`s it produces and the observation ids onto the call's `produced`. Result: a reader (or a query) can collapse a whole eval pass into one tree:

```
trigger(doc-idle, evalId=E7)
└─ call(strong, doc-quality, E7) → produced 4 missing_topic, resolved_prior [0]
   └─ archive(obs#a1b2, auto_closed, system, evalId=E7)   // the resolved prior
```

### D3 — Dictionaries in the envelope (P2)

The export carries a `systemPrompts` map (and a shared `glossary`) **once**; every call references by id. The full text is present exactly one time in the blob, so an AI receiving the paste still has it, but a 25-call session stops shipping the same 1.5 KB ten times.

```jsonc
{
  "meta": {
    "schemaVersion": 2,
    "appBuild": "<git sha / vite build id>",
    "capturedAt": "2026-06-05T17:53:20Z",
    "llmMode": "live",            // live | mock | record
    "activeKeyTier": "paid",
    "triggerKinds": ["doc-idle", "settle-pause", "bootstrap-sweep", "stage-changed", "block-removed", "rerun"]
  },
  "systemPrompts": {
    "section-eval-v3": "You are an AI sidecar evaluating a section…",
    "contradiction-v2": "You are a critical editor analyzing how the claims…",
    "doc-quality-v2":   "You are a critical editor reviewing a document…"
  },
  "glossary": ["sprint", "backlog", "roadmap", "…"],
  "log": [ /* chronological TriggerRecord | CallRecord | ArchiveRecord */ ]
}
```

`promptRef` values are **versioned** (`-v3`) so a pasted log records *which* prompt revision ran — useful when prompt edits change behavior between sessions.

### D4 — Chronological, self-describing export (P5)

"Copy All" emits the envelope above with `log` in **oldest-first** causal order. The `meta` header is the decoder ring; an AI receiving the paste needs no out-of-band context. (The live panel UI can keep rendering newest-first for at-a-glance monitoring — ordering is a view concern, not a storage concern.)

### D5 — Unify the two logs (Phase 5)

One emitter records each event once; the agent stream (`getEvents`) and the human panel are two **views** over the same buffer. This kills the vocabulary divergence (P-background) and guarantees an `archive` event added for the panel is also visible to an automated agent waiting on `getEvents()`. Reconciling retention (50 vs 500) and the `seq`-vs-timestamp keys happens here.

---

## Worked example — before / after

**Before** (today, the pasted session — two rows for one call, full prompt in each, newest-first, no effect linkage):

```jsonc
{ "type": "response", "model": "gemini-2.5-pro", "latencyMs": 18865,
  "payload": { "system": "You are a critical editor reviewing a document…[1.5 KB]",
               "user": "Stage/Context: Project Brief…[full ledger]" },
  "response": "{ \"missing_topic_observations\": [ …4 items… ] }", "keyTier": "paid", … }
{ "type": "request", "model": "gemini-2.5-pro",
  "payload": { "system": "You are a critical editor reviewing a document…[1.5 KB AGAIN]",
               "user": "Stage/Context: Project Brief…[full ledger AGAIN]" }, … }
{ "type": "trigger", "triggerKind": "doc-idle", "model": "", "endpoint": "",
  "payload": { "system": "", "user": "" }, … }
```

**After** (one call record, prompt dereferenced, effect + cause linked, chronological):

```jsonc
{ "kind": "trigger", "evalId": "E7", "triggerKind": "doc-idle", "t": 1749… }
{ "kind": "call", "callId": "c12", "evalId": "E7",
  "tier": "strong", "keyTier": "paid", "promptRef": "doc-quality-v2",
  "user": "Stage/Context: Project Brief…[full ledger — variable part only]",
  "attempts": [{ "model": "gemini-2.5-pro", "status": 200, "latencyMs": 18865 }],
  "status": 200, "latencyMs": 18865,
  "response": "{ \"missing_topic_observations\": [ …4 items… ] }",
  "produced": { "observations": [
      {"id":"a1","type":"missing_topic"}, {"id":"a2","type":"missing_topic"},
      {"id":"a3","type":"missing_topic"}, {"id":"a4","type":"missing_topic"} ] } }
{ "kind": "archive", "observationId": "x9", "obsType": "clarity", "scope": "span",
  "blockId": "pBGd4dO-cq", "text": "The definition of 'primary analytics reports'…",
  "reason": "resolved_prior", "actor": "system", "evalId": "E7", "t": 1749… }
```

Same session, dramatically fewer bytes, and every question the original could not answer — *who closed that observation, why, and from which call* — is now answerable by reading one record.

---

## Open questions / decisions to make at build time

1. **Unify now or stage it?** Recommended: ship the call-centric model + archival + envelope on `llmLogger` in Phase 4 (immediate field-test value, low blast radius), then unify the emitters in Phase 5. Doing both at once risks destabilizing the agent harness mid-Phase-4.
2. **`produced` linkage requires threading the call's `callId` into the evaluator** so reconcile can attribute observations/archives back to the call. If that plumbing is too invasive for Phase 4, ship archival + merge + envelope first and add `produced` with the unify work.
3. **Token/cost capture** (Gemini `usageMetadata`) is genuinely useful for quota debugging but is additive — defer to Phase 5 unless a 429-debugging session needs it sooner.
4. **Panel ordering** stays newest-first (monitoring ergonomics); only the *export* flips to chronological. Confirm this split is acceptable.

## Out of scope

- Any change to product behavior or the user-facing feed. This is dev-mode observability only.
- Persisting the log across reloads / writing it to disk — it stays an in-memory ring buffer, consistent with local-first + no-egress.
- Server-side aggregation, remote telemetry, or sharing — explicitly excluded by standing rule 5.
