import { describe, it, expect } from "vitest";
import {
  classifyDocumentClass,
  isRelaxedClass,
  sectionCalibrationBlock,
  docCalibrationBlock,
  CLASS_LABELS,
  type DocumentClass,
} from "./documentClass";

describe("classifyDocumentClass", () => {
  it("defaults to unknown for empty/absent stage", () => {
    expect(classifyDocumentClass(undefined)).toBe("unknown");
    expect(classifyDocumentClass(null)).toBe("unknown");
    expect(classifyDocumentClass("")).toBe("unknown");
    expect(classifyDocumentClass("some vague thing")).toBe("unknown");
  });

  it("classifies PRD/spec stages as prd_spec", () => {
    expect(classifyDocumentClass("Product Requirements Document — Fraud Protection")).toBe("prd_spec");
    expect(classifyDocumentClass("a technical spec for the API")).toBe("prd_spec");
    expect(classifyDocumentClass("PRD")).toBe("prd_spec");
    expect(classifyDocumentClass("design doc")).toBe("prd_spec");
  });

  it("classifies reflective writing as essay_personal", () => {
    expect(classifyDocumentClass("A personal essay reflecting on writing habits")).toBe("essay_personal");
    expect(classifyDocumentClass("an opinion piece")).toBe("essay_personal");
    expect(classifyDocumentClass("my journal entry")).toBe("essay_personal");
  });

  it("classifies announcements/comms as comms_announcement", () => {
    expect(classifyDocumentClass("a public communication about a product")).toBe("comms_announcement");
    expect(classifyDocumentClass("launch announcement blog post")).toBe("comms_announcement");
    expect(classifyDocumentClass("company newsletter")).toBe("comms_announcement");
  });

  it("classifies memos/emails as memo_email", () => {
    expect(classifyDocumentClass("a memo to the team")).toBe("memo_email");
    expect(classifyDocumentClass("status update email")).toBe("memo_email");
  });

  it("prd_spec wins over lower-formality keywords (a PRD for a launch blog is a PRD)", () => {
    expect(classifyDocumentClass("PRD for the launch announcement")).toBe("prd_spec");
    expect(classifyDocumentClass("spec: personal finance essay generator")).toBe("prd_spec");
  });
});

describe("isRelaxedClass", () => {
  it("relaxes only the three non-PRD work genres", () => {
    expect(isRelaxedClass("comms_announcement")).toBe(true);
    expect(isRelaxedClass("memo_email")).toBe(true);
    expect(isRelaxedClass("essay_personal")).toBe(true);
    expect(isRelaxedClass("prd_spec")).toBe(false);
    expect(isRelaxedClass("unknown")).toBe(false);
  });
});

describe("calibration blocks", () => {
  const relaxed: DocumentClass[] = ["comms_announcement", "memo_email", "essay_personal"];
  const strict: DocumentClass[] = ["prd_spec", "unknown"];

  it("emits a section block only for relaxed classes (hash-stable otherwise)", () => {
    for (const c of relaxed) {
      const b = sectionCalibrationBlock(c);
      expect(b).toContain("unsupported_claim");
      expect(b).toContain(CLASS_LABELS[c]);
    }
    for (const c of strict) expect(sectionCalibrationBlock(c)).toBe("");
  });

  it("emits a doc block only for relaxed classes (hash-stable otherwise)", () => {
    for (const c of relaxed) {
      const b = docCalibrationBlock(c);
      expect(b).toContain("missing_topic");
      expect(b).toContain(CLASS_LABELS[c]);
    }
    for (const c of strict) expect(docCalibrationBlock(c)).toBe("");
  });

  it("conservative dial: section block never relaxes contradiction/clarity/jargon", () => {
    const b = sectionCalibrationBlock("essay_personal");
    expect(b).toContain("Contradiction, clarity, and undefined-jargon checks are unchanged");
  });
});
