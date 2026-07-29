"use client"
import { Check } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { getJobDeadlineInfo } from "@/shared/utils/utils"
import type { Job } from "@/lib/types"
import type { RevisionFamilyResponse } from "../types/revision-types"

export type AttentionAction =
  | "assign"
  | "create-quote"
  | "status"
  | "billing"
  | "deadline"

export interface AttentionItem {
  id: string
  message: string
  action?: AttentionAction
  actionLabel?: string
}

export function buildAttentionItems(
  job: Job & { currentRevision?: Job | null; currentQuote?: { quoteNumber: string } | null },
  _revisionFamily: RevisionFamilyResponse | null,
): AttentionItem[] {
  if (job.archivedAt) return []

  const focus = job.currentRevision ?? job
  const designer = (focus.designer ?? job.designer ?? "").trim()
  const status = focus.status
  const dl = getJobDeadlineInfo({ requiredByDate: focus.requiredByDate ?? job.requiredByDate, status })
  const items: AttentionItem[] = []

  if (!designer) {
    items.push({
      id: "designer",
      message: "Designer not assigned",
      action: "assign",
      actionLabel: "Assign",
    })
  }

  if (dl.severity === "overdue") {
    items.push({
      id: "deadline-overdue",
      message: `Deadline overdue — ${dl.label}`,
      action: "deadline",
      actionLabel: "View",
    })
  } else if (dl.severity === "today" || dl.severity === "soon") {
    items.push({
      id: "deadline-soon",
      message: `Deadline approaching — ${dl.label}`,
      action: "deadline",
      actionLabel: "View",
    })
  }

  const hasQuote = !!(job.currentQuote || job.quoteReference || job.quoteValue != null)
  if (!hasQuote) {
    items.push({
      id: "quote",
      message: "Quote not created",
      action: "create-quote",
      actionLabel: "Create quote",
    })
  }

  if (status === "CHECKING") {
    items.push({
      id: "checking",
      message: "Awaiting CAT II review",
      action: "status",
      actionLabel: "Open status",
    })
  } else if (status === "READY_TO_SEND") {
    items.push({
      id: "ready",
      message: "Ready to send — awaiting issue",
      action: "status",
      actionLabel: "Open status",
    })
  }

  const billing = focus.billingStatus ?? job.billingStatus
  if (status === "ISSUED" && billing === "READY") {
    items.push({
      id: "invoice",
      message: "Invoice outstanding",
      action: "billing",
      actionLabel: "Billing",
    })
  }

  return items
}

export function JobDetailAttention({
  items,
  onAction,
}: {
  items: AttentionItem[]
  onAction: (action: AttentionAction) => void
}) {
  return (
    <section className="rounded-lg border border-[#E5E7EB] bg-white px-5 py-4">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold text-t1">Attention required</h2>
        {items.length > 0 && (
          <span className="text-xs text-t4 tabular-nums">{items.length}</span>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-t2 flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-ok-bg text-ok-ic">
            <Check className="h-3 w-3" strokeWidth={2.5} />
          </span>
          No outstanding actions
        </p>
      ) : (
        <ul className="space-y-0 divide-y divide-[#E5E7EB]">
          {items.map(item => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <p className="text-sm text-t1">{item.message}</p>
              {item.action && item.actionLabel ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-t2"
                  onClick={() => onAction(item.action!)}
                >
                  {item.actionLabel}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
