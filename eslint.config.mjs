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
    // lib/services/** and lib/supabase/** are server-side modules.
    // They use helper functions named useSupabase*() that are NOT React hooks
    // — they're simply feature-flag readers. Disable the hook-call rule for
    // all non-component server code so those utilities can be called freely.
    files: ["lib/**", "scripts/**"],
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
  ]),
]);

export default eslintConfig;
