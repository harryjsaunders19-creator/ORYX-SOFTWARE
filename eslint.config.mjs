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
      // lib/ re-export shims were removed — import from @/shared or @/modules.
      // Remaining @/lib/* paths are real modules (constants, types, db, etc.).
      "no-restricted-imports": ["error", {
        paths: [
          { name: "@/lib/auth", message: "Import from @/shared/auth/auth" },
          { name: "@/lib/utils", message: "Import from @/shared/utils" },
          { name: "@/lib/permissions", message: "Import from @/shared/auth/permissions" },
          { name: "@/lib/password", message: "Import from @/shared/auth/password" },
          { name: "@/lib/branding", message: "Import from @/shared/branding/branding" },
          { name: "@/lib/supabase", message: "Import from @/shared/supabase" },
          { name: "@/lib/supabase/admin", message: "Import from @/shared/supabase/admin" },
          { name: "@/lib/supabase/feature-flags", message: "Import from @/shared/supabase/feature-flags" },
          { name: "@/lib/services/job-service", message: "Import from @/modules/jobs" },
          { name: "@/lib/services/client-service", message: "Import from @/modules/clients" },
          { name: "@/lib/services/quote-service", message: "Import from @/modules/quotes" },
          { name: "@/lib/services/user-service", message: "Import from @/modules/users" },
          { name: "@/components/status-badge", message: "Import from @/modules/jobs/components/badges/status-badge" },
          { name: "@/components/type-of-works-badge", message: "Import from @/modules/jobs/components/badges/type-of-works-badge" },
          { name: "@/components/work-item-type-badge", message: "Import from @/modules/jobs/components/badges/work-item-type-badge" },
          { name: "@/components/revision-family-badge", message: "Import from @/modules/jobs/components/badges/revision-family-badge" },
          { name: "@/components/inline-edit-selects", message: "Import from @/modules/jobs/components/inline-edit-selects" },
        ],
        patterns: [
          {
            group: ["@/lib/supabase/mappers/*"],
            message: "Import from the owning @/modules/*/supabase path instead",
            allowTypeImports: false,
          },
          {
            group: [
              "@/lib/supabase/repositories/archive-log",
              "@/lib/supabase/repositories/backup",
              "@/lib/supabase/repositories/billing",
              "@/lib/supabase/repositories/calendar",
              "@/lib/supabase/repositories/client-holds",
              "@/lib/supabase/repositories/clients",
              "@/lib/supabase/repositories/employees",
              "@/lib/supabase/repositories/identity-switch",
              "@/lib/supabase/repositories/jobs",
              "@/lib/supabase/repositories/leave",
              "@/lib/supabase/repositories/password-vault",
              "@/lib/supabase/repositories/quotes",
              "@/lib/supabase/repositories/status-history",
              "@/lib/supabase/repositories/users",
            ],
            message: "Import from the owning @/modules/*/supabase path instead",
            allowTypeImports: false,
          },
        ],
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
