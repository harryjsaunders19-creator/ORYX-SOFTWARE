/**
 * lib/backup-scheduler.ts
 */
import { backupRecordService } from "./services/backup-record-service"
import { startBackup } from "./backup-service"
import { logEvent, logError } from "@/shared/logger"

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

    logEvent("backup.scheduler.start_due")
    await startBackup({ triggeredBy: "system", triggeredByName: "Scheduled Backup", trigger: "SCHEDULED" })
  } catch (err) {
    logError("backup.scheduler.check_failed", err)
  }
}

export function startBackupScheduler() {
  if (started) return
  started = true
  logEvent("backup.scheduler.started", { checkIntervalMs: CHECK_INTERVAL_MS, targetHour: SCHEDULED_HOUR })
  void checkAndRunIfDue()
  setInterval(() => { void checkAndRunIfDue() }, CHECK_INTERVAL_MS)
}
