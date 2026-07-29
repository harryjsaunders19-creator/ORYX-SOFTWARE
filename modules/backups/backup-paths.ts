/**
 * Backup path constants — safe to import without opening SQLite.
 * Keep separate from backup-service.ts (which imports better-sqlite3).
 */
import path from "path"

export const BACKUPS_DIR =
  process.env.BACKUPS_DIR ??
  (process.env.VERCEL ? "/tmp/backups" : path.join(/*turbopackIgnore: true*/ process.cwd(), "backups"))

/**
 * On Vercel, the default BACKUPS_DIR is /tmp — ephemeral across cold starts.
 */
export const LOCAL_BACKUPS_EPHEMERAL_ON_VERCEL =
  process.env.VERCEL === "1" && !process.env.BACKUPS_DIR
