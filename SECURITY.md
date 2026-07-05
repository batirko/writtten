# Security Policy

## Reporting a vulnerability

If you find a security issue, please **do not open a public issue**. Instead, use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) ("Report a vulnerability" under the repository's **Security** tab), or contact the maintainer directly.

Please include steps to reproduce and the affected version/commit. We'll acknowledge as promptly as we can — this is a small project, so response times are best-effort.

## Data handling & privacy (read this — it's honest, not absolute)

`writtten` is **local-first**: your document, its claim ledger, block summaries, and observations are stored in your browser (IndexedDB) and never leave your machine _for storage_. There are no accounts, no required backend, and no telemetry.

However, **evaluation is not local**. To generate observations, the text of each _settled_ block of your document is sent to a language-model API:

- **Free / default tier:** text is sent to **Google's Gemini API**. Review Google's [API terms](https://ai.google.dev/terms) for how request data may be handled — under some terms free-tier request data may be used to improve their models. **Do not put text you consider confidential into the free tier.**
- **Bring-your-own-key:** requests go to the provider whose key you supply, under that provider's terms.

A **local-model adapter** (e.g. Ollama) — which would make evaluation truly no-egress — is an open, welcomed contribution. Until it exists, treat the tool as sending settled text to a third-party API.

## API key handling

- Your API key lives in `.env.local` (git-ignored) or in local browser storage. It is never committed and never sent anywhere except as the auth credential to the model provider you chose.
- **Never paste a full API key into an issue, PR, bug report, or debug dump.** The debug log is designed to log the key _tier_ (`<free>` / `<byo>`), not the secret — but double-check any output you share externally.

## Scope

Because there is no server and no shared data, the attack surface is primarily client-side (your browser) and your own API credentials. Reports about dependency vulnerabilities, key-leakage paths, or client-side injection are all in scope.
