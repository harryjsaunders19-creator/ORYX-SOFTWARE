"use client"
import { format } from "date-fns"
import {
  Download,
  Pencil,
  Trash2,
  UserPlus,
  FileText,
  Receipt,
  Building2,
  GitBranch,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/shared/ui/button"
import { cn, formatGBP, parseLocalDate, totalJobCommercialValue } from "@/shared/utils/utils"
import type { DeadlineInfo } from "@/shared/utils/utils"
import type { Job } from "@/lib/types"
import type { RevisionFamilyResponse } from "../types/revision-types"
import { invoiceLabel } from "./parent-job-helpers"

interface JobDetailSidebarProps {
  job: Job & { currentRevision?: Job | null }
  dl: DeadlineInfo
  isCancelled: boolean
  isAdmin: boolean
  cat2Exporting: boolean
  revisionFamily: RevisionFamilyResponse | null
  onAssign: () => void
  onEdit: () => void
  onCreateQuote: () => void
  onAttachExistingQuote: () => void
  onCat2Export: () => void
  onDelete: () => void
  onOpenDocumentsTab?: () => void
}

export function JobDetailSidebar({
  job,
  dl,
  isCancelled,
  isAdmin,
  cat2Exporting,
  revisionFamily,
  onAssign,
  onEdit,
  onCreateQuote,
  onAttachExistingQuote,
  onCat2Export,
  onDelete,
  onOpenDocumentsTab,
}: JobDetailSidebarProps) {
  const router = useRouter()

  const revisions = revisionFamily?.revisions ?? []
  const revisionFees = revisions.reduce((sum, r) => sum + (r.quoteValue ?? 0), 0)

  const originalQuote = job.quoteValue
  const originalCommercialTotal = totalJobCommercialValue(job) ?? 0
  const totalQuoted = originalCommercialTotal + revisionFees

  const totalInvoiced = (() => {
    const parts: number[] = []
    if (job.billingStatus === "INVOICED") {
      parts.push(totalJobCommercialValue(job) ?? 0)
    }
    for (const r of revisions) {
      if (r.billingStatus === "INVOICED") parts.push(r.quoteValue ?? 0)
    }
    return parts.reduce((a, b) => a + b, 0)
  })()

  const outstanding = totalQuoted - totalInvoiced

  const currentEntry = revisionFamily?.chain.find(e => e.isCurrent) ?? null
  const currentRevisionId = currentEntry?.id ?? job.currentRevision?.id ?? null
  const originalRevisionId = revisionFamily?.original?.id ?? job.id

  const scrollToRevisionRow = (revisionId: string | null) => {
    if (!revisionId) return
    const el = document.getElementById(`revision-row-${revisionId}`)
    el?.scrollIntoView({ behavior: "smooth", block: "center" })
  }

  return (
    <div className="lg:col-span-3 space-y-6 lg:sticky lg:top-24 self-start">
      <section className="rounded-xl border border-bd bg-sr p-6">
        <h2 className="text-base font-semibold text-t1 mb-4">Actions</h2>
        {isCancelled ? (
          <p className="text-xs text-t3">
            This job is cancelled. Restore it to make changes or return it to active views.
          </p>
        ) : (
          <div className="space-y-2">
            <Button
              variant={job.designer ? "outline" : "primary"}
              size="sm"
              className="w-full justify-start"
              onClick={onAssign}
            >
              <UserPlus className="h-3.5 w-3.5" />
              {job.designer ? "Change designer" : "Assign designer"}
            </Button>

            <Button variant="outline" size="sm" className="w-full justify-start" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>

            <Button variant="outline" size="sm" className="w-full justify-start" onClick={onCreateQuote}>
              <FileText className="h-3.5 w-3.5" /> Create Quote
            </Button>

            <Button variant="outline" size="sm" className="w-full justify-start" onClick={onAttachExistingQuote}>
              <FileText className="h-3.5 w-3.5" /> Attach Existing Quote
            </Button>

            {(job.status === "ISSUED" || job.currentRevision?.status === "ISSUED") && (
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={onCat2Export}
                loading={cat2Exporting}
              >
                <Download className="h-3.5 w-3.5" /> Export
              </Button>
            )}

            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-dn hover:bg-dn-bg"
                onClick={onDelete}
              >
                <Trash2 className="h-3.5 w-3.5" /> Cancel job
              </Button>
            )}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-bd bg-sr p-6">
        <h2 className="text-base font-semibold text-t1 mb-4">Financial Summary</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-t3">Original Design Fee</span>
            <span className="font-semibold tabular-nums text-t1">{originalQuote != null ? formatGBP(originalQuote) : "—"}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-t3">Total Revision Fees</span>
            <span className="font-semibold tabular-nums text-t1">{revisions.length ? formatGBP(revisionFees) : "—"}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-t3">Total Quoted</span>
            <span className="font-semibold tabular-nums text-t1">{formatGBP(totalQuoted) ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-t3">Total Invoiced</span>
            <span className="font-semibold tabular-nums text-ok">{formatGBP(totalInvoiced) ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between text-xs pt-3 border-t border-bd">
            <span className="text-t3">Outstanding</span>
            <span className="font-semibold tabular-nums text-t1">{formatGBP(outstanding) ?? "—"}</span>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-bd bg-sr p-6">
        <h2 className="text-base font-semibold text-t1 mb-4">Important Dates</h2>
        <dl className="space-y-2">
          <div className="flex justify-between text-xs">
            <dt className="text-t3">Created</dt>
            <dd className="font-medium text-t1 tabular-nums">{format(new Date(job.dateCreated), "d MMM yyyy")}</dd>
          </div>

          <div className="flex justify-between text-xs">
            <dt className="text-t3">Completed</dt>
            <dd className="font-medium text-t1 tabular-nums">
              {job.currentRevision?.dateCompleted
                ? format(parseLocalDate(job.currentRevision.dateCompleted), "d MMM yyyy")
                : job.dateCompleted
                  ? format(parseLocalDate(job.dateCompleted), "d MMM yyyy")
                  : "—"}
            </dd>
          </div>

          <div className="flex justify-between text-xs">
            <dt className="text-t3">Deadline</dt>
            <dd className="font-medium text-t1 tabular-nums">
              {job.requiredByDate ? format(parseLocalDate(job.requiredByDate), "d MMM yyyy") : "—"}
              {dl.severity !== "none" ? (
                <span className={cn(
                  "ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  dl.severity === "overdue" ? "bg-dn-bg text-dn-tx border border-dn-bd" : dl.severity === "today" ? "bg-wn-bg text-wn-tx border border-wn-bd" : "bg-pg text-t2 border border-bd",
                )}>
                  {dl.label}
                </span>
              ) : null}
            </dd>
          </div>

          <div className="flex justify-between text-xs">
            <dt className="text-t3">Last Updated</dt>
            <dd className="font-medium text-t1 tabular-nums">{format(new Date(job.updatedAt), "d MMM yyyy")}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-bd bg-sr p-6">
        <h2 className="text-base font-semibold text-t1 mb-4">Assignment</h2>
        <dl className="space-y-2 text-xs">
          <div className="flex justify-between">
            <dt className="text-t3">Designer</dt>
            <dd className="font-medium text-t1 tabular-nums">{job.currentRevision?.designer?.trim() || job.designer?.trim() || "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-t3">Checker</dt>
            <dd className="font-medium text-t1 tabular-nums">—</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-t3">CAT III Reviewer</dt>
            <dd className="font-medium text-t1 tabular-nums">—</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-bd bg-sr p-6">
        <h2 className="text-base font-semibold text-t1 mb-4">Quick Links</h2>
        <div className="space-y-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={() => scrollToRevisionRow(originalRevisionId)}
            disabled={!originalRevisionId}
          >
            <GitBranch className="h-3.5 w-3.5" /> View Parent Job
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={() => scrollToRevisionRow(currentRevisionId)}
            disabled={!currentRevisionId}
          >
            <GitBranch className="h-3.5 w-3.5" /> View Current Revision
          </Button>
        </div>
      </section>

      <section className="rounded-xl border border-bd bg-sr p-6">
        <h2 className="text-base font-semibold text-t1 mb-4">Linked Records</h2>
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-t3 flex items-center gap-2">
                <Receipt className="h-3.5 w-3.5 text-t4" /> Quote
              </p>
              <p className="text-sm font-semibold text-t1 truncate mt-1">
                {job.currentQuote?.quoteNumber ?? job.quoteReference ?? "—"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                const q = job.currentQuote?.quoteNumber ?? job.quoteReference
                if (!q) return
                router.push(`/quotes?search=${encodeURIComponent(q)}`)
              }}
              disabled={!(job.currentQuote?.quoteNumber ?? job.quoteReference)}
              aria-label="View quote"
            >
              <span className="text-t4">↗</span>
            </Button>
          </div>

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-t3 flex items-center gap-2">
                <Receipt className="h-3.5 w-3.5 text-t4" /> Invoices
              </p>
              <div className="mt-1">
                <span className="text-sm font-semibold text-t1">
                  {job.currentRevision?.billingStatus ? invoiceLabel(job.currentRevision.billingStatus) : "—"}
                </span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => router.push("/billing")}
              aria-label="View invoices"
            >
              <span className="text-t4">↗</span>
            </Button>
          </div>

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-t3 flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-t4" /> Documents
              </p>
              <p className="text-sm text-t2 mt-1">Job documents</p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onOpenDocumentsTab?.()}
              aria-label="Open documents tab"
            >
              <span className="text-t4">↗</span>
            </Button>
          </div>

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-t3 flex items-center gap-2">
                <Building2 className="h-3.5 w-3.5 text-t4" /> Client
              </p>
              <p className="text-sm font-semibold text-t1 truncate mt-1">{job.clientCompany}</p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => job.clientId && router.push(`/clients/${job.clientId}`)}
              disabled={!job.clientId}
              aria-label="Open client"
            >
              <span className="text-t4">↗</span>
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
