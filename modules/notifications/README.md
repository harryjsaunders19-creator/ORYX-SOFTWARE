# Notifications

Cross-module alert aggregation for the top-bar bell menu.

**Routes:** `/api/notifications` (UI in app shell top bar)

**Migration status:** **Migrated (Phase 10)** — logic in `modules/notifications/`. Legacy paths remain valid via re-export shims.

**Structure:**
```
modules/notifications/
  api/          list.ts
  components/   notifications-menu.tsx
  services/     notification-service.ts
  types/        notifications-types.ts
  index.ts      public API
```

**Shims (legacy paths):**
- `lib/services/notification-service.ts`
- `lib/notifications.ts`
- `components/notifications-menu.tsx`

**Cross-module deps:**
- Aggregates from jobs, clients/hold, and leave (experimental) via service shims

**Public API:** `notificationService`, notification types, `sortNotifications`, `NotificationsMenu`.
