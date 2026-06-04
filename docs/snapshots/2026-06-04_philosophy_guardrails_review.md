# Philosophy Guardrails (G1 & G2) Review
*Date: 2026-06-04*

## Progress Made
- **Flattery-Resistant Dismissal (G1):** The core invariant that the tool "will not learn to flatter you" is now enforced. Dismissing a `high` severity observation (like a `contradiction`) applies only to that specific span. Dismissing a `low` or `medium` severity observation applies document-wide. This was achieved by adding `kind` and `severity` metadata to `DismissalSuppression` records.
- **Explicit Anti-Taxonomy (G2):** The product principle "Provoke, don't prescribe" is now strictly enforced in the LLM prompt. The `MERGED_SYSTEM_PROMPT` was updated to explicitly ban observations regarding grammar, spelling, punctuation, passive voice, readability, and stylistic nits. A new deterministic test fixture (`anti-taxonomy`) was added to ensure this invariant never regresses.

## Observations & Findings

While implementing the explicit anti-taxonomy constraint (G2), we observed a highly desirable secondary effect on the LLM's overall behavior:

1. **Collateral Quality Improvement:** 
   Adding the negative constraint ("Never flag grammar, spelling, punctuation, passive voice, sentence length, word choice...") significantly reduced false-positive `clarity` flags across our *existing* deterministic test fixtures.
   
2. **Specific Examples:**
   - In `contradiction-timeline`, the LLM previously flagged the word "This" as a clarity issue ("The scope of what constitutes 'this' is not defined"). With the anti-taxonomy constraint, the model correctly ignored this stylistic nit.
   - In `strategic-tension-fraud`, it stopped flagging subjective/redundant phrasing nuances that weren't substantial clarity gaps.
   - The model has developed a much better intuition for the difference between a "substantive ambiguity" (which belongs in the feed) and a "poor word choice" (which is prescriptive and violates the calm feed principle).

3. **Validation of "Calm Feed" Strategy:**
   This confirms that explicit negative boundaries in the system prompt are a highly effective lever for keeping the feed high-signal. By constraining the LLM from acting as a grammar-checker, it was forced to allocate its attention to more structural and factual analysis.

## Next Steps
- The remaining philosophy guardrails (G3: No-disguised-fix register and G4: Discomfort-budget ceiling) are scheduled for Phase 5.
- The `philosophy_guardrails.md` project status is now "in-progress".
