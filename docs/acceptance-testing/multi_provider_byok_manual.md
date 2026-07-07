# Multi-provider BYOK — manual testing guide

> A hands-on, human checklist for the multi-provider BYOK surface shipped 2026-07-07
> (`docs/projects/multi_provider_router.md`). Structured so you can do most of it
> with **no keys**, more with a **free Gemini key**, and the rest only with paid
> accounts. Each step says what to do and what you should see.
>
> This is the human half; the automated coverage lives in `src/model/*.test.ts`
> (adapters, registry, rotation, ping/tier decode) and `factory.selection.test.ts`.

## Setup (1 min)

```bash
cd writtten
git checkout main && git pull
npm install          # only if it's been a while
npm run dev          # → open the URL it prints, usually http://localhost:5173
```

To **open Settings**: move your mouse to the small dot in the **bottom-right corner** —
a row of icons appears; click the **gear ⚙**. (On desktop you can also just click the dot.)

---

## Part 1 — Settings tour (no key needed)

- [ ] **Provider switch** — a 3-way control at the top: **Gemini · OpenAI · Anthropic**.
      Clicking each changes the note under it: Gemini *"Free tier available — no card
      needed"*; OpenAI / Anthropic *"Paid API account required"*.
- [ ] **Key field relabels** per provider — label + help + key-shape hint change:
      Gemini `AIza…`, OpenAI `sk-…`, Anthropic `sk-ant-…`. Each has a **"Get a key"**
      link that opens that provider's exact key page.
- [ ] **"What's running" card** — Gemini shows **one** row (`gemini-3.1-flash-lite`,
      the free workhorse); OpenAI / Anthropic show **two** rows (a fast + a strong
      model, each with a one-line job).
- [ ] **Model pickers vs. pool note** — OpenAI / Anthropic show **Fast model** and
      **Strong model** dropdowns (change one; it persists). Gemini shows a read-only
      note: *"Free tier rotates a fixed pool… Picking a single model comes later."*
- [ ] **Cost + trust notes** — paid providers show a cost line; **Anthropic** also
      shows a browser-access trust note.

## Part 2 — "Ping model" verdicts (a fake key is enough)

- [ ] On **Anthropic**, type a nonsense key like `sk-ant-nope123`, click **Ping model**.
      Expected within a couple seconds: a red **"Invalid key."** verdict (plain
      language, not a raw status code). Same idea on OpenAI.

*(This proves the whole path works and the browser can reach the providers.)*

## Part 3 — Gemini tier auto-detect (needs a real Gemini key)

Grab a free key at <https://aistudio.google.com/app/apikey>.

- [ ] **No checkbox** — confirm there's no "This is a capable model (paid tier)"
      checkbox anymore.
- [ ] **Auto-detect on paste** — paste your Gemini key. A line appears: briefly
      *"Detecting your tier…"*, then **"Free key detected."** (or **"Paid key
      detected."** if your Google Cloud project has billing on).
- [ ] **Ping** → *"Key works — free tier"* (or *"paid tier"*).
- [ ] **Paid key → the card updates.** With a **paid** Gemini key, the "What's
      running" card shows **two** rows: `gemini-3.1-flash-lite` (fast) +
      **`gemini-2.5-pro`** (the deeper adjudication), and the "a paid key unlocks…"
      line is gone. With a **free** key it stays one row.

## Part 4 — Live observations

- [ ] **Zero-key demo** — clear the workspace (bottom-right dot → trash 🗑), then on
      the welcome card click **"See it in action."** The example doc loads and
      observation cards appear in the right-hand feed — no key required.
- [ ] **Your own text** (with the Gemini key from Part 3) — paste two paragraphs:
      > We will ship the new dashboard to all customers in Q3.
      >
      > The dashboard launches to everyone in Q2, ahead of the roadmap.

      Wait a few seconds after you stop typing. Expected: an observation flags the
      **Q3 vs Q2 contradiction**; the bottom-right dot shows the active model while
      "working," then goes idle.

## Part 5 — Paid providers (only if you have OpenAI / Anthropic keys)

- [ ] Switch to OpenAI or Anthropic, paste a real key, **Ping** → *"Key works — paid
      tier."*
- [ ] Type the same Q3/Q2 text; observations still appear via that provider.
- [ ] Change the **Strong model** dropdown; confirm it persists after closing /
      reopening Settings.

*(No paid key? Skip — Parts 1–2 already verify the OpenAI/Anthropic UI.)*

## Part 6 — Mobile (touch reachability)

- [ ] Open your browser's dev tools → device toolbar → pick **iPhone / 375px** (or
      narrow the window a lot).
- [ ] A note appears at the top: *"built for focused desktop writing…"* — expected
      (desktop-first).
- [ ] **Tap the dot** bottom-right → the controls (export, **gear**, trash) appear.
- [ ] **Tap the gear** → Settings opens and fits the screen (scrolls; no sideways
      scrolling). Tap outside to close.

---

## Reporting a problem

Tell the maintainer: the **Part/step number**, what you **did**, what you **saw**
vs. expected, which **provider**, and whether the key was **real or fake**. That's
enough to reproduce.

## Known-deferred (not bugs — Phase 7)

- Editing Gemini's free rotation pool / multiple keys for RPD spreading
  (`docs/projects/byok_capability_model.md`).
- Surfacing the BYOK path in the first-run / welcome screen
  (`docs/projects/multi_provider_router.md` §D planned note).
