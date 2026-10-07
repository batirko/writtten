---
paths:
  - "docs/plan.md"
  - "docs/projects/**"
  - "docs/logs/**"
---

# Plan and project-doc contract

Two tests enforce these rules: `docs/plan.annotations.test.ts` and `docs/projects.index.test.ts`. When either fails, fix the docs, not the test.

## `docs/plan.md`

- **After any edit to `docs/plan.md`, run the full `npm test`, not one test file.** The annotations test generates one case per open milestone it finds, so a scoped run passes locally and CI goes red.
- **Every open milestone carries a routing annotation:** `— <readiness> <complexity> · <agent>`, defined in the Routing legend at the top of the file. Open items in a "Phase N" section also need `· Lane: <name>` from the live lane legend. When you add a lane, add it to `LANE_NAMES` in the test in the same change.
- **Re-assess the annotation whenever you work on an item.** Readiness moves most often. Drop the annotation when the item goes `[x]`.
- **The test reads any top-level `- ` bullet inside a phase section as a milestone.** Put prose lists in a blockquote (`>` lines are exempt) or nest them.
- **Write milestones in the default entry style.** _Milestone anatomy_ at the top of `docs/plan.md` defines it: a milestone is a living record of a decision, not a one-line to-do. Keep the record inline when it goes `[x]`. A trivial mechanical fix can stay terse.

## `docs/projects/`

- **Filenames name what the project is, never its status.** Status lives in the frontmatter `status:` field (`idea`, `in-progress`, or `done`) and is mirrored in the Projects Index in `docs/plan.md`.
- **Frontmatter is required:** `status`, `kind` (`spec`, `quality`, `infra`, or `research`), `phases` (array of plan-phase numbers), and a one-line `summary`.
- **Body sections, in order:** `## Status` (human-readable phase scope, no conflicting badge), `## Phased Plan`, `## Todo` (checklist per phase), then the detailed design.
- **Every project file needs exactly one row in the Projects Index**, under the `### ` sub-header that matches its `kind`. When the work maps to specific milestones, also add a `→ see docs/projects/…` note on those milestone lines. Don't add blanket links.
- **Index names must stay inline links**, `[name](projects/name.md)`. The test rejects bare text. An HTML-round-tripping WYSIWYG editor once flattened them; `git checkout -- docs/plan.md` restores them.

## `docs/logs/`

The living logs (`prompt_quality_observations.md`, `ux_quality_observations.md`) are append-only and never reach `done`. They aren't projects, so they stay out of the Projects Index. `docs/projects/quality_remediation_synthesis.md` is the analysis layer over both.
