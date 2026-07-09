// Real IndexedDB coverage for saveClaimsForBlock's member-eviction (the
// stale-claim leak fixed when a section's representative id migrates). Uses
// fake-indexeddb so the *actual* db.ts transaction runs — the rest of the suite
// mocks the db module, so this is the only place the real ledger code executes.
import "fake-indexeddb/auto";
// This db.ts unit test inspects raw ledger rows (including `orphaned` ones) that
// no exported loader returns, so it reaches for idb directly (allowed here only).
// eslint-disable-next-line no-restricted-imports
import { openDB } from "idb";
import { describe, it, expect } from "vitest";
import { saveClaimsForBlock, loadActiveClaimsForDocument, type ClaimLedgerEntry } from "./db";

/** Read every claim row for a doc, regardless of status (no exported loader
 *  returns orphaned rows — open the same DB the module wrote to). */
async function allClaims(docId: string): Promise<ClaimLedgerEntry[]> {
  const db = await openDB("writtten", 9);
  const rows = (await db.getAllFromIndex("claim_ledger", "by_doc", docId)) as ClaimLedgerEntry[];
  db.close();
  return rows;
}

const claim = (text: string) => ({ text, kind: "fact_claim" as const });

// The `by_block` index is global (keyed on sourceBlockId, not docId), so give
// every test its own block ids to avoid cross-test coupling via delete/orphan.
describe("saveClaimsForBlock — member eviction (stale-claim leak)", () => {
  it("orphans active claims under a former-representative member on re-eval", async () => {
    const docId = "d-migrate";
    // Two sections evaluated independently: old-rep and new-rep each hold claims.
    await saveClaimsForBlock(docId, "mig-old", [claim("old claim")]);
    await saveClaimsForBlock(docId, "mig-new", [claim("new claim")]);
    expect((await loadActiveClaimsForDocument(docId)).map((c) => c.text).sort()).toEqual([
      "new claim",
      "old claim",
    ]);

    // The representative migrates: the section is now repped by "mig-new" and
    // includes "mig-old" as a plain member. Re-evaluating retires mig-old's claims.
    await saveClaimsForBlock(docId, "mig-new", [claim("new claim v2")], ["mig-new", "mig-old"]);

    const active = await loadActiveClaimsForDocument(docId);
    expect(active.map((c) => c.text)).toEqual(["new claim v2"]);
    expect(active.some((c) => c.sourceBlockId === "mig-old")).toBe(false);
  });

  it("orphans (does not delete) the stale rows — they persist with status orphaned", async () => {
    const docId = "d-orphan-not-delete";
    await saveClaimsForBlock(docId, "ond-old", [claim("stale claim")]);
    await saveClaimsForBlock(docId, "ond-new", [claim("live claim")], ["ond-new", "ond-old"]);

    const rows = await allClaims(docId);
    const stale = rows.filter((c) => c.sourceBlockId === "ond-old");
    expect(stale).toHaveLength(1);
    expect(stale[0].status).toBe("orphaned");
  });

  it("leaves behavior unchanged when memberBlockIds is omitted (single-block replace)", async () => {
    const docId = "d-legacy";
    await saveClaimsForBlock(docId, "leg-old", [claim("still here")]);
    // No memberBlockIds → only "leg-new" is (re)written; "leg-old" is untouched.
    await saveClaimsForBlock(docId, "leg-new", [claim("added")]);

    expect((await loadActiveClaimsForDocument(docId)).map((c) => c.text).sort()).toEqual([
      "added",
      "still here",
    ]);
  });

  it("overwrites the representative's own claims and orphans members in the same write", async () => {
    const docId = "d-both";
    await saveClaimsForBlock(docId, "both-rep", [claim("rep v1")]);
    await saveClaimsForBlock(docId, "both-member", [claim("member stale")]);

    await saveClaimsForBlock(docId, "both-rep", [claim("rep v2")], ["both-rep", "both-member"]);

    const active = await loadActiveClaimsForDocument(docId);
    expect(active.map((c) => c.text)).toEqual(["rep v2"]);
  });
});
