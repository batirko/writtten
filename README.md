# writtten

You write every word. The AI never touches your prose. It reads alongside you and points out what you might have missed.

Most AI writing tools generate text for you to edit. writtten does the opposite. You do all the writing, and a live feed of observations runs beside your document, flagging contradictions, unclear passages, unsupported claims, and missing topics as you revise. It never rewrites your sentences. There is no "Apply suggestion" button, and there never will be.

> _"This section contradicts the success metric you set in §2."_ → so you go back and fix it yourself.

<!-- TODO(launch): replace with a 30–60s GIF of the loop — write → observation appears → hover to highlight the span → contradiction peek. This is the hero asset. -->

## Why

It has become very easy to hand your thinking to an AI: you ask, it writes, you accept. In knowledge work, where the thinking is the actual job and the document is just what it leaves behind, that habit quietly erodes the judgment that makes you good at it.

writtten keeps you in the writing seat and puts the AI in the critic's seat.

- **Provoke, don't prescribe.** The AI shows you observations, never fixes. The moment it hands you the fix, you are back to offloading the thinking.
- **Quiet while you draft, vocal while you revise.** It stays silent on half-formed sentences and rough first paragraphs. It speaks up once the text settles, which is when scrutiny helps instead of interrupts.
- **A fixed set of checks.** Observations come from a defined list: contradictions, unclear meaning, unsupported claims, undefined jargon, missing topics, structure and flow, strategic tensions. No open-ended chatter.

The first audience is product managers and adjacent roles writing PRDs, specs, decision docs, and stakeholder updates. Those documents succeed or fail on clarity, internal consistency, and completeness, which is exactly what an observer can check without writing the prose.

## Try it

Open **[writtten.com](https://writtten.com)** in a browser. No signup and no key required to see it work.

To run it locally:

```bash
git clone https://github.com/batirko/writtten.git
cd writtten
npm install
cp .env.local.example .env.local   # optional: add a free Gemini key for live evaluation
npm run dev                          # http://localhost:5173
```

You can explore the interface with no configuration at all. For live observations, add a free [Google AI Studio](https://aistudio.google.com/app/apikey) key to `.env.local`, or paste one into the app under **Settings** (the gear icon, bottom right).

## Bring your own key

writtten works with three providers. Each is called directly from your browser using your own key, so your document never passes through a writtten server. Pick a provider in Settings, paste a key, and click **Ping model** to confirm it works. The ping decodes the result into plain language ("invalid key", "billing not enabled", "network / CORS"). Paid providers let you choose the model per tier, and the "what's running" card always shows what is actually in use.

| Provider  | Get a key | Free tier | Key format |
| --------- | --------- | --------- | ---------- |
| Gemini    | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) | Yes | `AIza…` |
| OpenAI    | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | No, paid account | `sk-…` |
| Anthropic | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) | No, paid account | `sk-ant-…` |

Gemini is the zero-config starting point, since it is the only one with a free tier. It also takes an optional second, billed key. The free key runs the frequent lightweight checks on Google's daily budget, while the paid key unlocks the stronger adjudicator (`gemini-2.5-pro`) and keeps you working after the free budget runs out for the day. One key is fine; the second is a cost and resilience convenience.

Keys are stored only in your browser's `localStorage` (in plaintext, the honest trade-off for a local-first BYO-key tool) and are sent only to the provider you picked. Anthropic is reached with the `anthropic-dangerous-direct-browser-access` header, the same trust posture as any browser-stored key.

Evaluation itself is not local. When a block of text settles, that text and the claims extracted from it are sent to your provider to produce observations. See [`docs/architecture.md` § Privacy](docs/architecture.md).

## How it works

writtten is a local-first PWA. There are no accounts and no required backend, and your document and its analysis stay on your machine in IndexedDB.

- **A rich-text editor** (TipTap / ProseMirror), chosen for its decoration and position-mapping, so observations anchor to spans and follow them through edits.
- **Incremental, debounced evaluation.** It never scans the whole document on every keystroke. Text settles, then a section is evaluated.
- **A claim ledger.** Cross-document checks like contradiction and missing-topic run against a distilled ledger of claims rather than a re-read of the whole document.
- **A model router** behind a single interface. Cheap, fast models on the free tier; your own key for stronger ones. This is a deliberate extension point.

More detail is in [`docs/architecture.md`](docs/architecture.md), and the philosophy and persona in [`docs/concept.md`](docs/concept.md).

## Status

This is an early, actively developed side project, open-sourced because the idea deserves scrutiny and collaborators.

- The core loop works: write, watch observations settle in a calm, priority-ranked feed, hover to locate the span, and see both sides of a contradiction highlight.
- The model router is Gemini-shaped today. Adapters for OpenAI and local models (Ollama) are open and welcome contributions.
- Field validation is early. The central bet, that PMs want an observer rather than a rewriter, is still being tested with real users. Signal-quality reports are especially useful.
- Privacy is honest, not absolute. Your document and analysis stay local, but on the free tier each settled block of text is sent to Google's Gemini API for evaluation. See [`SECURITY.md`](SECURITY.md). A local-model adapter is the fix for true no-egress and a top contribution target.

The roadmap and current phase are in [`docs/plan.md`](docs/plan.md).

## Contributing

Contributions are welcome; this project wants collaborators. Start with [`CONTRIBUTING.md`](CONTRIBUTING.md).

There are three deliberate extension points, in rough order of impact:

1. **Model providers.** Add a non-Gemini adapter behind the router. This is the natural first big PR.
2. **Observation types.** The taxonomy is fixed by design, but extending it within the philosophy is a real design conversation.
3. **Export formats.** Pluggable output.

One rule matters above all: never add anything that makes the AI write or edit the user's text (apply, auto-fix, rewrite). That is not a style preference, it is the reason the product exists. [`CONTRIBUTING.md`](CONTRIBUTING.md) covers the guardrails.

## License

[Apache-2.0](LICENSE).
