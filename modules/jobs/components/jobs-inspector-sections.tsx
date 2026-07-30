"use client"

import { Check, Circle } from "lucide-react"
import { cn } from "@/shared/utils/utils"
import { Typography } from "@/shared/design/typography"
import { WORKFLOW_STAGES, type WorkflowStageId } from "./jobs-register-types"

function safeDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function JobsInspectorWorkflow({
  stages,
}: {
  stages: { id: WorkflowStageId; done: boolean }[]
}) {
  const byId = new Map(stages.map(s => [s.id, s.done]))
  const allDone = WORKFLOW_STAGES.every(s => byId.get(s.id))

  return (
    <section>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className={cn(Typography.CardTitle, "text-t1")}>Workflow Progress</h3>
        {allDone && (
          <span className="text-xs font-medium text-ok-tx">Ready to complete</span>
        )}
      </div>
      <ul className="space-y-2">
        {WORKFLOW_STAGES.map(stage => {
          const done = Boolean(byId.get(stage.id))
          return (
            <li key={stage.id} className="flex items-center gap-2.5 text-sm">
              {done ? (
                <Check className="h-4 w-4 text-ok-ic shrink-0" aria-hidden />
              ) : (
                <Circle className="h-4 w-4 text-t4 shrink-0" aria-hidden />
              )}
              <span className={done ? "text-t1 font-medium" : "text-t3"}>
                {stage.label}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export interface InspectorFileItem {
  id: string
  label: string
  kind: "drawing" | "calculation" | "pdf" | "other"
  uploadedAt: string | null
  openUrl?: string | null
  downloadUrl?: string | null
}

export function JobsInspectorRecentFiles({
  files,
  onReplace,
}: {
  files: InspectorFileItem[]
  onReplace?: (id: string) => void
}) {
  return (
    <section>
      <h3 className={cn(Typography.CardTitle, "text-t1 mb-3")}>Recent Files</h3>
      {files.length === 0 ? (
        <p className="text-sm text-t3">No files uploaded yet.</p>
      ) : (
        <ul className="space-y-2">
          {files.map(file => (
            <li
              key={file.id}
              className="rounded-lg border border-bd bg-sr px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-t1 truncate">{file.label}</p>
                  <p className="text-xs text-t3 mt-0.5">
                    {file.uploadedAt
                      ? `Uploaded ${(safeDate(file.uploadedAt)?.toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        }) ?? "Unknown date")}`
                      : "Upload date unknown"}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {file.openUrl && (
                  <a
                    href={file.openUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-rs-tx hover:underline"
                  >
                    Open
                  </a>
                )}
                {file.downloadUrl && (
                  <a
                    href={file.downloadUrl}
                    className="text-xs font-medium text-rs-tx hover:underline"
                    download
                  >
                    Download
                  </a>
                )}
                {onReplace && (
                  <button
                    type="button"
                    onClick={() => onReplace(file.id)}
                    className="text-xs font-medium text-t2 hover:underline"
                  >
                    Replace
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export interface InspectorActivityItem {
  id: string
  timestamp: string
  user: string
  action: string
}

export function JobsInspectorActivityFeed({
  items,
}: {
  items: InspectorActivityItem[]
}) {
  return (
    <section>
      <h3 className={cn(Typography.CardTitle, "text-t1 mb-3")}>Activity Feed</h3>
      {items.length === 0 ? (
        <p className="text-sm text-t3">No recent activity.</p>
      ) : (
        <ol className="space-y-3">
          {items.map(item => (
            <li key={item.id} className="border-l-2 border-bd pl-3">
              <p className="text-sm text-t1 font-medium">{item.action}</p>
              <p className="text-xs text-t3 mt-0.5">
                {item.user}
                {" · "}
                {(safeDate(item.timestamp)?.toLocaleString("en-GB", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                }) ?? "Unknown time")}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
