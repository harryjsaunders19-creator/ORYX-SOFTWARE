/**
 * lib/backup-scheduler.ts
 */
import { backupRecordService } from "./services/backup-record-service"
import { startBackup } from "./backup-service"

const CHECK_INTERVAL_MS = 60 * 60 * 1000
const SCHEDULED_HOUR = 2

let started = false

async function checkAndRunIfDue() {
  try {
    const now = new Date()
    if (now.getHours() < SCHEDULED_HOUR) return

    const latest = await backupRecordService.findLatestCompleted()
    const todayKey = now.toISOString().slice(0, 10)
    const latestCompletedDay = latest?.completedAt?.slice(0, 10)
    if (latestCompletedDay === todayKey) return

    const recent = await backupRecordService.findMany({ take: 5 })
    if (recent.some(b => b.status === "PENDING" || b.status === "RUNNING")) return

    console.log("[backup-scheduler] No backup has completed today — starting a scheduled backup")
    await startBackup({ triggeredBy: "system", triggeredByName: "Scheduled Backup", trigger: "SCHEDULED" })
  } catch (err) {
    console.error("[backup-scheduler] Error during scheduled check:", err)
  }
}

export function startBackupScheduler() {
  if (started) return
  started = true
  console.log("[backup-scheduler] Daily backup scheduler started (hourly check, target ~02:00 server time)")
  void checkAndRunIfDue()
  setInterval(() => { void checkAndRunIfDue() }, CHECK_INTERVAL_MS)
}
