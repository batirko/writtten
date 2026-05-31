/**
 * Completeness contract for docs/projects/ and the Projects Index in plan.md.
 *
 * Enforces the conventions in CLAUDE.md → "docs/projects/ conventions":
 *   - Project filenames are status-free (no legacy `--idea/--in-progress/--done` suffix).
 *   - Every file in docs/projects/ has frontmatter with a valid `status`.
 *   - Every index row names its project as a clickable markdown link to the file.
 *   - Every file appears as exactly one row in the plan.md Projects Index.
 *   - The status shown in the index matches the file's frontmatter (no drift).
 *
 * If this fails, fix the docs — not the test. Status lives in frontmatter
 * (canonical) and is mirrored in the index table; the filename never carries it.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const docsDir = dirname(fileURLToPath(import.meta.url));
const projectsDir = join(docsDir, "projects");
const planPath = join(docsDir, "plan.md");

const VALID_STATUSES = ["idea", "in-progress", "done"] as const;

/** Pull the `status` field out of a project file's YAML frontmatter. */
function frontmatterStatus(md: string): string | null {
  const fm = md.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return null;
  const line = fm[1].split("\n").find((l) => l.trim().startsWith("status:"));
  return line ? line.split(":")[1].trim() : null;
}

interface IndexRow {
  nameCell: string; // raw text of the first ("Project") cell
  status: string; // text of the second ("Status") cell
  file: string | null; // link target filename, if the name cell is a markdown link
}

/** Parse every data row of the "Projects index" table. */
function parseIndex(plan: string): IndexRow[] {
  const section = plan.match(/##\s+Projects index([\s\S]*?)(?:\n---|\n## )/);
  if (!section) throw new Error("No '## Projects index' section found in plan.md");

  const rows: IndexRow[] = [];
  for (const line of section[1].split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue; // not a table line
    const cells = trimmed.slice(1, -1).split("|").map((c) => c.trim());
    const [nameCell, status] = cells;
    if (!nameCell || nameCell.startsWith("---")) continue; // separator
    if (nameCell === "Project") continue; // header
    const link = nameCell.match(/^\[[^\]]+\]\(projects\/([^)]+)\)$/);
    rows.push({ nameCell, status, file: link ? link[1] : null });
  }
  return rows;
}

const projectFiles = readdirSync(projectsDir).filter((f) => f.endsWith(".md"));
const indexRows = parseIndex(readFileSync(planPath, "utf8"));

/** filename → status, for the rows whose name cell is a proper link. */
const linkedByFile = new Map(
  indexRows.filter((r) => r.file).map((r) => [r.file!, r.status]),
);

describe("docs/projects/ ↔ plan.md Projects Index", () => {
  it("has at least one project file and a populated index", () => {
    expect(projectFiles.length).toBeGreaterThan(0);
    expect(indexRows.length).toBeGreaterThan(0);
  });

  it.each(projectFiles)("%s has no status suffix in its filename", (file) => {
    expect(file).not.toMatch(/--(idea|in-progress|done)\.md$/);
  });

  it.each(projectFiles)("%s has valid frontmatter status", (file) => {
    const status = frontmatterStatus(readFileSync(join(projectsDir, file), "utf8"));
    expect(VALID_STATUSES, `${file}: status "${status}"`).toContain(status);
  });

  // The names must always be clickable links to the file — not bare text.
  it("every index row names its project as a markdown link", () => {
    const bareRows = indexRows.filter((r) => !r.file).map((r) => r.nameCell);
    expect(
      bareRows,
      `These Projects Index rows must be markdown links like [name](projects/name.md): ${bareRows.join(", ")}`,
    ).toEqual([]);
  });

  it("index lists exactly the files in docs/projects/ (no missing, no stale)", () => {
    expect([...linkedByFile.keys()].sort()).toEqual([...projectFiles].sort());
  });

  it.each(projectFiles)("%s index status matches its frontmatter", (file) => {
    const fmStatus = frontmatterStatus(readFileSync(join(projectsDir, file), "utf8"));
    expect(linkedByFile.get(file)).toBe(fmStatus);
  });
});
