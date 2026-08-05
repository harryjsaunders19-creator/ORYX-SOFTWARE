# Supabase migration numbering

Migrations live in `supabase/migrations/` and are also concatenated by
`supabase/01-bootstrap.sql` in a **fixed file order**, not by numeric sort alone.

## Known collisions

These pairs share a numeric prefix but are distinct migrations:

| Prefix | Files |
|--------|--------|
| `004` | `004_quote_type_of_works.sql`, `004_status_history.sql` |
| `005` | `005_client_holds.sql`, `005_job_commercial_extras.sql` |

Do **not** renumber them in place if they may already be applied on a remote —
changing filenames can desync Supabase migration history
(`Remote migration versions not found in local migrations directory`).

## Convention going forward

- New migrations: next unused number (`041_…`, `042_…`, …) with a unique prefix.
- Never reuse a number that already appears in this folder.
- After editing migrations, regenerate bootstrap: `npm run supabase:bootstrap`.
- `scripts/build-supabase-bootstrap.mjs` `MIGRATION_ORDER` must list every file in
  this folder (currently through `042_dashboard_active_revisions.sql`).
