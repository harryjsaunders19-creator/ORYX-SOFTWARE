/**
 * lib/backup-scheduler.ts
 *
 * No external cron/queue infrastructure is assumed for this app, so this is
 * an in-process scheduler: a setInterval that checks once an hour whether
 * today's backup has run yet, and starts one if not. This is the practical
 * answer for "automatic daily backups" on a small internal app with a
 * single persistent Node process — it requires nothing beyond the app
 * itself being up.
 *
 * Tradeoff, stated plainly: if the server process is down at the scheduled
 * time, that day's backup is simply missed (this checks "has today's backup
 * run yet" on an hourly cadence, so it'll catch up once the server is back
 * up that same day, but not retroactively for days the server was down
 * entirely). For a deployment that needs guaranteed-even-if-the-app-was-down
 * scheduling, an external cron hitting `POST /api/backups` (with a
 * dedicated service-account admin session, or a small shared-secret
 * variant — not built here, since it wasn't asked for and would need its
 * own credential to manage safely) is the more robust alternative; this
 * in-process scheduler is the zero-infrastructure default.
 */
import { backupJobDb } from "@/lib/db"
import { startBackup } from "@/lib/backup-service"

const CHECK_INTERVAL_MS = 60 * 60 * 1000   // hourly
const SCHEDULED_HOUR = 2                    // run around 02:00 server-local time

let started = false   // guards against Next.js dev-mode re-invoking this on every hot reload

function checkAndRunIfDue() {
  try {
    const now = new Date()
    if (now.getHours() < SCHEDULED_HOUR) return

    const latest = backupJobDb.findLatestCompleted()
    const todayKey = now.toISOString().slice(0, 10)
    const latestCompletedDay = latest?.completedAt?.slice(0, 10)
    if (latestCompletedDay === todayKey) return   // already ran today

    // Also skip if one is already in flight (e.g. an admin happened to
    // trigger a manual one minutes ago) — same reasoning as the API route's
    // own in-flight guard.
    const recent = backupJobDb.findMany({ take: 5 })
    if (recent.some(b => b.status === "PENDING" || b.status === "RUNNING")) return

    console.log("[backup-scheduler] No backup has completed today — starting a scheduled backup")
    startBackup({ triggeredBy: "system", triggeredByName: "Scheduled Backup", trigger: "SCHEDULED" })
  } catch (err) {
    console.error("[backup-scheduler] Error during scheduled check:", err)
  }
}

export function startBackupScheduler() {
  if (started) return
  started = true
  console.log("[backup-scheduler] Daily backup scheduler started (hourly check, target ~02:00 server time)")
  checkAndRunIfDue()   // also check immediately on boot, in case the server was down at the scheduled hour
  setInterval(checkAndRunIfDue, CHECK_INTERVAL_MS)
}
