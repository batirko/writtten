/**
 * Routing-annotation contract for docs/plan.md.
 *
 * Enforces the "Routing legend" convention at the top of plan.md: every OPEN
 * milestone carries a `— <readiness> … · <agent>` annotation, and COMPLETED
 * (`[x]`) milestones drop it. Drift fails CI instead of relying on goodwill —
 * the same pattern docs/projects.index.test.ts uses for the index contract.
 *
 * What is enforced (the load-bearing, categorical axes):
 *   - readiness marker — one of 🟢 🟡 🟠 🔴
 *   - agent marker     — one of 🧠 ⚙️ 🔧
 *   - lane tag         — `· Lane: <name>` from the known lane set, required on
 *     open milestones inside "Phase N" sections (the live lane legend at the
 *     top of plan.md + the Phase-6 table in plan-archive.md define the names).
 *     Discovered/unscheduled ideas are conventionally un-laned — not required
 *     there. Added 2026-07-10 after the plan re-cut (#172) dropped the lane
 *     axis unnoticed: the axis existed only as prose, so nothing failed.
 * Complexity (Low/Med/High/…) is documented in the legend and kept by humans,
 * but its token form varies too much (`Med`, `Med–High`, `High (design)`,
 * `High-decision/Low-build`, …) to gate mechanically, so it is not asserted.
 *
 * Scope of "milestone":
 *   - every checkbox list item (`- [ ]` / `- [x]`) anywhere in the file, and
 *   - every top-level bullet in any "Phase N" section and in the
 *     "Discovered / unscheduled" section (backlog sections use bullets, not
 *     checkboxes). Generalized 2026-07-10 from the hardcoded "Phase 6" — the
 *     re-cut's Phase 9 bullets had silently escaped the contract.
 * Prose, headings, blockquotes (legend), and "Harness exit criterion" lines
 * with inline `[ ]` markers are out of scope — they are not list items.
 *
 * If this fails, fix plan.md — not the test.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const docsDir = dirname(fileURLToPath(import.meta.url));
const plan = readFileSync(join(docsDir, "plan.md"), "utf8");
const lines = plan.split("\n");

const READINESS = "(?:🟢|🟡|🟠|🔴)";
const AGENT = "(?:🧠|⚙️|🔧)"; // ⚙️ is two code points — match by alternation, not a char class.

/**
 * A well-formed annotation: an em-dash introducing a readiness marker and then,
 * within the same em-dash-delimited segment, an agent marker. The `[^—]*` guards
 * keep both markers inside one trailing `— …` clause, so an em-dash used earlier
 * in the description doesn't produce a false match.
 */
const ANNOTATION = new RegExp(`—[^—]*${READINESS}[^—]*${AGENT}`, "u");
const HAS_READINESS = new RegExp(READINESS, "u");

/**
 * The known lane names: the six Phase-6 territories (table in plan-archive.md)
 * plus the four post-launch territories from the live lane legend. Keep in
 * sync with the "Parallel work lanes (live)" blockquote at the top of plan.md.
 */
const LANE_NAMES = [
  "Editor",
  "Feed UI",
  "Prompt/signal",
  "Validation",
  "Lifecycle",
  "Visual",
  "Model/router",
  "Site/docs",
  "Ops",
  "Platform",
];
const LANE = new RegExp(`· Lane: (${LANE_NAMES.map((n) => n.replace("/", "\\/")).join("|")})\\b`, "u");
const HAS_LANE = /· Lane:/u;

interface Item {
  lineNo: number;
  text: string;
  requireAnnotation: boolean; // open milestone → must carry an annotation
  forbidAnnotation: boolean; // completed milestone → must have dropped it
  requireLane: boolean; // open milestone in a "Phase N" section → must carry a valid lane
}

function collectItems(): Item[] {
  const items: Item[] = [];
  let section = "";

  lines.forEach((line, i) => {
    const lineNo = i + 1;

    const heading = line.match(/^##\s+(.*)/);
    if (heading) {
      section = heading[1].trim();
      return;
    }

    // Lanes are required inside single-phase sections ("Phase 7 — …"), not in
    // the archived recap ("Phases 0–6 — …") or the Discovered ideas backlog.
    const isPhaseSection = /^Phase \d/.test(section);

    const checkbox = line.match(/^\s*-\s*\[([ xX])\]\s/);
    if (checkbox) {
      const done = checkbox[1].toLowerCase() === "x";
      items.push({
        lineNo,
        text: line,
        requireAnnotation: !done,
        forbidAnnotation: done,
        requireLane: !done && isPhaseSection,
      });
      return;
    }

    // Non-checkbox top-level bullets are milestones in the bullet-style
    // backlog sections: any "Phase N" section and Discovered / unscheduled.
    const isBacklog = isPhaseSection || section.startsWith("Discovered");
    if (isBacklog && /^-\s+\S/.test(line)) {
      items.push({
        lineNo,
        text: line,
        requireAnnotation: true,
        forbidAnnotation: false,
        requireLane: isPhaseSection,
      });
    }
  });

  return items;
}

const items = collectItems();
const openItems = items.filter((it) => it.requireAnnotation);
const doneItems = items.filter((it) => it.forbidAnnotation);
const laneItems = items.filter((it) => it.requireLane);

describe("docs/plan.md routing annotations", () => {
  it("finds open milestones to check", () => {
    // Sanity guard that the collector isn't silently returning nothing.
    // We assert only on OPEN items: once closed phases are archived to
    // docs/plan-archive.md (Phases 0–6 as of 2026-07-10), the live plan can
    // legitimately carry *zero* completed (`[x]`) milestones, so requiring
    // doneItems > 0 is no longer a valid invariant. The drop-annotation
    // check below still runs for whatever `[x]` items do remain (if any).
    expect(openItems.length).toBeGreaterThan(0);
  });

  it.each(openItems.map((it) => [it.lineNo, it.text] as const))(
    "open milestone (plan.md:%i) carries a readiness+agent annotation",
    (lineNo, text) => {
      expect(
        ANNOTATION.test(text),
        `plan.md:${lineNo} is an open milestone but has no \`— <readiness> … · <agent>\` annotation:\n  "${text.trim()}"`,
      ).toBe(true);
    },
  );

  it.each(doneItems.map((it) => [it.lineNo, it.text] as const))(
    "completed milestone (plan.md:%i) has dropped its annotation",
    (lineNo, text) => {
      expect(
        HAS_READINESS.test(text) || HAS_LANE.test(text),
        `plan.md:${lineNo} is completed (\`[x]\`) but still carries a routing marker or lane tag — drop the annotation:\n  "${text.trim()}"`,
      ).toBe(false);
    },
  );

  it.each(laneItems.map((it) => [it.lineNo, it.text] as const))(
    "open phase-section milestone (plan.md:%i) carries a known lane tag",
    (lineNo, text) => {
      expect(
        LANE.test(text),
        `plan.md:${lineNo} is an open milestone in a Phase section but has no \`· Lane: <name>\` tag from the known lane set (${LANE_NAMES.join(", ")}):\n  "${text.trim()}"`,
      ).toBe(true);
    },
  );
});
