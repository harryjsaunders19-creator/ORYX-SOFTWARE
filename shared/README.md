# Shared

Cross-cutting code used by **two or more modules** or by the application shell. Feature-specific code belongs in `modules/`, not here.

## Rules

1. **No feature business logic** — Shared provides infrastructure, UI primitives, auth, and utilities.
2. **No module imports of shared internals** — Prefer `@/shared/{area}` barrel exports as they are added during Phase 1.
3. **Single-use code stays put** — Do not move code here until a second consumer exists.

## Target layout

```
shared/
  ui/              # Radix primitives (button, dialog, …)
  layouts/         # App shell, page layout, stitch layout
  auth/              # Session, login, password helpers
  permissions/     # Role checks, module registry
  hooks/             # use-api, use-debounced-value, …
  utils/             # Generic helpers
  branding/          # Logos, design tokens
  db/                # Connection, schema bootstrap (until stores split)
  supabase/          # Admin client, config, feature flags (Phase 14)
  providers/         # React context providers
  experimental/      # Feature flags
  types/             # Minimal cross-cutting types (e.g. Role)
```

## Migration status

**Phase 1 complete.** Platform code lives under `shared/`. **Phase 14:** Supabase infrastructure moved to `shared/supabase/`; module repos colocated under `modules/{name}/supabase/`. Legacy imports (`@/lib/supabase/*`, `@/components/ui/*`, `@/lib/utils`, `@/lib/permissions`, `@/hooks/*`, etc.) still work via re-export shims at the original paths.

New code should prefer `@/shared/*` imports.
