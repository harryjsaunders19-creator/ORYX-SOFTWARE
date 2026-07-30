# Client / Site / Job workflow redesign

## Audit summary

- Hierarchy today: Client → optional Site → Job/ParentJob.
- Mode is inferred from nullable `siteId` (form sends `locationType`; not persisted).
- Job has `address`, `siteName`, `siteAddress`; Site has structured address + postcode.
- Gaps: no intelligent location search, no convert-later flow, no job-level postcode/locationMode, migration creates a Site per group including singles.

## Target model

| Job field | Meaning |
|-----------|---------|
| `clientId` | Client |
| `locationMode` | `ONE_OFF` \| `MANAGED_SITE` |
| `siteId` | null if one-off; set if managed |
| `locationName` | Property or site display name |
| `address` | Full address line |
| `postcode` | Postcode (search/dedupe) |

Sites remain reusable only: name, address, postcode, reference, notes. Job-specific data stays on Job.

## Migration strategy

1. Add columns to Job / ParentJob (SQLite + Supabase `042_location_mode.sql`):
   - `location_mode` default `ONE_OFF`
   - `location_name` (backfill from `site_name`)
   - `postcode` (best-effort extract from address / site address where possible)
2. Set `location_mode = MANAGED_SITE` where `site_id IS NOT NULL`.
3. Leave existing jobs as one-off unless already linked.
4. Update `migrate:sites` to create Sites **only** when ≥2 jobs clearly share client+address; report singles as candidates.
5. Keep `site_name` / `site_address` in sync with `location_name` / `address` for register/search compatibility.

## Rollback strategy

1. New columns are additive and nullable/defaulted — dropping them restores prior behaviour.
2. Feature-flag location search UI behind existing form paths if needed.
3. Convert-to-site is reversible via unlink (`siteId` null, mode ONE_OFF) with audit.
4. Do not hard-delete Sites created by conversion; archive if unused.

## Edge cases

- Same address, different clients → no cross-client site link.
- Soft address matches (punctuation/case) → suggest, never force.
- Convert with one existing job → create Site, link both, preserve all job children.
- Edit Managed Site address → propagate denormalized fields to linked jobs.
- Archive Site with jobs → allowed; delete with jobs → blocked.
- Empty location search → free-text one-off.
- Parent job + work items → location lives on parent; children inherit display.
- Import/Excel → always ONE_OFF.
- Missing `041_sites` → Managed Site APIs return migration hint; one-off still works.

## Screens affected

Job form, Jobs register (label only), Inspector Project Details, Client detail, Site selector/create, Sites APIs, Jobs create/patch, migrate-sites.
