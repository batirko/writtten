import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    exclude: [
      // record.test.ts makes live API calls to populate fixture recordings.
      // It runs only via `npm run eval:record`, never in the default CI suite.
      "**/eval-fixtures/record.test.ts",
      // Standard vitest/vite excludes (keep in sync with vitest defaults):
      "**/node_modules/**",
      "**/dist/**",
    ],
  },
});
