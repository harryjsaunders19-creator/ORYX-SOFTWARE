# Employees

HR employee directory and profiles (photos, documents, skills, notes, leave tab).

**Routes:** `/employees`, `/employees/[id]`, `/api/employees/*`

**Experimental:** Gated by `shared/experimental/experimental-features.ts` (`employees: false`).

**Migration status:** Phase 2 complete.

## Layout

```
modules/employees/
  api/              # Route handler logic (delegated from app/api/employees)
  components/       # Directory and profile pages
  config/           # Module metadata
  permissions.ts    # Field-level access control
  services/         # employee-service, employee-files
  supabase/         # Repository + mapper
  types/            # Domain types (shimmed at lib/db/employee-types.ts)
  index.ts          # Public API
```

## Public API

```typescript
import {
  employeeService,
  type EmployeeListItem,
  type EmployeeDetail,
  canEditEmployeeField,
  supabaseEmployeeRepo,
} from "@/modules/employees"
```

Legacy paths (`@/lib/services/employee-service`, `@/lib/employee-permissions`, etc.) remain as re-export shims.

## Dependencies (external to module)

- `@/lib/services/user-service` — user directory
- `@/lib/services/leave-service` — leave summary (dynamic import)
- `@/lib/db/stores` — SQLite stores (until Phase 13 db split)
