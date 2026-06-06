import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'writtten',
        short_name: 'writtten',
        description: 'An un-AI-slop editor',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
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
