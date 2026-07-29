"use client"
import type { ReactNode } from "react"
import { format } from "date-fns"
import dynamic from "next/dynamic"
import { cn, formatGBP, parseLocalDate, totalJobCommercialValue } from "@/shared/utils/utils"
import { StatusWorkflow } from "@/components/status-workflow"
import { DesignerCombobox } from "@/components/designer-combobox"
import type { Job, BillingHandoff } from "@/lib/types"
import type { RevisionFamilyResponse } from "../types/revision-types"
import { JobRevisionOverview } from "./job-revision-overview"
import { invoiceLabel } from "./parent-job-helpers"

const StatusHistory = dynamic(
  () => import("@/components/status-history").then(m => m.StatusHistory),
  { ssr: false },
)
const JobDocumentsPanel = dynamic(
  () => import("@/modules/job-documents/components/job-documents-panel").then(m => m.JobDocumentsPanel),
  { ssr: false },
)

export type DetailTab = "overview" | "revisions" | "documents" | "financial"

export const DETAIL_TABS: Array<{ id: DetailTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "revisions", label: "Revisions" },
  { id: "documents", label: "Documents" },
  { id: "financial", label: "Financial" },
]

interface JobDetailTabsProps {
  activeTab: DetailTab
  onTabChange: (tab: DetailTab) => void
  job: Job & { parentJob?: Job | null; billingHandoff?: BillingHandoff | null; currentRevision?: Job | null }
  workflowJobId: string
  historyKey: number
  isCancelled: boolean
  billingHandoff: BillingHandoff | null
  commercialTotal: number | null
  revisionFamily: RevisionFamilyResponse | null
  revisionsLoading: boolean
  selectedRevisionId: string | null
  onSelectedRevisionId: (id: string | null) => void
  onAddRevision: () => void
  onStatusChange: (status: string) => void
  onHistoryKeyIncrement: () => void
  onDesignerChange: (designer: string) => void
}

function FinRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-[#E5E7EB] last:border-0">
      <span className="text-sm text-t3">{label}</span>
      <span className="text-sm text-t1 tabular-nums font-medium">{value}</span>
    </div>
  )
}

export function JobDetailTabs({
  activeTab,
  onTabChange,
  job,
  workflowJobId,
  historyKey,
  isCancelled,
  billingHandoff,
  commercialTotal,
  revisionFamily,
  revisionsLoading,
  selectedRevisionId,
  onSelectedRevisionId,
  onAddRevision,
  onStatusChange,
  onHistoryKeyIncrement,
  onDesignerChange,
}: JobDetailTabsProps) {
  const focus = job.currentRevision ?? job
  const revisions = revisionFamily?.revisions ?? []
  const revisionFees = revisions.reduce((sum, r) => sum + (r.quoteValue ?? 0), 0)

  return (
    <section className="rounded-lg border border-[#E5E7EB] bg-white overflow-hidden">
      <div
        role="tablist"
        aria-label="Job detail sections"
        className="flex gap-0 border-b border-[#E5E7EB] px-2"
      >
        {DETAIL_TABS.map(tab => {
          const selected = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
                selected
                  ? "border-t1 text-t1"
                  : "border-transparent text-t3 hover:text-t1",
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className="p-5" role="tabpanel">
        {activeTab === "overview" && (
          <div className="space-y-8">
            <div>
              <h3 className="text-sm font-semibold text-t1 mb-3">Status</h3>
              {!isCancelled ? (
                <StatusWorkflow
                  jobId={workflowJobId}
                  currentStatus={focus.status}
                  onStatusChange={onStatusChange}
                />
              ) : (
                <p className="text-sm text-t3">Status changes are disabled while cancelled.</p>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-t1 mb-3">Designer</h3>
              {!isCancelled ? (
                <div className="max-w-sm">
                  <DesignerCombobox
                    value={focus.designer ?? job.designer ?? ""}
                    onChange={onDesignerChange}
                  />
                </div>
              ) : (
                <p className="text-sm text-t2">{focus.designer || job.designer || "—"}</p>
              )}
            </div>

            {(job.notes || job.commercialNotes) && (
              <div className="space-y-4">
                {job.notes && (
                  <div>
                    <h3 className="text-sm font-semibold text-t1 mb-2">Notes</h3>
                    <p className="text-sm text-t2 whitespace-pre-wrap">{job.notes}</p>
                  </div>
                )}
                {job.commercialNotes && (
                  <div>
                    <h3 className="text-sm font-semibold text-t1 mb-2">Commercial notes</h3>
                    <p className="text-sm text-t2 whitespace-pre-wrap">{job.commercialNotes}</p>
                  </div>
                )}
              </div>
            )}

            <div>
              <h3 className="text-sm font-semibold text-t1 mb-3">Recent activity</h3>
              <StatusHistory key={historyKey} jobId={workflowJobId} onUpdate={onHistoryKeyIncrement} />
            </div>
          </div>
        )}

        {activeTab === "revisions" && (
          <JobRevisionOverview
            job={job}
            revisionFamily={revisionFamily}
            isLoading={revisionsLoading}
            selectedRevisionId={selectedRevisionId}
            onSelectedRevisionId={onSelectedRevisionId}
            onAddRevision={onAddRevision}
            defaultExpanded
          />
        )}

        {activeTab === "documents" && (
          <JobDocumentsPanel
            jobId={job.id}
            canWrite={!isCancelled}
            showTitle={false}
            onTimelineChange={onHistoryKeyIncrement}
          />
        )}

        {activeTab === "financial" && (
          <div className="max-w-lg space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-t1 mb-2">Fees</h3>
              <FinRow label="Original quote" value={job.quoteValue != null ? formatGBP(job.quoteValue) : "—"} />
              <FinRow label="Variation fees" value={job.variationFees != null ? formatGBP(job.variationFees) : "—"} />
              <FinRow label="Additional charges" value={job.additionalCharges != null ? formatGBP(job.additionalCharges) : "—"} />
              <FinRow label="Original total" value={commercialTotal != null ? formatGBP(commercialTotal) : "—"} />
              <FinRow label="Revision fees" value={revisions.length ? formatGBP(revisionFees) : "—"} />
            </div>

            <div>
              <h3 className="text-sm font-semibold text-t1 mb-2">Billing</h3>
              <FinRow
                label="Invoice status"
                value={invoiceLabel(focus.billingStatus ?? job.billingStatus ?? "")}
              />
              {billingHandoff && (
                <FinRow
                  label="Handoff"
                  value={format(new Date(billingHandoff.createdAt), "d MMM yyyy")}
                />
              )}
              {job.quoteDate && (
                <FinRow
                  label="Quote date"
                  value={format(parseLocalDate(job.quoteDate), "d MMM yyyy")}
                />
              )}
              {(job.currentQuote?.quoteNumber || job.quoteReference) && (
                <FinRow
                  label="Quote ref"
                  value={job.currentQuote?.quoteNumber ?? job.quoteReference}
                />
              )}
            </div>

            <p className="text-xs text-t4">
              Commercial total {totalJobCommercialValue(job) != null
                ? formatGBP((totalJobCommercialValue(job) ?? 0) + revisionFees)
                : "—"}
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
