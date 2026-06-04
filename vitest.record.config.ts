/**
 * Vitest config for the eval:record script only.
 * Runs ONLY src/services/eval-fixtures/record.test.ts with no excludes.
 * Activated via `npm run eval:record`.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/services/eval-fixtures/record.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
