# Phase 4 Acceptance Test: Import & Semantic Paste

## Setup
1. Run `npm run dev` and open the app in a browser.
2. Have a plain text editor with Markdown ready, and a rich text editor (e.g., Google Docs) ready.

## Scenario 1: Markdown Semantic Paste
1. Copy the following Markdown text:
   ```markdown
   ### Background
   This is the background section.
   ### Plan
   This is the plan section.
   ```
2. Paste it into the TipTap editor.
3. Open the dev console and run `await window.__sidecar__.getState()`.
4. **Assert:** The blocks array contains 4 distinct blocks: two headings and two paragraphs. It should NOT be a single large paragraph block.

## Scenario 2: Rich Text Faux-Heading Paste
1. In a rich text editor (or Word/Docs), create a paragraph that contains ONLY bold text, e.g., **Executive Summary**.
2. Below it, add regular unbolded text.
3. Copy both lines and paste them into the editor.
4. **Assert:** The bold text is converted into a semantic heading (`<h3>`) and the text below remains a paragraph. (Verify visually or via `getState()`).

## Scenario 3: File Import
1. Create a `test.md` file locally containing:
   ```markdown
   # Title
   Imported text body.
   ```
2. Click the "Import Document" button in the sidecar header.
3. Select `test.md`.
4. **Assert:** The editor clears its old content and replaces it with the contents of `test.md`. The `# Title` should render as a top-level heading.
