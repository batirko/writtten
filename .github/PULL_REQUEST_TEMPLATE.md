<!-- Thanks for contributing! Keep PRs focused: one change per PR. -->

## What & why

<!-- What does this change, and what problem does it solve? Link any related issue. -->

## Checklist

- [ ] **No fix-application affordances added** — this does not make the AI write, rewrite, auto-fix, or "apply" changes to the user's prose. _(Invariant #1 — the product's reason to exist.)_
- [ ] Stays within the **fixed observation taxonomy** (or a taxonomy change was discussed in an issue first). _(Invariant #2)_
- [ ] No per-keystroke full-document scans; cross-doc checks go through the claim ledger. _(Invariant #3)_
- [ ] No new required server, telemetry, or data egress without an explicit logged decision. _(Invariant #5)_
- [ ] `npm test`, `npm run lint`, and `npm run build` all pass locally.
- [ ] Updated the relevant `docs/mechanics/` file if this changes a documented mechanic.
