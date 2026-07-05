# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Open-source launch scaffolding: `LICENSE` (Apache-2.0), `README`, `CONTRIBUTING`,
  `SECURITY` (with an honest data-egress disclosure), `CODE_OF_CONDUCT`, and GitHub
  issue/PR templates — including a signal-quality (false-positive/negative) issue path.

## [0.1.0] — first public release

The first open-source release. The core inversion works end to end: you write, and a
calm, priority-ranked feed of AI **observations** rides alongside — it never rewrites
your prose.

### Highlights

- **The write → observe loop.** Incremental, debounced evaluation over semantic
  sections; observations settle in a calm feed as content stabilizes, and stay quiet
  while you're still forming ideas.
- **Contradiction detection (the hero).** A claim ledger powers cross-document checks;
  conflicting claims highlight both sides. Deliberate tradeoffs surface as softer
  `strategic_tension` rather than false contradictions.
- **A fixed, typed observation taxonomy** — clarity, contradiction, strategic tension,
  unsupported claim, undefined jargon, missing topic, structure/flow — never free-form
  chatter, and never an "apply fix" button.
- **Reverse-hover & click-to-locate** between the feed and the document.
- **Local-first PWA.** Document, claim ledger, and observations persist in the browser
  (IndexedDB). No accounts, no required backend, installable and offline-capable.
- **Model router** with a free Gemini tier and bring-your-own-key for stronger models.
- **Document-type calibration** so PRD-grade strictness doesn't fire on essays, memos,
  or comms.

### Known limitations

- The model router is Gemini-shaped; non-Gemini and local adapters are welcomed
  contributions.
- Free-tier evaluation sends settled text to Google's Gemini API (see `SECURITY.md`).
- Field validation with real users is early.

[Unreleased]: https://github.com/batirko/writtten/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/batirko/writtten/releases/tag/v0.1.0
