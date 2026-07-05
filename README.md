# writtten

**You write every word. The AI never touches your prose — it just notices what you might have missed.**

Most AI writing tools produce text and let you edit it. `writtten` inverts that: **you do all the writing**, and a live feed of AI observations rides alongside — flagging contradictions, unclear passages, unsupported claims, and missing topics as your document settles. It never rewrites your sentences. There is no "Apply suggestion" button, and there never will be.

It's the ambient presence of Grammarly with the understanding of a chatbot — minus the part where either one writes for you.

> _"This section contradicts the success metric you set in §2."_ → you go and think.
> Not _"here's the corrected sentence."_ → that would be us doing the thinking.

<!-- TODO(launch): replace with a 30–60s GIF of the loop — write → observation appears → hover to highlight the span → contradiction peek. This is the hero asset. -->

---

## Why this exists

Powerful AI has made it frictionless to offload thinking: you ask, it produces, you accept. Over time that erodes the judgment and ownership that _are_ the job in knowledge work — where thinking is the work and the document is just its residue.

So `writtten` keeps you in the generative seat and puts the AI in the critic's seat:

- **Provoke, don't prescribe.** The AI surfaces _observations_, never _fixes_. This single line is the whole product — the moment we hand over the fix, we're back to offloading the thinking.
- **Quiet while generating, opinionated while revising.** It stays silent during idea formation (half-formed sentences, a single rough paragraph) and warms up only as content settles — because that's when scrutiny sharpens thinking instead of replacing it.
- **A fixed, honest taxonomy.** Observations come from a defined, typed list — contradictions, clarity, unsupported claims, undefined jargon, missing topics, structure/flow, strategic tensions — never free-form chatter.

The first persona is **Product Managers** (and adjacent roles) writing PRDs, specs, decision docs, and stakeholder comms — documents that live or die on clarity, internal consistency, and completeness, exactly the properties an observer can check without writing the prose.

## Try it

**In your browser:** _[live demo — coming at launch]_ — no signup, no key required to see it work.

**Locally:**

```bash
git clone https://github.com/<owner>/writtten.git
cd writtten
npm install
cp .env.local.example .env.local   # optional — add a free Gemini key for live evaluation
npm run dev                          # → http://localhost:5173
```

You can explore the interface with **zero configuration**. To get live AI observations, drop a free [Google AI Studio](https://aistudio.google.com/app/apikey) key into `.env.local`, or paste your own key in the app (bring-your-own-key uses stronger models).

## How it works

`writtten` is a **local-first PWA** — no accounts, no required backend, your document and its analysis stay on your machine (IndexedDB).

- **A rich-text editor** (TipTap / ProseMirror) chosen for decoration + position-mapping, so observations anchor to spans and track them through edits.
- **Incremental, debounced evaluation** — never a per-keystroke full-document scan. Content settles, then a section is evaluated.
- **A claim ledger** — cross-document checks (contradiction, missing-topic) run against a distilled ledger of claims, not a re-read of the whole doc.
- **A model router** behind a single interface — cheap/fast models on the free tier, your own key for stronger models. This is a deliberate extension seam.

Deeper detail lives in [`docs/architecture.md`](docs/architecture.md); the philosophy and persona in [`docs/concept.md`](docs/concept.md).

## Status & honesty

This is an early, actively-developed pet project, open-sourced because the idea deserves scrutiny and collaborators. What that means concretely:

- ✅ The core loop works: write → observations settle in a calm, priority-ranked feed → hover to locate the span → contradictions highlight both sides.
- 🚧 **The model router is Gemini-shaped today.** Non-Gemini adapters (OpenAI, local/Ollama) are an open, welcomed contribution — see below.
- 🚧 **Field validation is early (n≈0).** The central bet — that PMs want an ambient observer rather than a rewriter — is still being tested with real users. Signal-quality reports are gold.
- ⚠️ **Privacy is honest, not absolute.** Your document and analysis are stored locally, but on the free tier each _settled_ block of text is sent to Google's Gemini API for evaluation. See [`SECURITY.md`](SECURITY.md). A local-model adapter (the fix for true no-egress) is a top contribution target.

The roadmap and current phase live in [`docs/plan.md`](docs/plan.md).

## Contributing

Contributions are genuinely welcome — this project wants collaborators. Start with [`CONTRIBUTING.md`](CONTRIBUTING.md).

The three deliberate extension seams, in rough order of impact:

1. **Model providers** — add a non-Gemini adapter behind the router. The archetypal "big first PR."
2. **Observation types** — the taxonomy is fixed by design, but extending it _within_ the philosophy is a real design conversation.
3. **Export formats** — pluggable egress.

**One rule above all:** never add an affordance that makes the AI write or edit the user's text (apply / auto-fix / rewrite). That's not a style preference — it's the product's reason to exist. `CONTRIBUTING.md` explains the guardrails.

## License

[Apache-2.0](LICENSE).
