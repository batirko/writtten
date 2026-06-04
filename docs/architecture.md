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
│   Sidecar Feed UI  ·  Archive  ·  Export                      │
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
- Keys are stored **locally** and used to call providers directly from the client wherever CORS allows, keeping document content off any server. Where a provider can't be called from the browser, that's a constraint to solve per-provider — not a reason to centralize document data.

## Privacy

Local-first is a feature, not an accident. Document content stays on the client by default; sensitive PRDs never need to leave the machine. Don't introduce required telemetry, server-side storage, or third-party egress without an explicit, logged decision. BYO keys live in local storage and are never transmitted anywhere except the chosen model provider.

## Extension seams (OSS / "vibecodable" friendliness)

This is an OSS project; design for contributors using AI tooling to extend it without touching the core:

- **Observation types** are data + a prompt + a threshold. Adding one shouldn't require touching the orchestrator's control flow. Two philosophy constraints are enforced at this seam, not left to model goodwill: the **anti-taxonomy** (the negative list of categories that must never be surfaced — `docs/features.md` → _Anti-taxonomy_, R4.3) lives as an explicit negative instruction in the span-check prompts, and **register discipline** (locate, don't prescribe; no leading questions — R2.2–R2.3) is a prompt rule plus a ratchet fixture. Both are guarded by `docs/projects/evaluator_quality_ratchet.md` fixtures so a prompt regression fails CI rather than silently drifting.
- **Model providers** plug into the router behind one interface.
- **Export formats** plug into an export registry.

Keep these three seams clean and documented; they're where most contribution will happen.
