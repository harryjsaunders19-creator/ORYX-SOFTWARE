"use client"
import type { ReactNode } from "react"
import { format } from "date-fns"
import dynamic from "next/dynamic"
import { cn, formatGBP, parseLocalDate, totalJobCommercialValue } from "@/shared/utils/utils"
import { Typography } from "@/shared/design/typography"
import { StatusWorkflow } from "@/components/status-workflow"
import { DesignerCombobox } from "@/components/designer-combobox"
import { getWorkItemType, worksTypeDisplayLabel } from "@/lib/constants"
import type { Job, BillingHandoff } from "@/lib/types"
import type { RevisionFamilyResponse } from "../types/revision-types"
import { JobRevisionOverview } from "./job-revision-overview"
import { invoiceLabel } from "./parent-job-helpers"

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
  isCancelled: boolean
  billingHandoff: BillingHandoff | null
  commercialTotal: number | null
  revisionFamily: RevisionFamilyResponse | null
  revisionsLoading: boolean
  selectedRevisionId: string | null
  onSelectedRevisionId: (id: string | null) => void
  onAddRevision: () => void
  onStatusChange: (status: string) => void
  onDocumentsChange?: () => void
  onDesignerChange: (designer: string) => void
}

function FinRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-bd last:border-0">
      <span className={cn(Typography.Small, "text-t3")}>{label}</span>
      <span className={cn(Typography.Small, "text-t1 tabular-nums font-medium")}>{value}</span>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <span className={cn(Typography.Small, "text-t3")}>{label}</span>
      <span className={cn(Typography.Small, "font-medium text-t1")}>{value}</span>
    </>
  )
}

export function JobDetailTabs({
  activeTab,
  onTabChange,
  job,
  workflowJobId,
  isCancelled,
  billingHandoff,
  commercialTotal,
  revisionFamily,
  revisionsLoading,
  selectedRevisionId,
  onSelectedRevisionId,
  onAddRevision,
  onStatusChange,
  onDocumentsChange,
  onDesignerChange,
}: JobDetailTabsProps) {
  const focus = job.currentRevision ?? job
  const revisions = revisionFamily?.revisions ?? []
  const revisionFees = revisions.reduce((sum, r) => sum + (r.quoteValue ?? 0), 0)
  const site = [job.siteAddress, job.siteName].filter(Boolean).join(" · ") || job.address || "—"
  const works = worksTypeDisplayLabel(job.typeOfWorks, job.customTypeDescription) || "—"
  const jobType = getWorkItemType(job.itemType).label
  const notes = job.notes?.trim() || ""
  const commercialNotes = job.commercialNotes?.trim() || ""

  return (
    <section>
      <div
        role="tablist"
        aria-label="Job detail sections"
        className="flex flex-wrap gap-x-10 gap-y-1 border-b border-bd mb-8"
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
                Typography.Small,
                "pb-4 border-b-2 -mb-px transition-colors",
                selected
                  ? "border-t1 font-bold text-t1"
                  : "border-transparent font-medium text-t3 hover:text-t1",
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <div role="tabpanel">
        {activeTab === "overview" && (
          <div className="space-y-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16">
              <div className="space-y-6">
                <h3
                  className={cn(
                    Typography.Helper,
                    "uppercase tracking-[0.05em] text-t3 border-b border-surface-low pb-2",
                  )}
                >
                  Job Information
                </h3>
                <div className="grid grid-cols-2 gap-y-4 gap-x-4">
                  <InfoRow label="Job Type" value={jobType} />
                  <InfoRow label="Type of Works" value={works} />
                  <InfoRow label="Site Address" value={site} />
                  <InfoRow
                    label="Initial Quote"
                    value={
                      job.quoteValue != null
                        ? (formatGBP(job.quoteValue) ?? "—")
                        : "—"
                    }
                  />
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-surface-low pb-2">
                  <h3 className={cn(Typography.Helper, "uppercase tracking-[0.05em] text-t3")}>
                    Notes
                  </h3>
                </div>
                {notes || commercialNotes ? (
                  <div className="space-y-4">
                    {notes ? (
                      <p className={cn(Typography.Small, "text-t2 whitespace-pre-wrap")}>{notes}</p>
                    ) : null}
                    {commercialNotes ? (
                      <div>
                        <p className={cn(Typography.Helper, "text-t4 mb-1")}>Commercial notes</p>
                        <p className={cn(Typography.Small, "text-t2 whitespace-pre-wrap")}>
                          {commercialNotes}
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className={cn(Typography.Small, "italic text-t3")}>No notes added.</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 pt-2">
              <div>
                <h3 className={cn(Typography.Small, "font-semibold text-t1 mb-3")}>Status</h3>
                {!isCancelled ? (
                  <StatusWorkflow
                    jobId={workflowJobId}
                    currentStatus={focus.status}
                    onStatusChange={onStatusChange}
                  />
                ) : (
                  <p className={cn(Typography.Small, "text-t3")}>
                    Status changes are disabled while cancelled.
                  </p>
                )}
              </div>
              <div>
                <h3 className={cn(Typography.Small, "font-semibold text-t1 mb-3")}>Designer</h3>
                {!isCancelled ? (
                  <div className="max-w-sm">
                    <DesignerCombobox
                      value={focus.designer ?? job.designer ?? ""}
                      onChange={onDesignerChange}
                    />
                  </div>
                ) : (
                  <p className={cn(Typography.Small, "text-t2")}>
                    {focus.designer || job.designer || "—"}
                  </p>
                )}
              </div>
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
            onTimelineChange={onDocumentsChange}
          />
        )}

        {activeTab === "financial" && (
          <div className="max-w-lg space-y-6">
            <div>
              <h3 className={cn(Typography.Small, "font-semibold text-t1 mb-2")}>Fees</h3>
              <FinRow label="Original quote" value={job.quoteValue != null ? formatGBP(job.quoteValue) : "—"} />
              <FinRow label="Variation fees" value={job.variationFees != null ? formatGBP(job.variationFees) : "—"} />
              <FinRow label="Additional charges" value={job.additionalCharges != null ? formatGBP(job.additionalCharges) : "—"} />
              <FinRow label="Original total" value={commercialTotal != null ? formatGBP(commercialTotal) : "—"} />
              <FinRow label="Revision fees" value={revisions.length ? formatGBP(revisionFees) : "—"} />
            </div>

            <div>
              <h3 className={cn(Typography.Small, "font-semibold text-t1 mb-2")}>Billing</h3>
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

            <p className={cn(Typography.Helper, "text-t4")}>
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
