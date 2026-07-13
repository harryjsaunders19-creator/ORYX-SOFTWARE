import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Data-fetch-on-mount via useEffect is intentional across this codebase.
      "react-hooks/set-state-in-effect": "off",
      // Business copy uses apostrophes and quotes naturally in JSX text.
      "react/no-unescaped-entities": "off",
      // Variables/args prefixed with _ are intentionally unused (standard TS convention).
      "@typescript-eslint/no-unused-vars": ["warn", {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_",
        "caughtErrorsIgnorePattern": "^_",
      }],
    },
  },
  {
    // Server-side modules use helper functions named useSupabase*() that are NOT
    // React hooks — they're feature-flag readers. Disable the hook-call rule for
    // service layers and API routes (not React components under modules/**).
    files: [
      "lib/**",
      "scripts/**",
      "app/api/**",
      "modules/**/services/**",
      "modules/**/enrichment.ts",
      "shared/supabase/**",
    ],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local one-off sync/MCP helper scripts (not part of the app build).
    "scripts/mcp-*.mjs",
    "scripts/apply-*.mjs",
    "scripts/emit-*.mjs",
    "scripts/extract-*.mjs",
    "scripts/build-grp-files.mjs",
    "scripts/queue-sync-batches.mjs",
    "scripts/run-mcp-batches.mjs",
    "scripts/next-sync-batch.mjs",
    "scripts/list-mcp-one-batches.mjs",
    "scripts/mark-batch-applied.mjs",
    "scripts/generate-mcp-sync-batches.mjs",
    "scripts/prepare-exec-args.mjs",
    "scripts/print-exec-args.mjs",
    "scripts/read-exec-args.mjs",
    "scripts/run-one-batch-sql.mjs",
    "scripts/_mcp-*.mjs",
  ]),
]);

export default eslintConfig;
