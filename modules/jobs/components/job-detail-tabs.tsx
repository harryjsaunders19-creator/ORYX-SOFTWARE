"use client"
import { format } from "date-fns"
import dynamic from "next/dynamic"
import { cn, formatGBP, parseLocalDate } from "@/shared/utils/utils"
import { StatusBadge } from "@/modules/jobs/components/badges/status-badge"
import { StatusWorkflow } from "@/components/status-workflow"
import { DesignerCombobox } from "@/components/designer-combobox"
import { worksTypeDisplayLabel } from "@/lib/constants"
import type { Job, BillingHandoff } from "@/lib/types"
import { InfoField } from "./job-page-primitives"

const StatusHistory = dynamic(
  () => import("@/components/status-history").then(m => m.StatusHistory),
  { ssr: false },
)
const RevisionHistory = dynamic(
  () => import("@/components/revision-history").then(m => m.RevisionHistory),
  { ssr: false },
)
const JobDocumentsPanel = dynamic(
  () => import("@/modules/job-documents/components/job-documents-panel").then(m => m.JobDocumentsPanel),
  { ssr: false },
)

export type DetailTab = "information" | "timeline" | "documents" | "financial" | "status" | "activity"

export const DETAIL_TABS: Array<{ id: DetailTab; label: string }> = [
  { id: "information", label: "Job Information" },
  { id: "timeline", label: "Timeline" },
  { id: "documents", label: "Documents" },
  { id: "financial", label: "Financial" },
  { id: "status", label: "Status" },
  { id: "activity", label: "Activity" },
]

interface JobDetailTabsProps {
  activeTab: DetailTab
  onTabChange: (tab: DetailTab) => void
  job: Job & { parentJob?: Job | null; billingHandoff?: BillingHandoff | null; currentRevision?: Job | null }
  workflowJobId: string
  historyKey: number
  isCancelled: boolean
  isRevision: boolean
  parentJob: Job | null
  billingHandoff: BillingHandoff | null
  commercialTotal: number | null
  onFamilyChanged: () => void
  onOpenEdit: () => void
  onStatusChange: (status: string) => void
  onHistoryKeyIncrement: () => void
  onDesignerChange: (designer: string) => void
}

export function JobDetailTabs({
  activeTab,
  onTabChange,
  job,
  workflowJobId,
  historyKey,
  isCancelled,
  isRevision,
  parentJob,
  billingHandoff,
  commercialTotal,
  onFamilyChanged,
  onOpenEdit,
  onStatusChange,
  onHistoryKeyIncrement,
  onDesignerChange,
}: JobDetailTabsProps) {
  return (
    <section className="oryx-surface-card overflow-hidden rounded-xl border border-bd bg-sr shadow-sm">
      <div
        role="tablist"
        aria-label="Job detail sections"
        className="flex flex-wrap gap-1 border-b border-bd bg-pg/40 px-2 pt-2 sm:px-3"
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
                "px-4 py-2 text-sm font-semibold rounded-t-lg border border-b-0 transition-colors",
                selected
                  ? "bg-sr text-t1 border-bd -mb-px"
                  : "bg-transparent text-t3 border-transparent hover:text-t1 hover:bg-sr/60",
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className="p-6 sm:p-6" role="tabpanel">
        {activeTab === "information" && (
          <div>
            <div className="flex items-center justify-between gap-3 mb-6">
              <div>
                <h2 className="text-lg font-semibold text-t1">Job Information</h2>
                <p className="text-sm text-t3 mt-0.5">Site, client, and assignment details</p>
              </div>
              <span className="text-sm text-t4 shrink-0">
                Updated {format(new Date(job.updatedAt), "d MMM yyyy HH:mm")}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-5">
              <InfoField
                label="Job Type"
                value={(() => {
                  const t = job.itemType ?? "DESIGN"
                  return t.charAt(0) + t.slice(1).toLowerCase().replace("_", " ")
                })()}
              />
              <InfoField label="Site Address" value={job.address} />
              <InfoField
                label="Type of works"
                value={worksTypeDisplayLabel(job.typeOfWorks, job.customTypeDescription) || null}
              />
              <InfoField
                label="Initial Quote"
                value={formatGBP(job.quoteValue) ?? (parentJob?.quoteValue != null ? formatGBP(parentJob.quoteValue) : null)}
              />
              <InfoField label="Requested by" value={job.requestedBy} />
              <div>
                <p className="type-label text-t3 mb-2">
                  Engineer Assigned
                </p>
                {isCancelled ? (
                  <p className="text-sm text-t1">{job.designer || "Unassigned"}</p>
                ) : (
                  <DesignerCombobox
                    value={job.designer}
                    onChange={v => onDesignerChange(v)}
                    placeholder="Select a user…"
                  />
                )}
              </div>
              <InfoField label="Client" value={job.clientCompany} />
              <InfoField label="Created" value={format(new Date(job.dateCreated), "d MMMM yyyy")} />
              {job.legacyTypeOfWorks && (
                <InfoField label="Originally entered as" value={job.legacyTypeOfWorks} />
              )}
              {job.dateCompleted && (
                <InfoField label="Completed" value={format(parseLocalDate(job.dateCompleted), "d MMMM yyyy")} />
              )}
              {job.requiredByDate && (
                <InfoField label="Required by" value={format(parseLocalDate(job.requiredByDate), "d MMMM yyyy")} />
              )}
              {job.notes && <InfoField label="Notes" value={job.notes} />}
              {job.designStandards && (
                <InfoField label="Design standards & codes" value={job.designStandards} />
              )}
              {(job.tags ?? []).length > 0 && (
                <InfoField label="Tags" value={(job.tags ?? []).join(", ")} />
              )}
            </div>
          </div>
        )}

        {activeTab === "timeline" && (
          <RevisionHistory
            job={job}
            refreshKey={historyKey}
            embedded
            hideCreate
            onFamilyChanged={() => { onFamilyChanged(); onHistoryKeyIncrement() }}
          />
        )}

        {activeTab === "documents" && (
          <div>
            <h2 className="text-lg font-semibold text-t1 mb-1">Documents</h2>
            <p className="text-sm text-t3 mb-6">PDFs and images — print emails to PDF to attach them</p>
            <JobDocumentsPanel
              jobId={job.id}
              showTitle={false}
              onTimelineChange={onHistoryKeyIncrement}
            />
          </div>
        )}

        {activeTab === "financial" && (
          <div>
            <div className="flex items-center justify-between gap-3 mb-6">
              <div>
                <h2 className="text-lg font-semibold text-t1">Financial</h2>
                <p className="text-sm text-t3 mt-0.5">Quote, variations, and invoicing</p>
              </div>
              {!isCancelled && (
                <button
                  type="button"
                  onClick={onOpenEdit}
                  className="text-sm text-ac hover:text-ach font-medium shrink-0"
                >
                  {job.quoteValue != null || job.quoteReference || job.quoteDate || job.commercialNotes
                    || job.variationFees != null || job.additionalCharges != null
                    ? "Edit quote"
                    : "Add quote"}
                </button>
              )}
            </div>
            {job.quoteValue != null || job.quoteReference || job.quoteDate || job.commercialNotes
              || job.variationFees != null || job.additionalCharges != null ? (
              <div className="max-w-xl space-y-4 text-base">
                {job.quoteValue != null && (
                  <div className="flex justify-between gap-2">
                    <span className="text-t3">Quote value</span>
                    <span className="font-semibold tabular-nums text-t1">{formatGBP(job.quoteValue)}</span>
                  </div>
                )}
                {job.variationFees != null && (
                  <div className="flex justify-between gap-2">
                    <span className="text-t3">Variation fees</span>
                    <span className="font-semibold tabular-nums text-t1">{formatGBP(job.variationFees)}</span>
                  </div>
                )}
                {job.additionalCharges != null && (
                  <div className="flex justify-between gap-2">
                    <span className="text-t3">Additional charges</span>
                    <span className="font-semibold tabular-nums text-t1">{formatGBP(job.additionalCharges)}</span>
                  </div>
                )}
                {commercialTotal != null && (
                  <div className="flex justify-between gap-2 pt-3 border-t border-bd">
                    <span className="text-t3 font-medium">Total agreed</span>
                    <span className="font-semibold tabular-nums text-t1">{formatGBP(commercialTotal)}</span>
                  </div>
                )}
                {job.quoteReference && (
                  <p className="text-sm text-t4 pt-1">Ref {job.quoteReference}</p>
                )}
                {job.quoteDate && (
                  <p className="text-sm text-t4">
                    Quote date {format(parseLocalDate(job.quoteDate), "d MMM yyyy")}
                  </p>
                )}
                {job.commercialNotes && (
                  <p className="text-sm text-t3 pt-1 whitespace-pre-wrap">{job.commercialNotes}</p>
                )}
                {isRevision && parentJob && job.quoteValue == null && parentJob.quoteValue != null && (
                  <p className="text-sm text-t3 pt-2 border-t border-bd">
                    Inherited from parent:{" "}
                    <span className="font-semibold text-t1">{formatGBP(parentJob.quoteValue)}</span>
                  </p>
                )}
                {billingHandoff && (
                  <div className="pt-2 mt-1 border-t border-bd">
                    <p className="text-sm text-t3">
                      Invoicing:{" "}
                      {billingHandoff.clearedByAccountsAt ? (
                        <span className="font-medium text-ok-tx">
                          Cleared{billingHandoff.clearedBy ? ` (${billingHandoff.clearedBy})` : ""}
                        </span>
                      ) : (
                        <span className="font-medium text-wn-tx">Awaiting accounts</span>
                      )}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-base text-t4 italic">No quote added yet.</p>
            )}
          </div>
        )}

        {activeTab === "status" && (
          <div>
            <h2 className="text-lg font-semibold text-t1 mb-1">Status</h2>
            <p className="text-sm text-t3 mb-6">Update the workflow for the current revision</p>
            {isCancelled ? (
              <StatusBadge status={job.status} />
            ) : (
              <StatusWorkflow
                jobId={workflowJobId}
                currentStatus={job.status}
                onStatusChange={onStatusChange}
              />
            )}
          </div>
        )}

        {activeTab === "activity" && (
          <div>
            <h2 className="text-lg font-semibold text-t1 mb-1">Activity</h2>
            <p className="text-sm text-t3 mb-6">Status changes, notes, and document events</p>
            <StatusHistory
              key={historyKey}
              jobId={workflowJobId}
              onUpdate={onHistoryKeyIncrement}
            />
          </div>
        )}
      </div>
    </section>
  )
}
