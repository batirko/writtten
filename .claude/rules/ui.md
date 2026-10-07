---
paths:
  - "src/**/*.tsx"
  - "src/**/*.css"
  - "public/**"
---

# UI changes

- **For a new component, screen, panel, or substantive layout change, use the vendored Hallmark skill before building.** Pure logic changes and single-property CSS fixes don't need it.
- **Check every new or changed surface at 375px before shipping.** The product is desktop-first (the `MobileNote` strip says so), but it mustn't break on a phone. Check for no horizontal overflow, controls that reflow, and touch reachability.
- **Give every hover-gated reveal a touch equivalent.** A phone has no hover and no `⌘` shortcuts. The feed handle and the control-center anchor are tap-to-open on touch for this reason. A `<div tabindex>` isn't reliably focusable by tap on iOS, so don't hang a load-bearing control on focus alone.
- The app's mobile layout is the `@media (max-width: 720px)` blocks in `src/styles.css`. Hallmark's `references/responsive.md` holds the general rules.
