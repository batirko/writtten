---
status: idea
phases: [3, 4, 5]
summary: SkillOpt, LEANN, and markitdown — external tooling anchored to specific product phases; when to adopt, what prerequisite each needs, and how to use each.
---

# AI Tooling Integration

## Status

> Canonical status lives in the frontmatter above and is mirrored in the Projects Index in `docs/plan.md`. This block carries the human-readable scope only.

**Phase scope (reprioritized 2026-06-03):** Phase 4 (SkillOpt — the evaluator quality ratchet; recommendation quality is now the core-experience target) · Phase 3 (LEANN — claim-ledger embedding prefilter; shipped as a lexical prefilter) · Phase 5 (markitdown — binary-format document import; rides with egress). None of these are "install and forget" — each has a prerequisite gate before it earns its place.

---

## Phased Plan

| Phase        | Tool       | Contribution                                                                                                                                                            |
| ------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 4**  | SkillOpt   | Offline optimization of evaluator prompts — improve accuracy of contradiction/clarity checks without runtime overhead. Gated on building a labeled eval test set first (the Phase 4 "evaluator quality ratchet"). |
| **Phase 3**  | LEANN      | Graph-based vector index as the engine for the claim-ledger embedding prefilter. Keeps contradiction checks bounded as documents grow. Local-first, MCP-native. (Shipped as a lexical prefilter.)         |
| **Phase 5**  | markitdown | Binary-format → Markdown converter (DOCX, PDF) for the "import existing PRD" feature; rides with egress. Constraint: must run without a required server (local-first invariant).           |

---

## Todo

### Phase 4 — SkillOpt (evaluator quality ratchet)

- [ ] Build a **labeled eval test set**: 20–40 documents where the ground truth is known (which contradictions/clarity issues the evaluator should catch, on which spans). Store as `src/services/eval-fixtures/`.
- [ ] Wire fixtures into Vitest as a regression suite — independently valuable as a quality ratchet regardless of SkillOpt.
- [ ] Once the fixture set exists: run SkillOpt against the evaluator prompts (see [§SkillOpt](#skillopt--offline-evaluator-prompt-optimization) for the workflow). Target: contradiction-check and clarity-check prompts in `src/services/evaluator.ts`.
- [ ] Deploy the `best_skill.md` output by replacing the relevant prompt strings in `src/services/evaluator.ts` and recording before/after accuracy numbers.

### Phase 3 — LEANN

- [x] Read LEANN's selective-recomputation architecture before designing. _(Done 2026-06-02.)_
- [x] Evaluate LEANN as the backend.
- [x] **Decision point logged in `docs/plan.md` (2026-06-02):** LEANN requires Python on the user's machine; ONNX in-browser adds significant bundle weight. Shipped a lexical prefilter (Jaccard token-overlap, top-10) instead — sufficient for <50 claims, zero external deps. → `src/services/prefilter.ts`. Revisit LEANN if claim density makes misses observable in practice.

### Phase 5 — markitdown

- [x] At the start of the import-feature milestone: evaluate the three paths (optional local helper / WASM port / Markdown-only deferral) against the local-first invariant. See [§markitdown](#markitdown--document-import).
- [x] **Decision point (2026-06-03):** Chose "Markdown-only (deferred)" path. To maintain the strict local-first invariant without imposing a Python requirement on users, Phase 4 import supports `.md` and `.txt` files directly in the browser, alongside Semantic Paste for rich text. Binary format (DOCX/PDF) support via markitdown is deferred.

---

## SkillOpt — Offline Evaluator Prompt Optimization

**What it is.** Microsoft Research's offline prompt optimizer ([github.com/microsoft/SkillOpt](https://github.com/microsoft/SkillOpt), arXiv 2605.23904). Treats a prompt document as the trainable parameter of a frozen LLM. Runs optimization epochs: an optimizer model proposes bounded text edits, scores them against a held-out validation set, and accepts only changes that strictly improve accuracy. Output: a compact `best_skill.md` (300–2k tokens) with zero inference-time overhead — it's just a better prompt.

**Why it matters here.** Sidecar's value is entirely downstream of whether the evaluator catches real problems the user wrote. The prompts in `src/services/evaluator.ts` are the product's core. SkillOpt is the only tool in this document with a built-in answer to "is it working better?" — it reports validation accuracy on your own test set, before and after.

Benchmark results from the paper (across 6 benchmarks, 7 models): +19–25 point average accuracy improvement. Optimized prompts transfer across model scales, so a prompt optimized on Gemini Flash stays good when upgrading to a stronger model.

**The hard gate.** You need a scoring function — "did the eval fire the right observation on the right span?" — backed by labeled documents. Building the test set is the prerequisite. Do that first; SkillOpt is the second step.

**Setup and workflow.**

```bash
# Clone and install (Python 3.11+, uv)
git clone https://github.com/microsoft/SkillOpt
cd SkillOpt && uv sync

# Prepare data splits
# data/contradiction/train/items.json
# data/contradiction/val/items.json
# data/contradiction/test/items.json
# Each item: { "document": "...", "expected_observations": [...] }

# Run one optimization pass
python scripts/train.py \
  --config configs/your_task.yaml \
  --split_dir data/contradiction/ \
  --optimizer_model gemini-2.0-flash \
  --target_model gemini-2.0-flash \
  --num_epochs 4
```

Output lands in `--out_root` as `best_skill.md`. Copy the improved prompt text into the relevant section of `src/services/evaluator.ts`. Record the val-set accuracy delta as a comment.

**When to re-run.** Not continuous — run a pass when adding a new check type (Phase 2 taxonomy expansion), when upgrading the model (Phase 3), or when observed false-positive/negative rates feel high.

---

## LEANN — Claim Ledger Embedding Prefilter

**What it is.** Graph-based vector database with 97% storage reduction vs. traditional vector DBs ([github.com/StarTrail-org/LEANN](https://github.com/StarTrail-org/LEANN), MLsys2026). Rather than storing all embeddings, it stores a graph and recomputes embeddings for candidate nodes at query time. MCP-native, local-first, no cloud dependency.

**Why it matters here.** Phase 3 requires: _"Embedding-based prefiltering for the claim ledger so contradiction checks stay bounded as documents grow."_ As a document grows, sending all ledger claims to the contradiction prompt blows up context and cost. The prefilter semantic-searches the ledger and passes only the top-K candidate claims. LEANN is the reference architecture for this exact constraint: large corpus, bounded memory/disk, no egress. Read its selective-recomputation approach before designing an alternative.

**Architectural decision tree.**

| Path                           | How                                                                                    | Trade-off                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **LEANN via local MCP server** | `pip install leann-core`; run as a local process; call from the TS app via MCP tool    | Requires Python on user's machine; cleanest separation       |
| **Custom in-browser index**    | ONNX Runtime Web + a small embedding model (e.g., all-MiniLM-L6-v2)                    | No external dep; more code; fidelity depends on model choice |
| **Deferred**                   | Phase 3 ships with a simpler heuristic prefilter; embedding prefilter moves to Phase 4 | Safe if ledger stays small in practice                       |

Log the decision in `docs/plan.md` when the milestone starts.

**Setup (if LEANN path is chosen).**

```bash
pip install leann-core
leann create claim_ledger_index
```

Integration sketch — on each claim upsert:

```bash
leann add claim_ledger_index --text "<claim text>" --id "<blockId:claimId>"
```

At contradiction-check time, semantic-search and pass only top-K to the prompt:

```bash
leann search claim_ledger_index "<new claim text>" --top-k 5
```

---

## markitdown — Document Import

**What it is.** Microsoft's file-to-Markdown converter ([github.com/microsoft/markitdown](https://github.com/microsoft/markitdown)). Handles DOCX, PDF, PPTX, XLSX, HTML, images (via vision captioning), and more. Single Python function call, returns clean Markdown optimized for LLM consumption.

**Why it matters here.** Phase 4 adds "Import / lossless round-trip of existing Markdown drafts." But the primary persona — PMs — don't draft in Markdown. Their existing PRDs live in Word, Google Docs exports, Confluence HTML, and email PDFs. markitdown closes the gap between "where the draft lives" and "where Sidecar can read it." Without it, "import" means Markdown-only, which serves developers but not the target persona.

**Hard constraint.** Local-first invariant (#5 in `CLAUDE.md`) prohibits a required server. markitdown is a Python library — three compliant paths:

| Path                         | How                                                                             | Trade-off                                                 |
| ---------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Optional local helper**    | User installs `pip install markitdown`; app spawns it as a subprocess on demand | Requires Python; acceptable for power users who self-host |
| **WASM port**                | markitdown's core parsers compiled to WASM and bundled with the app             | No Python dep; hard to build; fidelity may differ         |
| **Markdown-only (deferred)** | Phase 4 ships Markdown-only import; binary format support deferred              | Safe default if neither path is feasible in Phase 4       |

Log the chosen path in `docs/plan.md` at Phase 4 start.

**Setup (optional local helper path).**

```python
from markitdown import MarkItDown

md = MarkItDown()
result = md.convert("existing_prd.docx")
# result.text_content → clean Markdown → pipe into TipTap import
```

The conversion output is clean enough to feed directly into the TipTap schema loader — no further LLM post-processing needed for structure, only for block-id assignment.
