# Evaluation diagrams

Visual references for the text-evaluation system — the "evaluation brain." These are point-in-time
maps of how the pipeline actually works; when you change triggers, timing, evaluator structure, or the
taxonomy, update the source of truth in [`docs/mechanics/evaluation-triggers.md`](../mechanics/evaluation-triggers.md)
first, then refresh these if the shape changed.

| File | What it shows | Open with |
| ---- | ------------- | --------- |
| [`evaluation-flowchart.svg`](evaluation-flowchart.svg) | End-to-end flow: one signal traced from an editor event → trigger → gates → orchestrator → evaluator → ledger/observations → feed. | Any browser / renders inline on GitHub. Light + dark aware. |
| [`evaluation-brain-map.html`](evaluation-brain-map.html) | "Single glance" reference of every part — all triggers, gates, the three evaluator modes with their internal steps, model router tiers, claim ledger, and the full observation taxonomy with its axes and guardrails. | Open in a browser (`open docs/diagrams/evaluation-brain-map.html`). |

The Mermaid version of the flowchart below renders natively on GitHub and is the easiest to keep in sync
by hand.

## End-to-end flow (Mermaid)

```mermaid
flowchart TD
  E([Editor event])

  E --> T1[Section settle<br/>pause · Enter · blur]:::fast
  E --> T2[Bulk paste<br/>≥150 words]:::bulk
  E --> T3[Doc-idle<br/>12 s silence]:::strong
  E --> T4[Stage edited<br/>3 s debounce]:::strong
  E --> T5[Block deleted]:::ctrl

  T5 --> C[No-LLM cascade:<br/>orphan claims + close observations]:::ctrl
  C --> AC[Observations auto-closed]:::ctrl

  T1 --> S[scheduleEval · orchestrator entry]:::ctrl
  T2 --> S
  T3 --> S
  T4 --> S

  S --> G{Settle gates pass?}
  G -- no --> SIL[Stay silent — no model call]:::ctrl
  G -- yes --> O[Orchestrator shaping:<br/>coalesce 250 ms · serialize · RPM defer]:::ctrl

  O --> M{Which grain?}
  M -- section --> ES[evaluateSection<br/>fast + strong contradiction]:::fast
  M -- document --> ED[evaluateDocument<br/>strong · doc-scope]:::strong
  M -- bulk sweep --> EL[evaluateLedgerContradictions<br/>strong all-pairs]:::strong

  ES --> R[Reconcile — match · grace ·<br/>suppression gate · commit hash]:::ctrl
  ED --> R
  EL --> R

  R --> L[(Claim ledger<br/>commitment · fact · definition ·<br/>constraint · metric)]:::ctrl
  R --> OB[Observations — 9 fixed types<br/>span · document · conflict]:::coral
  L -. reads ledger .-> ES

  OB --> F[writtten feed:<br/>active → auto_closed · dismissed · superseded]:::ctrl
  F --> U([User reflects & rewrites — never an auto-fix])

  classDef fast fill:#e1f5ee,stroke:#0f6e56,color:#04342c;
  classDef strong fill:#eeedfe,stroke:#534ab7,color:#26215c;
  classDef bulk fill:#faeeda,stroke:#854f0b,color:#412402;
  classDef coral fill:#faece7,stroke:#993c1d,color:#4a1b0c;
  classDef ctrl fill:#f1efe8,stroke:#5f5e5a,color:#2c2c2a;
```

Legend — colour encodes the model tier a step invokes: teal = fast (per-section), purple = strong
(doc / conflict), amber = bulk paste, coral = observation output, grey = control & stores (no model call).

## Notes on fidelity

- The single **"settle gates"** node collapses three genuinely different gates that don't all apply to
  every path: terminal punctuation + length (section triggers), the maturity proxy (doc-idle, `nascent`
  stays silent), and the 150-word threshold (the bulk contradiction sweep only).
- The **model-router** fast/strong split is encoded as node colour rather than its own node. The brain
  map has a dedicated router panel.
- **`block-removed`** is the only path that never calls a model — it peels off into the no-LLM cascade.
- The dashed **`reads ledger`** edge is the key feedback loop: contradiction checks read the claim ledger
  instead of re-reading the document (Invariant #3, no per-keystroke full-document scans).
