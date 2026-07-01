# Leave

Leave requests, admin approval workflow, and calendar sync.

**Routes:** `/api/leave/*` (UI integrated in calendar + employee profile)

**Experimental:** Gated by `shared/experimental/experimental-features.ts` (`leave: false`).

**Migration status:** Phase 3 complete.

## Layout

```
modules/leave/
  api/              # Route handler logic (delegated from app/api/leave)
  components/       # Calendar leave dialog + admin acceptance panel
  constants.ts      # Category IDs, statuses, helpers
  permissions.ts    # Visibility and approval rules
  enrichment.ts     # Calendar event enrichment
  services/         # leave-service (calendar sync)
  supabase/         # Repository + mapper
  types/            # Domain types (shimmed at lib/db/leave-types.ts)
  index.ts          # Public API (server)
  ui.ts             # Client-safe exports (components + constants)
```

## Public API

**Server / API routes:** `@/modules/leave`

**Client Components:** `@/modules/leave/ui` — do not import `@/modules/leave` in `"use client"` files (pulls SQLite/DB into the browser bundle).

```typescript
import { leaveService, enrichEventsWithLeave } from "@/modules/leave"
import { LeaveEventDialog, leaveTypeLabel } from "@/modules/leave/ui"
```

Legacy paths (`@/lib/services/leave-service`, `@/lib/leave/*`, calendar component shims) remain as re-export shims.

## Dependencies (external to module)

- `@/lib/services/calendar-service` — sync approved/pending leave to calendar events
- `@/lib/services/user-service` — assignee names
- `@/lib/supabase/repositories/employees` — employee profiles, leave taken recalculation
- `@/lib/db/stores` — SQLite stores (until Phase 13)
