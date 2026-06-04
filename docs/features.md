# Features & Workflows

> The _what_. Philosophy is in `docs/concept.md`; implementation mechanics are in `docs/architecture.md`. Phase boundaries (what to build now vs later) are in `docs/plan.md`.

## The two-panel layout

- **Editor (primary, left/center):** a rich text editor where the user writes everything themselves. No AI authoring affordances of any kind.
- **Observation feed (sidecar, right):** a live, scrollable list of AI-generated observation messages about the current document. This is where the AI "speaks."

## Core workflow

1. User opens or starts a document and writes in the editor.
2. While the user is actively generating (typing, incomplete content), the feed stays quiet.
3. As blocks _settle_ and the document crosses a content threshold, the AI begins surfacing observations into the feed.
4. Each observation is typed (from a fixed taxonomy), may be anchored to a span of text, and carries a short human-readable note. **It never includes a rewrite or an apply button.**
5. Hovering an observation highlights the span it refers to (if it has one). Document-level observations highlight nothing / indicate "whole document."
6. As the user edits, affected observations are re-evaluated and **auto-close** if resolved.
7. The user can dismiss any observation manually.
8. Closed and dismissed observations move to an **archive**, which remains accessible.
9. When done, the user exports/copies the text to take it elsewhere.

## The observation taxonomy (fixed, typed)

Observations are **not** free-form LLM reactions. They come from a defined list. Each type has its own prompt, its own firing threshold, and its own UI treatment. A fixed taxonomy is what makes the system tunable, evaluable, and trustworthy.

Two classifying axes:

- **Scope:** `span` (anchored to specific text) vs `document` (about the doc as a whole).
- **Nature:** `defect` (something is wrong) vs `opportunity` (something is missing/underdeveloped).

Starting set:

| Type                 | Scope                  | Nature      | What it flags                                                                       |
| -------------------- | ---------------------- | ----------- | ----------------------------------------------------------------------------------- |
| `clarity`            | span                   | defect      | Ambiguous, vague, or hard-to-parse passage.                                         |
| `contradiction`      | span↔span / span↔stage | defect      | A claim that **logically cannot coexist** with another claim or the stated stage. **Hero feature.** |
| `strategic_tension`  | span↔span              | opportunity | Two claims each desirable but pulling in opposite directions — a deliberate tradeoff, not a logical paradox. Softer register than `contradiction`. |
| `unsupported_claim`  | span                   | defect      | An assertion presented as fact without basis.                                       |
| `undefined_jargon`   | span                   | defect      | A term likely undefined for the stated audience.                                    |
| `underexposed_topic` | span / document        | opportunity | A topic mentioned but not developed.                                                |
| `missing_topic`      | document               | opportunity | A topic this _kind_ of doc usually covers but this one omits. Depends on the stage. |
| `structure_flow`     | document               | opportunity | Ordering / flow issues across sections.                                             |
| `audience_mismatch`  | document               | opportunity | Tone/depth misaligned with the stated audience.                                     |

This list is expected to evolve. Add types by extending the taxonomy and giving each a prompt and threshold — never by loosening into open-ended generation. See `docs/architecture.md` for how a type maps to a check.

### Per-type behavior notes

- **`contradiction`** is the priority. It can reference two spans (highlight both on hover) or a span against the stage definition. Lean on the claim ledger (see architecture). Reserved for genuine logical incompatibility — a conflict in a number, date, commitment, or fact.
- **`strategic_tension`** is the soft sibling of `contradiction`, produced by the same cross-claim check. When two claims compete on goals/priorities rather than facts (e.g. "notify on every fraud block" vs. "minimize friction"), the check routes them here instead of firing a false contradiction. Same dual-span highlight, but `opportunity` kind (teal, non-alarm) and **never floored** — it provokes without crying wolf. Added 2026-06-04 to resolve OBS-004.
- **`missing_topic`** and **`audience_mismatch`** are only as good as the stage definition. They should stay quiet until the stage is known/inferred.
- **`clarity`** is the cheapest, highest-frequency, span-local check — good for the first build.

## The stage definition

An optional short free-text paragraph where the user states what the document is and any key details ("internal PRD for the payments team about Q3 fraud tooling; audience is eng + design"). This grounds the document-level checks.

**Improvement over a blank optional field:** blank optional fields stay empty, which starves the checks that need them most. Instead, **infer a provisional stage from the content** once enough exists, and show it back for one-click confirmation:

> "Looks like a PRD for an internal engineering audience — right?" [Confirm] [Edit]

The inference itself is a perfect quiet sidecar moment: the AI demonstrating it understands what the user is doing without being briefed. The user can always edit the stage manually.

## Observation message lifecycle

States:

- `active` — currently shown in the feed.
- `auto_closed` — resolved by a user edit; moved to archive automatically.
- `dismissed` — waved off by the user; moved to archive.
- `superseded` — replaced by a newer, more relevant observation about the same span/issue.

All non-`active` states are visible in the **archive**. The archive is browsable and filterable (by type, by state). Auto-closing on edit is essential — it's what makes the feed feel alive and responsive rather than a static lint report.

### Dismissal should teach

When a user dismisses an observation, suppress that specific observation (and ideally that _kind_ of observation for that _term/span_) for the rest of the document — at minimum per-doc, optionally per-user as a preference. Re-nagging about something the user explicitly waved off is the fastest way to make the tool feel dumb. Cheap to implement, large effect on perceived intelligence.

## Anchoring & highlighting

Observations point at spans; the user edits; spans move. Highlights must **follow their text through edits**, not sit at frozen character offsets. This is a hard requirement that drives the editor choice (ProseMirror decorations + position mapping — see `docs/architecture.md`). If a span is deleted entirely, its observation should auto-close (the thing it referred to is gone).

Hover behavior:

- Hover a span-scoped observation → highlight its span(s) in the editor; scroll into view if off-screen.
- Hover a document-scoped observation → show a subtle "whole document" affordance, no span highlight.

## Quiet / warm-up behavior (UX surface of the philosophy)

- **Span checks** fire only on _settled_ blocks: debounced after typing stops, block ends in terminal punctuation, and meets a minimum length. Never critique mid-sentence.
- **Document checks** start only after the document crosses a content threshold (enough blocks / words for the master summary and claim ledger to be meaningful).
- The empty/early state should communicate the intent: the tool is _deliberately_ quiet while you draft and will speak up as you revise — not "loading," but "letting you think."

## Export & import

Users write here, then take the text elsewhere — so frictionless egress is core, not a footnote.

- **Export:** Markdown (`.md`), PDF (`.pdf`).
- **Copy to clipboard:** rich text _and_ Markdown.
- **Import / round-trip:** keep the editor schema Markdown-friendly so users can paste/import existing drafts and round-trip losslessly. PMs will arrive with text already written.

## Free vs BYO-key (user-facing)

- **Free tier:** cheap/fast models plugged in by default — enough to demonstrate the loop.
- **BYO-key:** users supply their own API key for stronger models and better observations, paying their own inference costs. This is a settings-level choice, surfaced plainly. Mechanics and the router abstraction are in `docs/architecture.md`.
