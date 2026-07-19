# Architecture

> The _how_. Read alongside `docs/features.md` (what we're building) and `docs/concept.md` (why). Build order and scope per phase is in `docs/plan.md` — don't build ahead of the current phase.

## Tech stack & rationale

| Layer       | Choice                                                                | Why                                                                                                                                                 |
| ----------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language    | **TypeScript**, end to end                                            | One language, largest contributor pool, keeps an OSS solo project maintainable. Avoids a TS/Python split.                                           |
| Editor      | **TipTap (ProseMirror)**                                              | Decorations + position-mapping solve the moving-highlight problem natively. Doc model is a node tree → each top-level node is a natural eval chunk. |
| App shape   | **Local-first PWA**, web first                                        | No mandatory backend; installable; most of the "app" feel for free. Tauri desktop wrapper is a _later_ option, not now.                             |
| Persistence | **Client-side** (IndexedDB; SQLite-in-browser if querying needs grow) | Cuts cost (cheap calls run against the user's own key directly), gives a real privacy story, fits "you own your thinking."                          |
| LLM access  | **Model-router abstraction**                                          | Single interface, swappable providers. Backs both the free cheap-model tier and BYO-key. Also a clean extension seam.                               |
| Export      | ProseMirror → Markdown; PDF via headless print/render                 | Well-trodden; keep schema Markdown-friendly for lossless round-trip.                                                                                |

**Do not casually swap the editor.** The anchoring mechanic (below) is built on ProseMirror's position mapping. Replacing it means re-solving the hardest UX problem in the product.

## System shape

Everything runs client-side by default:

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (PWA)                                                │
│                                                               │
│   Editor (TipTap/ProseMirror)                                 │
│      │  transactions (edits)                                  │
│      ▼                                                        │
│   Eval Orchestrator  ──────────►  Model Router ──► provider(s)│
│      │   ▲                                          (cheap/BYO)│
│      │   │ observations / closes                             │
│      ▼   │                                                    │
│   Stores (IndexedDB): document · block summaries ·           │
│                       claim ledger · observations · settings │
│      │                                                        │
│      ▼                                                        │
│   writtten Feed UI  ·  Archive  ·  Export                     │
└─────────────────────────────────────────────────────────────┘
```

No required server. (A thin optional proxy for the free tier's shared cheap model is allowed later, but must not become a hard dependency — log any such decision in `docs/plan.md`.)

## Document model

The ProseMirror document is a tree of nodes. Treat each **top-level block node** (paragraph, heading, list item, etc.) as the unit of evaluation — the "chunk." Each block has a stable id (via a ProseMirror plugin that assigns/persists ids across edits). This gives us, for free, the chunk boundaries the eval pipeline needs.

## The incremental evaluation pipeline

The central design constraint: **never scan the whole document on every change.** Naively re-reading 4,000 words per keystroke is compute-heavy, expensive, and slow. The pipeline turns an O(document) problem into bounded, mostly-local work.

### Trigger

On edit to block `B`, debounce ~2–4s _after typing stops on that block_. Then check the **settled** conditions (terminal punctuation, minimum length); if not settled, do nothing.

### Steps (for a settled block `B`)

1. **Re-summarize `B`** with a cheap model. Diff against its prior stored summary. If the change is trivial (typo, reorder, no semantic delta) → stop here.
2. **Span-level checks on `B`** (`clarity`, `unsupported_claim`, `undefined_jargon`): these need only `B` + the stage + the master summary. Cheap, frequent. Each is its own small prompt.
3. **Cross-document checks via the claim ledger** (`contradiction`, `missing_topic`):
   - Extract `B`'s claims and **compare against the ledger** — do _not_ re-read the document.
   - A claim conflicting with an existing ledger entry → `contradiction` observation (referencing both sources).
   - A claim that now satisfies an open `missing_topic`/`underexposed_topic` → close it.
1. **Reconcile `B`'s existing observations:** re-test each; auto-close the ones now resolved; supersede stale ones.
2. **Update the master summary** incrementally if `B`'s summary changed materially.

### The full-document pass happens essentially once

A single bootstrap pass builds the initial outline, master summary, and claim ledger when the document first crosses the content threshold. After that, routine operation is incremental. There is **no recurring full scan and no manual "sync" button** — a sync button would kill the sidecar magic.

### Model tiering maps onto frequency

- **Cheap/fast model:** summarization + span checks (high frequency). Cheap to run constantly.
- **Stronger model:** doc-level judgment calls — contradiction adjudication, missing-topic, audience fit (low frequency). This is exactly where a user's BYO key earns its cost.

## The claim ledger (technical heart)

Chunk summaries alone don't solve contradiction or missing-topic detection, because those are inherently cross-document. The **claim ledger** is a running, doc-level index of the assertions the document has committed to, each tagged with its source block.

### Entry shape (indicative)

```ts
interface ClaimLedgerEntry {
  id: string;
  sourceBlockId: string;        // which block asserted this
  text: string;                 // normalized statement of the claim
  kind:                         // light typing helps routing/conflict logic
    | "commitment"              // "we will ship X by Q3"
    | "fact_claim"              // "users churn at 12%"
    | "definition"             // "an 'active user' is …"
    | "constraint"              // "must work offline"
    | "metric";                 // "success = 20% activation"
  embedding?: number[];         // optional, for semantic conflict prefiltering (later)
  status: "active" | "orphaned"; // orphaned when its source block is deleted
}
```

### How it's used

- **On block edit:** extract claims from the block; upsert/retire ledger entries for that block.
- **Conflict detection (v0):** an LLM call — _"does this new claim conflict with any of these existing claims?"_ — over the candidate set. Simple, good enough to land the hero moment.
- **Conflict detection (later optimization):** use embeddings to prefilter to plausibly-related claims before spending an LLM call, so the comparison set stays small as documents grow.
- **Block deletion:** mark that block's claims `orphaned`; auto-close observations that depended on them (e.g. a contradiction whose other side just disappeared).

The ledger is also the substrate for `missing_topic`: compare the set of covered claim kinds/topics (informed by the stage) against what this document _type_ typically requires.

## Persistence (client-side stores)

Stored locally per document:

- **Document** — serialized ProseMirror doc (Markdown-friendly schema).
- **Block summaries** — `{ blockId, summary, hash }`; hash drives the trivial-change short-circuit.
- **Master summary** — the doc-level rollup.
- **Claim ledger** — entries as above.
- **Observations** — including state (`active`/`auto_closed`/`dismissed`/`superseded`) and dismissal-suppression records (for "dismissal teaches"). **Suppression records must be kind/severity-aware** so the learning can't be trained into flattery (`docs/features.md` → _Dismissal should teach_, R5.4): muting a low-severity nit category is fine and persists, but dismissing a high-severity defect/`contradiction` must not create a category-wide suppression that silences the same critique on other spans. The guard is a data-model property, not a UI nicety — owned by `docs/projects/philosophy_guardrails.md` (G1).
- **Settings** — model selection, BYO key (stored locally; see privacy), stage definition.

IndexedDB is the default. Move to SQLite-in-browser only if query patterns (e.g. ledger lookups) demand it — don't start there.

## Anchoring & position mapping

Observations reference spans by ProseMirror positions, and those positions are **mapped through every transaction** so a highlight tracks its text as the document changes. If a span is fully deleted, its mapped range collapses → auto-close the observation. This is the single most important reason TipTap/ProseMirror is the editor; treat the mapping logic as core infrastructure, well-tested.

## Model router

A single interface so the rest of the app never knows which provider it's talking to:

```ts
interface ModelRouter {
  // small, cheap, frequent calls (summaries, span checks)
  fast(req: LLMRequest): Promise<LLMResponse>;
  // stronger, rarer calls (contradiction adjudication, doc-level judgment)
  strong(req: LLMRequest): Promise<LLMResponse>;
}
```

- **Free tier** wires both tiers to cheap models (or a thin shared proxy, decided later).
- **BYO-key** wires `strong` (and optionally `fast`) to the user's chosen provider/key.
- **A connected agent is not a third routing option — it bypasses the router entirely.** BYOA (`docs/projects/agent_connected_eval.md`, shipped 2026-07-20) is a second _eval source_, not a fourth `ProviderAdapter`: no `LLMRequest` is built, no key is read, and writtten makes no model call at all. Observations arrive already-formed from an external session and enter through `submitExternalObservation` (`src/services/externalObservations.ts`), which validates them against the same taxonomy and register rules the router-fed pipeline is prompt-ratcheted for. Do not try to model it behind `ModelRouter`; the seam is the boundary module, and both sources always run.
- Keys are stored **locally** and used to call providers directly from the client wherever CORS allows, keeping document content off any server. Where a provider can't be called from the browser, that's a constraint to solve per-provider — not a reason to centralize document data.

### The `ProviderAdapter` seam — the canonical extension point

`ModelRouter` is what call sites depend on; **`ProviderAdapter` (`src/model/provider.ts`) is where a provider is defined**. Everything provider-specific lives in one adapter file:

```ts
interface ProviderAdapter {
  id: "gemini" | "openai" | "anthropic";
  label: string;
  pools: { freeFast; freeStrong; paidFast; paidStrong };      // ordered rotation models per tier
  catalog: { fast; strong };                                   // user-selectable models (Settings picker)
  buildRequest(model, req, key): { url; init };                // one HTTP attempt
  parseResponse(body): { text; usage? };                       // read a 2xx body
  classifyError(status, headers, body): { retryable; coolDownMs; quotaKind? };
}
```

The generic engine (`src/model/rotation.ts`) drives any adapter through cool-down registries, pool rotation, retry/backoff, stall + timeout handling, logging, and the free→paid fallback — it knows nothing about any one provider. Key redaction for logs is done there generically. The registry (`src/model/registry.ts`) lists the shipped adapters and resolves selection → routing; `factory.ts` wraps the result in the mock/record layer and holds the app-global active-provider selection.

**A fourth provider is one new adapter file — zero changes to `rotation.ts`, `ModelRouter`, or any call site.** Gemini, OpenAI, and Anthropic ship first-party (`gemini.ts` / `openai.ts` / `anthropic.ts`); a local/Ollama adapter is the natural next one (see _Local-app evolution path_). See `docs/projects/multi_provider_router.md` for the full design.

## Privacy

Local-first is a feature, but be precise about what it does and doesn't cover today — the 2026-06-10 due-diligence audit (#5) flagged this section as over-claiming, and it's worth stating plainly:

- **Storage** is genuinely local. The document, block summaries, claim ledger, observations, and settings live in IndexedDB on the client. There is no required server, no required telemetry, no server-side storage. BYO keys live in `localStorage` (plaintext — acceptable for a local-first BYO-key tool; worth a README sentence) and are transmitted only to the chosen model provider.
- **Evaluation is _not_ local.** Every settled block's text and the extracted claims are sent to the model provider for the eval calls — that's how the observations are produced at all. So for any document that gets evaluated, content **does** leave the machine. The earlier framing ("sensitive PRDs never need to leave the machine") was true only of storage, not of the running product.
- **The free tier is the sharp edge.** Google's free-tier Gemini API terms permit training on submitted content. The first persona's core artifact is the confidential PRD (the project's own test fixture is one). An enterprise PM reading this honestly cannot use the free tier for a confidential doc — which compounds the free-tier-real-or-demo question in `docs/plan.md`. A paid key (or BYO key under terms that exclude training) is the honest minimum for confidential work today.
- **A connected agent is the first shipped no-egress path** (BYOA, 2026-07-20). With a pairing active, writtten makes **no network request containing the document at all** — it goes over loopback to a process on the user's own machine. That is a strictly stronger claim than BYOK can make, and it is the one stated on `/privacy`. The precise limit, which must stay attached to the claim wherever it is repeated: writtten has no visibility past the loopback socket, so what the user's agent forwards to its own provider is governed by that agent's terms, not ours. Stronger, not absolute.
- **The fully local payoff is still the local-model adapter**, not the local storage — see _Local-app evolution path_ below. Until an Ollama-class adapter lands behind `ModelRouter`, "local-first" for the **key-based** path is a statement about where your data is _stored_, not about whether your document is _seen_ by a third party.

Don't introduce required telemetry, server-side storage, or new third-party egress beyond the model-provider eval calls without an explicit, logged decision in `docs/plan.md`.

## Extension seams (OSS / "vibecodable" friendliness)

This is an OSS project; design for contributors using AI tooling to extend it without touching the core:

- **Observation types** are data + a prompt + a threshold. Adding one shouldn't require touching the orchestrator's control flow. Two philosophy constraints are enforced at this seam, not left to model goodwill: the **anti-taxonomy** (the negative list of categories that must never be surfaced — `docs/features.md` → _Anti-taxonomy_, R4.3) lives as an explicit negative instruction in the span-check prompts, and **register discipline** (locate, don't prescribe; no leading questions — R2.2–R2.3) is a prompt rule plus a ratchet fixture. Both are guarded by `docs/projects/evaluator_quality_ratchet.md` fixtures so a prompt regression fails CI rather than silently drifting.
- **Model providers** plug into the router behind one interface.
- **Export formats** plug into an export registry.

Keep these three seams clean and documented; they're where most contribution will happen.

## Local-app evolution path

The first public iteration ships as a **web-first, local-first PWA** (browser storage, direct-to-provider calls, install + offline). A later turn into a **"proper" local desktop app** (Tauri/Electron, real on-disk storage, optional local model) is an _extend, not rewrite_ — provided two invariants below are held. This is recorded now, while the seams are fresh, so the option stays cheap to exercise.

**What transfers unchanged.** A Tauri shell runs the existing React/TipTap app inside the system webview — the entire UI (editor, decorations, the anchoring mechanic, feed, archive, settings) carries over as-is. The **model router** already hides the provider from every call site. The data model is **document-scoped**: `docId` is a first-class parameter through the orchestrator, evaluator, types, and the DB indexes (`by_doc`).

**Bounded swaps** (reimplement one module behind a stable interface, near-zero call-site churn):

- **Persistence** — rewrite `src/store/db.ts` against SQLite (Tauri SQL plugin) or the filesystem, keeping the exported function signatures. The boundary is sealed today (see invariant 1), so call sites don't change. The one real divergence is migrations: the idb `DB_VERSION`/`upgrade` cursor pattern becomes SQL migrations.
- **Secrets** — the local key store (browser `localStorage`, used only in `App.tsx`) → OS keychain / Tauri store.
- **A true local model** — a new adapter behind `ModelRouter` (Ollama was deferred; the seam is ready). This is the payoff that turns _local-first storage_ into genuine _no-egress privacy_ — closing the gap that document content is sent to the model provider for evaluation (see _Privacy_).

**Genuinely new surface** (net-new feature work, not refactor): **multi-document** (the data layer is ready; what's missing is a doc library/open-save UI and making `DOC_ID` a selected value rather than the `App.tsx` constant); optional **file-based documents** on disk (built on the export serialization seam); a one-time **data migration** from the PWA's IndexedDB to the desktop store.

**The two invariants that keep this path open** — both are _already true_; the cost is only not breaking them:

1. **IndexedDB stays sealed behind `src/store/db.ts`.** No other module imports `idb` or touches the `indexedDB`/`IDBKeyRange` globals. _Enforced_ by an ESLint `no-restricted-imports`/`no-restricted-globals` rule (`eslint.config.js`) scoped to `src/**` with `db.ts` exempt — so a regression fails `npm run lint`, not a future port.
2. **`docId` is never re-hardcoded.** New code threads it through rather than assuming a single document. Today the pinned constant `DOC_ID = "default"` appears in **two** places — `src/App.tsx` and `src/editor/Editor.tsx` (the 2026-06-10 code audit corrected an earlier claim that it was only in `App.tsx`). The multi-document work in Phase 6 must converge both onto a single selected value, not assume one site.

**The caveat is product, not technical.** "Proper local app" pulls toward file management, multi-doc, and maybe sync — the _destination-app_ territory the concept (`docs/concept.md`) defers in favor of owning the drafting moment. `docs/plan.md` Phase 6 frames the real fork: an **optional Tauri wrapper** (local-power-user wedge) vs. **living where users already write** (embedded-everywhere wedge). The architecture supports either; this section only guarantees the desktop option doesn't require a teardown.
