import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Allow the destructure-to-omit idiom: `const { a, b, ...rest } = x`
      // intentionally names keys only to strip them from `rest`.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { ignoreRestSiblings: true },
      ],
    },
  },
  {
    // Test files use `any` for DOM/mock casts (editor stubs, ClipboardItem,
    // global URL). tsc still type-checks these files via tsconfig.test.json.
    files: ["**/*.test.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // Invariant: IndexedDB access stays sealed behind src/store/db.ts so the
    // storage backend can be swapped (e.g. SQLite/filesystem for a desktop app)
    // by rewriting one module. See docs/architecture.md → Local-app evolution path.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/store/db.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "idb",
              message:
                "IndexedDB access must stay behind src/store/db.ts (Local-app evolution path invariant). Import a typed function from ../store/db instead.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        {
          name: "indexedDB",
          message:
            "Use the persistence functions in src/store/db.ts instead of the raw indexedDB global (Local-app evolution path invariant).",
        },
        {
          name: "IDBKeyRange",
          message:
            "Use the persistence functions in src/store/db.ts instead of IDBKeyRange (Local-app evolution path invariant).",
        },
      ],
    },
  }
);
