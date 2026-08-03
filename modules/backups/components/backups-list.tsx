"use client"
import { format } from "date-fns"
import { DatabaseBackup, CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react"
import { DataPanel, surfaceCard } from "@/shared/layouts/page-layout"
import { cn } from "@/shared/utils/utils"
import { formatBytes, formatDuration, statusLabel, triggerLabel } from "./backups-helpers"
import type { BackupJob } from "./backups-helpers"

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "COMPLETED": return <CheckCircle2 className="h-4 w-4 text-ok-ic shrink-0" />
    case "FAILED":    return <XCircle className="h-4 w-4 text-dn shrink-0" />
    case "RUNNING":   return <Loader2 className="h-4 w-4 text-ac shrink-0" style={{ animation: "spin 1s linear infinite" }} />
    case "PENDING":   return <Clock className="h-4 w-4 text-t4 shrink-0" />
    default:          return <Clock className="h-4 w-4 text-t4 shrink-0" />
  }
}

interface Props {
  backups: BackupJob[]
  loading: boolean
  localBackupSupported: boolean
}

export function BackupsList({ backups, loading, localBackupSupported }: Props) {
  const failedBackups = backups.filter(b => b.status === "FAILED")

  return (
    <>
      {loading && backups.length === 0 ? (
        <div className={surfaceCard}>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-14 border-b border-bd last:border-0 px-4 flex items-center">
              <div className="skeleton h-4 w-64 rounded" />
            </div>
          ))}
        </div>
      ) : backups.length === 0 ? (
        <div className={cn(surfaceCard, "p-10 text-center")}>
          <DatabaseBackup className="h-5 w-5 text-t4 mx-auto mb-3" />
          <p className="text-sm font-medium text-t1 mb-1">
            {localBackupSupported ? "No local backups yet" : "No local backup history"}
          </p>
          <p className="text-xs text-t3 max-w-md mx-auto">
            {localBackupSupported
              ? <>The first automated backup will run at ~02:00, or click &ldquo;Run backup now&rdquo;. You can also Export full data anytime.</>
              : "Use Export full data or Export Excel above. Keep a copy somewhere safe, and confirm Supabase project backups are enabled."}
          </p>
        </div>
      ) : (
        <DataPanel className="overflow-hidden mb-5">
          <div className="px-4 py-3 border-b border-bd">
            <p className="type-label text-t3">Backup history</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-pg border-b border-bd text-xs">
                  <th className="px-4 py-2.5 text-left  w-10" />
                  <th className="px-4 py-2.5 text-left ">Date & Time</th>
                  <th className="px-4 py-2.5 text-left ">Status</th>
                  <th className="px-4 py-2.5 text-left ">Trigger</th>
                  <th className="px-4 py-2.5 text-left ">By</th>
                  <th className="px-4 py-2.5 text-right ">Size</th>
                  <th className="px-4 py-2.5 text-right ">Duration</th>
                  <th className="px-4 py-2.5 text-left ">Folder</th>
                </tr>
              </thead>
              <tbody>
                {backups.map(b => (
                  <tr key={b.id} className={cn("border-b border-bd last:border-0 hover:bg-hover-surface", b.status === "FAILED" && "bg-dn-bg/30")}>
                    <td className="px-4 py-3"><StatusIcon status={b.status} /></td>
                    <td className="px-4 py-3 text-xs text-t1 tabular-nums whitespace-nowrap">
                      {format(new Date(b.startedAt), "d MMM yyyy, HH:mm:ss")}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "type-badge",
                        b.status === "COMPLETED" ? "text-ok-tx" :
                        b.status === "FAILED"    ? "text-dn-tx" :
                        b.status === "RUNNING"   ? "text-ac" :
                        "text-t3",
                      )}>
                        {statusLabel(b.status)}
                      </span>
                      {b.fileDeletedAt && <span className="type-helper text-t4 ml-1">(pruned)</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-t3">{triggerLabel(b.trigger)}</td>
                    <td className="px-4 py-3 text-xs text-t2">{b.triggeredByName}</td>
                    <td className="px-4 py-3 text-xs text-t2 text-right tabular-nums">{formatBytes(b.sizeBytes)}</td>
                    <td className="px-4 py-3 text-xs text-t2 text-right tabular-nums">{formatDuration(b.durationMs)}</td>
                    <td className="px-4 py-3 text-xs type-drawing-number text-t4 truncate max-w-[180px]" title={b.folderName}>{b.folderName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataPanel>
      )}

      {failedBackups.length > 0 && (
        <DataPanel className="overflow-hidden mb-5">
          <div className="px-4 py-3 border-b border-bd">
            <p className="text-xs font-semibold text-dn-tx ">Failed backups</p>
          </div>
          <div className="divide-y divide-bd">
            {failedBackups.map(b => (
              <div key={b.id} className="px-4 py-3">
                <p className="text-xs text-t2 mb-1">{format(new Date(b.startedAt), "d MMM yyyy, HH:mm:ss")}</p>
                <p className="text-xs type-drawing-number text-dn-tx">{b.errorMessage ?? "Unknown error"}</p>
              </div>
            ))}
          </div>
        </DataPanel>
      )}
    </>
  )
}
