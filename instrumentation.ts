/**
 * instrumentation.ts
 *
 * Next.js's supported hook for one-time server-startup logic (stable, no
 * config flag needed as of Next.js 15+). Used here only to start the daily
 * backup scheduler. Deliberately NOT used for the database schema
 * migrations — those already run as a side effect of importing lib/db.ts
 * the first time any API route touches it, which is the established
 * pattern throughout this codebase; this file doesn't change that.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return   // skip on the edge runtime — better-sqlite3 and the scheduler both need real Node
  const { startBackupScheduler } = await import("@/lib/backup-scheduler")
  startBackupScheduler()
  const { startQuoteExpiryScheduler } = await import("@/lib/quote-expiry-scheduler")
  startQuoteExpiryScheduler()
}
