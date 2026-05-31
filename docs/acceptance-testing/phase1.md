# Phase 1 Acceptance Tests — Execution Guide

> **How to use this file** Claude works through the automated steps using the `chrome-devtools` MCP. Human confirms the steps marked **👁 HUMAN**. After each test, record PASS / FAIL / WEIRD plus the requested evidence.
>
> Before starting: `npm run dev` must be running. The dev server is at `http://localhost:5173`.
>
> **Tooling:** `mcp__chrome-devtools__*` — load schemas via ToolSearch before first use.\
> **Key tools:** `new_page`, `navigate_page`, `take_screenshot`, `take_snapshot`, `type_text`, `click`, `hover`, `wait_for`, `press_key`, `evaluate_script`, `list_console_messages`.

---

## T0 — Pre-flight

**Who:** Claude (fully automated)

**Steps:**

1. Open `http://localhost:5173` in a new page.
2. Take a screenshot.
3. Read console messages — filter for `error`.
4. Read snapshot — find the provider chip text and debug panel state.

**Pass criteria:**

- No red console errors.
- Provider chip shows a model name (e.g. `gemini-3.5-flash`).
- Debug panel is present and shows "No logs yet."
- Editor shows placeholder "Start writing…"

**Report:** Screenshot + any console errors + chip text.

---

## T1 — Quiet while drafting

**Who:** Claude (automated) + **👁 HUMAN** (confirm no visual spinner)

**Steps:**

1. Clear the workspace (click "Clear workspace").
2. Click into the editor.
3. Type a partial sentence with no terminal punctuation, e.g. `"We are planning to"`
4. Wait 4 seconds without typing.
5. Check snapshot for any feed items or debug log entries.

**Pass criteria:**

- Feed stays empty — no observations, no "thinking" indicator.
- Debug log shows **no** trigger or request entry.
- No spinner or indicator on the editor block.

**👁 HUMAN:** Confirm no visual loading state appears on or near the editor block during the pause.

**Report:** Snapshot of feed + debug log after the 4s pause. PASS if both are empty.

---

## T2 — Settle detection (pause trigger)

**Who:** Claude (fully automated)

**Steps:**

1. Continue from T1 (or clear and start fresh).
2. Complete the sentence with terminal punctuation: type `" to ship this feature in Q3."` (ends with `.`).
3. Stop typing. Start a timer.
4. Wait for `settle-pause` to appear in the debug log (use `wait_for`, timeout 15s).
5. Wait for `RESPONSE` to appear (use `wait_for`, timeout 20s).
6. Take screenshot + snapshot of debug log.

**Pass criteria:**

- `trigger=settle-pause` appears within ~3s of stopping.
- A `REQUEST` entry follows immediately, then a `RESPONSE` entry.
- Latency (time between REQUEST and RESPONSE timestamps) is under 15s.
- At least one observation card appears in the feed.

**Report:** Trigger-to-response time in seconds, model name from debug log, observation text(s) that appeared.

---

## T3 — Settle detection (blur trigger + short-block suppression)

**Who:** Claude (automated)

**Steps (blur):**

1. Clear workspace.
2. Press Enter to create a second paragraph, click back into paragraph 1.
3. Type a full sentence in paragraph 1: `"Our fraud detection system needs significant improvement."` — do NOT wait for settle.
4. Immediately click into paragraph 2 (cursor departure).
5. Wait for `settle-blur` in debug log (timeout 10s).

**Steps (short-block suppression):** 6. Clear workspace. 7. Type `"ok."` (3 chars + period — under 10 char threshold). 8. Stop typing and wait 5s. 9. Check debug log — no trigger or request should appear.

**Pass criteria:**

- Blur: `settle-blur` fires when cursor leaves paragraph 1.
- Short-block: **zero** entries in debug log after 5s. No request, no trigger.

**Report:** Snapshot of debug log for both sub-tests.

---

## T4 — Clarity observation

**Who:** Claude (automated text check) + **👁 HUMAN** (hover highlight)

**Steps:**

1. Clear workspace.
2. Type: `"We should improve fraud handling soon."` and wait for RESPONSE (timeout 20s).
3. Take snapshot — find the observation card text.
4. Take screenshot.

**Pass criteria (Claude checks):**

- A `CLARITY` card appears in the feed.
- The message describes what is unclear — it is an _observation_, not a rewrite or instruction (e.g. "X is vague" not "Change X to…").
- No "Apply", "Fix", or "Rewrite" button exists anywhere in the UI.

**👁 HUMAN — hover check:**

- Hover over the CLARITY observation card.
- **Confirm:** a span in the editor highlights.
- **Confirm:** the highlighted span matches the vague part of the sentence.
- Report whether highlight appeared and whether it covered the right words.

**Report:** Exact observation text (paste it). PASS/FAIL on tone (observation vs rewrite). Human hover result.

---

## T5 — Summary + claim ledger / hash short-circuit

**Who:** Claude (fully automated)

**Steps:**

1. Clear workspace.
2. Type: `"This feature will ship in Q3."` and wait for RESPONSE (timeout 20s).
3. Read the RESPONSE debug entry — expand it and extract the JSON payload (use `evaluate_script` to read the debug log data from the DOM or the response text).
4. Now simulate a typo fix: select "ship" and retype "ship" (same word, same hash). Wait 5s.
5. Check debug log — a second REQUEST must NOT appear.

**Pass criteria:**

- RESPONSE JSON contains a `summary` string and a `claims` array with at least one entry.
- After the typo-fix re-settle, **no new REQUEST** fires (hash short-circuit works).

**Report:** Paste the `claims` array from step 3. Confirm whether second request fired or not.

---

## T6 — The contradiction ("the Wow") — exit criteria

**Who:** Claude (automated trigger + log check) + **👁 HUMAN** (hover both spans)

**Steps:**

1. Clear workspace.
2. Press Enter to ensure two paragraphs exist.
3. In paragraph 1, type: `"This will ship in Q3."` Wait for RESPONSE (timeout 20s).
4. Click into paragraph 2.
5. Type: `"We'll launch this in Q2."` Wait for `contradiction` text in feed (timeout 25s).
6. Take screenshot.
7. Check debug log for a `strong`-tier REQUEST entry.
8. Take snapshot — find the contradiction card text.

**Pass criteria (Claude checks):**

- A `CONTRADICTION` card appears in the feed.
- Card text references both sides — the Q3 commitment and the Q2 claim.
- Debug log shows a REQUEST (strong tier, `gemini-3.5-flash` or `gemini-2.5-pro`) after the second block settles.
- No "Apply / Fix / Accept" button exists.

**👁 HUMAN — hover check (critical):**

- Hover over the CONTRADICTION card.
- **Confirm:** TWO spans highlight — one in paragraph 1 (Q3), one in paragraph 2 (Q2).
- **Confirm:** both highlights are in _different_ paragraphs (same paragraph = bug).
- Report exactly what you see.

**Report:** Exact contradiction text. Model used for strong call. Human hover result (two separate spans or not).

---

## T7 — Anchoring through edits

**Who:** **👁 HUMAN only**

**Prerequisite:** A clarity or contradiction highlight is visible from T4 or T6.

**Steps (human):**

1. Place cursor at the very start of the document.
2. Add a new sentence above the highlighted span, e.g. `"Background: this is the payments project."` and press Enter.
3. Do NOT touch the highlighted text.

**Confirm:**

- After the insert, does the highlight on the original span still cover the **same words**?
- Or did it drift to the wrong text / disappear entirely?

**Pass:** highlight tracked correctly to the same words after the paragraph shifted down.\
**Fail:** highlight disappeared, or now covers wrong text.

**Report:** One sentence describing what the highlight did after the insert.

---

## T8 — Auto-close on resolution

**Who:** Claude (fully automated)

**Prerequisite:** Contradiction observation from T6 is active.

**Steps:**

1. Click into paragraph 2 (the Q2 sentence).
2. Select "Q2" and type "Q3" to resolve the contradiction.
3. Wait for the contradiction card to disappear from the feed (use `wait_for` with a timeout of 25s, watching for the card to be absent).
4. Take screenshot.
5. Check: did other feed items stay in their positions (no shuffle)?

**Pass criteria:**

- Contradiction card auto-closes after the edited block settles.
- Feed does not reorder — other cards stay in place.
- No "Apply / Accept" button appeared at any point.

**Report:** Screenshot after auto-close. Confirm feed stability (reordered or not).

---

## T9 — Block-deletion cascade

**Who:** Claude (automated) + **👁 HUMAN** (bonus contradiction cascade)

**Steps:**

1. Clear workspace.
2. Create a paragraph with a clarity observation — type something vague, wait for CLARITY card.
3. Select the entire paragraph text and delete it (press Backspace/Delete until block is gone, or use `key` to select-all then delete).
4. Take snapshot immediately after deletion.
5. Check feed — clarity card should be gone. Check debug log — no new LLM request should have fired.

**Bonus (👁 HUMAN):** If a contradiction was active from T6 (observation referencing two paragraphs), delete one of the two paragraphs and confirm the contradiction card in the _other_ paragraph also auto-closes.

**Pass criteria:**

- Clarity card disappears from feed on paragraph deletion.
- No new REQUEST in debug log (cascade requires no LLM call).
- Bonus: contradiction closes when either side is deleted.

**Report:** Snapshot before/after deletion. Bonus result if tested.

---

## T10 — Stage field persistence

**Who:** Claude (partially automated) + **👁 HUMAN** (reload check)

**Steps:**

1. Clear workspace.
2. Click the settings/configure button (⚙ icon in sidecar header) to open the stage field.
3. Type: `"PRD for payments team"` into the stage field.
4. Type a new settling sentence in the editor: `"The rollout will begin in Q4."` Wait for RESPONSE (timeout 20s).
5. Read the REQUEST payload from the debug log — check if stage text appears in user content.

**Steps (👁 HUMAN — persistence):** 6. Reload the page. 7. Confirm the stage field still shows `"PRD for payments team"`.

**Pass criteria:**

- Stage text appears in the LLM request's user content (Claude confirms from debug log).
- Stage persists after reload (human confirms).

**Report:** Paste the relevant portion of the REQUEST user content showing (or not showing) the stage. Human: stage present after reload?

---

## T11 — Resiliency / debug visibility

**Who:** **👁 HUMAN** (hard to trigger 429 on demand)

**Steps:**

1. Write 5–8 substantial paragraphs quickly, each ending in terminal punctuation, to push volume against the free-tier RPM limit.
2. Watch the provider chip and debug log.

**Confirm:**

- If any call 429s: does a `retry` or `fallback` entry appear in the debug log?
- Does the provider chip update to show a different model?
- Does anything fail _silently_ (feed stops updating, no log entry)?

**Pass:** degradation is always visible (chip + log); nothing fails silently.\
**Fail:** 429 happens but no log entry, or chip stays unchanged, or feed silently stops.

**Note:** If free tier doesn't hit 429 during this test, mark as **SKIP (not triggered)** — not a failure.

**Report:** Whether 429 occurred, and if so, whether it was surfaced correctly.

---

## T12 — Persistence across reload

**Who:** Claude (fully automated)

**Prerequisite:** Text and at least one observation are present in the editor.

**Steps:**

1. Take snapshot — record current editor text and feed observation count.
2. Reload the page (`navigate_page` with type `reload`).
3. Wait 2s for the app to hydrate.
4. Take snapshot + screenshot.
5. Compare: is the text the same? Are the observations still in the feed?

**Pass criteria:**

- Editor text reloads intact (same content as before reload).
- Active observations are present in the feed after reload (not wiped).

**Report:** Snapshot comparison — text present? Observations present?

---

## Summary scorecard

After all tests, fill in this table:

| Test                         | Result   | Notes |
| ---------------------------- | -------- | ----- |
| T0 Pre-flight                |          |       |
| T1 Quiet while drafting      |          |       |
| T2 Settle pause              |          |       |
| T3 Blur + short-block        |          |       |
| T4 Clarity (automated)       |          |       |
| T4 Clarity hover             | 👁 HUMAN |       |
| T5 Claim ledger              |          |       |
| T6 Contradiction (automated) |          |       |
| T6 Contradiction hover       | 👁 HUMAN |       |
| T7 Anchoring                 | 👁 HUMAN |       |
| T8 Auto-close                |          |       |
| T9 Block deletion            |          |       |
| T10 Stage field              |          |       |
| T11 Resiliency               | 👁 HUMAN |       |
| T12 Persistence              |          |       |

**Phase 1 is verified when:** all automated tests pass AND T4-hover, T6-hover, T7, and T11 are confirmed by human.
