# Calendar

Site visits, Teams meetings, and (when enabled) leave events.

**Routes:** `/calendar`, `/api/calendar/*`

**Migration status:** **Migrated (Phase 4)** — logic in `modules/calendar/`. Legacy paths remain valid via re-export shims.

**Structure:**
```
modules/calendar/
  api/          events.ts, event-by-id.ts, categories.ts
  components/   calendar-page.tsx, month-view.tsx, event-dialog.tsx, event-pill.tsx
  config/       category-config.ts, module.ts
  services/     calendar-service.ts
  supabase/     repository.ts, mapper.ts
  types/        calendar-types.ts
  index.ts      public API
```

**Shims (legacy paths):**
- `lib/services/calendar-service.ts`
- `lib/calendar/category-config.ts`
- `lib/db/calendar-types.ts`
- `lib/supabase/repositories/calendar.ts`
- `lib/supabase/mappers/calendar.ts`
- `components/calendar/*`

**Cross-module deps:**
- Calendar → leave (enrichment, permissions, constants via `@/lib/leave/*` shims to avoid circular init)
- Leave → calendar (`calendarService` via `@/modules/calendar`)

**Public API:** `calendarService`, category config, types, `MonthView`, `EventDialog`, `EventPill`, `CalendarPage`, `SITE_VISIT_CATEGORY_ID`, `TEAMS_MEETING_CATEGORY_ID`.
