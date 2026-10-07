---
description: Plan the next round of parallel work, define non-colliding lanes, and write their start prompts
argument-hint: "[how many sessions, or a focus area]"
---

Plan the next round of parallel work on this repo and write the prompts that start it.

$ARGUMENTS

You are the orchestrator. You don't do the work — you decide who does what, prove the lanes
can't collide, and hand each session enough context to reason from the code instead of from
your guesses.

Ported from a sibling project (`workspace-index`) built off the same starter. Its version paid
for these rules with a round that went wrong; this version is adapted to writtten's actual files.
Where a rule below is inherited rather than locally earned, it says so.

## 1. Read the state before you split it

- `docs/plan.md` — the "Current phase" marker (line 7), the Routing legend, the live lane
  legend, and every open milestone in the current phase section with its annotation
  (readiness · size · agent · lane). Milestones are one line each and can be very long — grep
  for `^- \[ \]` inside the phase's line range rather than reading the whole file.
- `docs/plan.md` → **Discovered / unscheduled** — untriaged backlog, un-laned by convention.
  Not a round candidate on its own; triage an item into a phase first if you want to route it.
- `docs/plan.md` → **Phase 9** (or whichever phase is marked parked/post-traction) — also not a
  round candidate while it's parked. Don't route work out of a phase CLAUDE.md says not to
  pre-build.
- The most recent files in `docs/snapshots/` — what the last review found.
- `git log`, `git branch -a`, `git worktree list` — what just landed, what's still in flight,
  and any worktree that looks stale (uncommitted changes untouched for weeks, badly diverged
  from `main`). Flag a stale worktree in your report; don't clean it up without asking.
- `ListAgents` — sessions already running in this repo. A live session is a lane you don't own.
  Say so in your report rather than planning over the top of it.

## 2. Count the readiness before you route anything

Readiness decides what kind of round this is, so read it before you draw a single lane. Count it
over the **current phase's open milestones only** — not Phase 9, not Discovered/unscheduled,
not the whole plan.

**If most of them aren't 🟢, the round's job is to make them 🟢.** Route definition work instead
of build work. A lane that settles the open questions in one `docs/projects/` file — writes the
decisions down, points the plan at them, re-annotates the milestone in the same change — is a
finished lane. It isn't a warm-up for the real one.

Hand a 🟠 item to a build session and you don't skip the design work. You just move it somewhere
you can't see. The session decides alone, under build pressure, and the reasoning stays in a
transcript that dies while the code lands. What you get back is a milestone that still isn't
defined and a decision nobody can find.

Definition lanes collide less than build lanes, because each one mostly writes its own project
file. The hub rules in the next section still apply, and `docs/plan.md` is still a hub. The cap
still applies too: three lanes, not five (see § 3).

**One 🟢 lane can still run alongside** a mostly-definition round — take it if it finishes
something a reader can see. Don't stall the product to write documents.

**🟢 doesn't mean parallel-safe by itself.** Two 🟢 items in the same lane still share that
lane's hub files and can't run as separate lanes — they serialize into one. Cross-check the
green pool against § 3 before assuming its size is your lane count.

## 3. Draw lanes that can't collide

A lane is a coherent goal, not a pile of tickets. Prefer one lane that finishes a reader-visible
thing over three that each move a number.

**Three lanes. Not five.** This cap is **inherited, not measured here**: `workspace-index` ran
five lanes on 2026-08-19 and the merge queue grew until verification — the part of orchestrating
that can't be automated — was the first thing dropped. writtten hasn't run this command yet.
Treat three as a starting hypothesis for this project, not an earned number — revise it after
this project's own first round tells you something.

Draw the boundary at the **hub files** — the single-writer bottlenecks. Two lanes that write the
same hub file are not parallel, however different their goals sound. This repo's lanes and hubs
(the six from `docs/plan-archive.md` → _Parallel work lanes_, plus the four post-launch
territories from the live legend at the top of `docs/plan.md`):

| Lane | Hub files |
| --- | --- |
| Editor | `src/editor/Editor.tsx`, `section.ts`, `extensions/` |
| Feed UI | `src/sidecar/SidecarFeed.tsx`, `feedBudget.ts`, `obsAggregation.ts` |
| Prompt/signal | `src/services/evaluatorPrompts.ts`, `evaluator.ts`, `evaluatorAnchoring.ts` |
| Validation | `src/services/evalScorer.ts`, `src/services/eval-fixtures/` |
| Lifecycle | `orchestrator.ts`, `docReconcile.ts`, `priority.ts` |
| Visual (solo) | `src/styles.css` + component markup everywhere — never runs alongside another UI lane |
| Model/router | `src/model/*` |
| Site/docs | `docs/`, site legal pages — no `src/`, parallel-safe with everything |
| Ops | CI workflows, `scripts/`, the release process — no `src/`, but only one Ops change to the release path at a time |
| Platform | app-shell/packaging (Tauri, hosted proxy, monetization) — dormant; re-rate when scheduled |

`evaluator.ts` in particular is worth checking every round: it's shared between Prompt/signal and
Lifecycle by design (`docs/plan-archive.md` § Rules of the road), and it's common for several
open milestones in the same phase to all touch it for unrelated reasons — that's a serialize
signal, not a false alarm.

Shared/low-churn resources that aren't owned by one lane but still need discipline:

| Resource | Rule |
| --- | --- |
| `src/services/types.ts` | Append-only-ish. Several lanes touch it; keep edits minimal. |
| `db.ts` schema version | Only one lane bumps it per round. |
| `docs/plan.md` | Everyone ticks their own milestone line, nobody else's. |
| `docs/logs/prompt_quality_observations.md`, `docs/logs/ux_quality_observations.md` | Append-only. Before assigning a new `OBS-NNN`/`UX-NNN` id, `git fetch origin main` and take the next free id from there, not from local HEAD — two sessions grabbing the same "next" number is a real, silent collision (see CLAUDE.md → _Working alongside parallel sessions_). |
| `docs/plan.annotations.test.ts`, `docs/projects.index.test.ts` | The contract tests. One lane changes a contract at a time, together with the docs it governs. |
| Adding a new `docs/projects/*.md` file | Touches the new file **and** the Projects Index table in `plan.md` in the same change — that table is a shared resource even though the project file itself usually isn't. |
| the dev server on `:5173` and `window.__sidecar__` | Shared and global. Don't assume you own it; `clear()` after seeding fixtures. |

Then check each lane against the others for these, and write the answer down:

- Does it write a file another lane writes?
- Does it change data another lane measures or renders? If yes, that's a **coordination point**,
  not a blocker — name it and say who tells whom.
- Does it need the network (a live-model call, a GitHub API call)?
- Does it need something another lane produces? Say whether the dependent lane waits or stubs.

Park anything that can't be made safe. Explain why it's parked — a parked item is a decision,
not an oversight.

## 4. Write one prompt per lane

Follow `CLAUDE.md` → "Prompts written for other sessions give context, not a design." Hand over
context, not a solution. Each prompt contains:

- **The goal**, in terms of what changes for a reader or for the project's answer.
- **What's already known and decided**, with pointers to the file that holds it. Include the
  constraints that are genuinely fixed — the product principle (provoke, don't prescribe), the
  hard invariants in `CLAUDE.md`, prior decisions in the relevant `docs/projects/*.md`.
- **What the session determines itself.** Say which is which, explicitly.
- **Scope**: in, out, and the priority order inside it. Name what's out of bounds by path.
- **The orchestration picture** — the table of all lanes, who owns what, the shared-resource
  rules above, and the coordination points that involve this lane.
- **The working rules**: own worktree off `origin/main` (never inherit another session's WIP),
  branch off `main`, one feature per PR, `npm test` after any `docs/plan.md` edit, rebase before
  finalizing, next-id from `origin/main` if it touches `docs/logs/`.

## 5. Set up the back-channel

Tell every lane it can reach the others and you directly: `ListAgents` to find names,
`SendMessage({to: "<name>", message: "..."})` to reach one. Give them the rule, not just the
mechanism — message when it changes what someone builds (a shared field's shape, a premise
that just broke, a file outside your lane, a real block), never for status. Name yourself as
the orchestrator and ask each lane for one line on start: its session name and branch.

Say the quiet part: in the ideal case nobody needs this and the work just lands.

## 6. Run the round

Planning is the easy half. These rules are what the source project's overloaded round cost to
learn — writtten hasn't paid for them yet, but the failure modes transfer directly.

- **One open PR per lane.** A stack forces every merge at the bottom to retarget and rebase the
  branches above it, by hand, for both sessions (see CLAUDE.md's stacked-PR trap: merging a base
  PR with `--delete-branch` can close the PR stacked on it). A lane merges before it opens the
  next.
- **A lane resolves its own conflicts.** Routing them through you makes one session the serial
  bottleneck for the whole round and puts its mistakes into other people's branches. If a PR does
  not merge cleanly, it goes back.
- **Verify claims, don't just merge them.** This is the job. Re-run the number against the file,
  check the rule a check actually enforces, drive the browser rather than reading the stylesheet.
  A plausible claim nobody checked is the expensive kind of error.
- **Never `git add -A`.** Stage the paths you meant to change. An untracked file swept into an
  unrelated commit is exactly as costly here as it was on the sibling project that first hit it.

**Before trusting any new check, break it on purpose.** Delete or corrupt the thing it watches
and confirm it goes red, then put it back. A green result carries no information until someone
has seen the red one. Concretely, in this repo: drop a `· Lane:` tag from an open milestone and
confirm `docs/plan.annotations.test.ts` fails; blank a project file's `status:` frontmatter and
confirm `docs/projects.index.test.ts` fails. It costs one clone and one deleted line.

## 7. Report back

Write the prompts to the scratchpad as separate files so they can be pasted straight into new
sessions, and send them. Then, in chat: what each lane will change about the product, why these
lanes and not others, what you parked, and the one or two coordination points that are real.
Lead with the lanes, not with what you read. If the readiness count made this a definition round,
say so first — it's the difference between a round that ships and a round that unblocks.
