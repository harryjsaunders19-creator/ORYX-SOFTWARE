# Backups

System backup, restore, and audit trail.

**Routes:** `/backups`, `/api/backups/*`

## Production (Supabase + Vercel)

| Tool | What it covers |
|------|----------------|
| **Supabase project backups / PITR** | Full database — primary disaster recovery |
| **Export full data** (`GET /api/backups/export-data`) | Live JSON pack v2: Users (no password hashes), Clients, Jobs, Quotes + sha256 checksum |
| **Import JSON** (`POST /api/backups/import-data`) | Upserts that pack back into the live store |
| **Export / Import Excel** | Users directory, Clients, Jobs (designer + dates + Customer ID link), Quotes — no login hashes in Excel |

Local SQLite filesystem dumps (`POST /api/backups`, scheduler) are disabled when Supabase is the primary store.

**Public API:** `backupRecordService`, logical export/import, SQLite orchestration helpers, restore, scheduler, download tokens, `BackupsPage`.
