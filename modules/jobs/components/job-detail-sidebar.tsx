"use client"
import { useRouter } from "next/navigation"
import {
  FilePlus2,
  Paperclip,
  Download,
  Trash2,
  UserPlus,
  Pencil,
  Plus,
} from "lucide-react"
import { Button } from "@/shared/ui/button"
import { cn } from "@/shared/utils/utils"
import { Typography } from "@/shared/design/typography"
import type { Job } from "@/lib/types"
import type { RevisionFamilyResponse } from "../types/revision-types"
import { invoiceLabel } from "./parent-job-helpers"
import { JobDetailSummary } from "./job-detail-summary"

interface JobDetailSidebarProps {
  job: Job & { currentRevision?: Job | null }
  isCancelled: boolean
  isAdmin: boolean
  cat2Exporting: boolean
  canExportCat2: boolean
  canAddRevision: boolean
  hasDesigner: boolean
  revisionFamily: RevisionFamilyResponse | null
  onAssign: () => void
  onEdit: () => void
  onCreateQuote: () => void
  onAttachExistingQuote: () => void
  onAddRevision: () => void
  onCat2Export: () => void
  onDelete: () => void
  onOpenDocumentsTab: () => void
  onEditDrawingNumber: () => void
}

function ActionButton({
  children,
  onClick,
  variant = "outline",
  loading,
  danger,
}: {
  children: React.ReactNode
  onClick: () => void
  variant?: "primary" | "outline"
  loading?: boolean
  danger?: boolean
}) {
  return (
    <Button
      variant={danger ? "outline" : variant}
      size="md"
      loading={loading}
      onClick={onClick}
      className={cn(
        "w-full justify-center font-bold rounded-md h-11",
        danger && "border-dn-bd text-dn hover:bg-dn-bg hover:text-dn-tx",
      )}
    >
      {children}
    </Button>
  )
}

export function JobDetailSidebar({
  job,
  isCancelled,
  isAdmin,
  cat2Exporting,
  canExportCat2,
  canAddRevision,
  hasDesigner,
  revisionFamily,
  onAssign,
  onEdit,
  onCreateQuote,
  onAttachExistingQuote,
  onAddRevision,
  onCat2Export,
  onDelete,
  onOpenDocumentsTab,
  onEditDrawingNumber,
}: JobDetailSidebarProps) {
  const router = useRouter()
  const quoteRef = job.currentQuote?.quoteNumber ?? job.quoteReference
  const invoice = invoiceLabel(job.currentRevision?.billingStatus ?? job.billingStatus ?? "")

  return (
    <aside className="space-y-8 lg:sticky lg:top-6 self-start">
      <div className="space-y-3">
        <p className={cn(Typography.Helper, "uppercase tracking-[0.05em] text-t3 px-1 mb-2")}>
          Actions
        </p>
        {isCancelled ? (
          <p className={cn(Typography.Helper, "text-t3 px-1")}>Restore this job to make changes.</p>
        ) : (
          <div className="space-y-3">
            <ActionButton variant="primary" onClick={onAssign}>
              <UserPlus className="h-4 w-4" aria-hidden />
              <span>{hasDesigner ? "Change Designer" : "Assign Designer"}</span>
            </ActionButton>
            <ActionButton onClick={onCreateQuote}>
              <FilePlus2 className="h-4 w-4" aria-hidden />
              <span>Create Quote</span>
            </ActionButton>
            <ActionButton onClick={onAttachExistingQuote}>
              <Paperclip className="h-4 w-4" aria-hidden />
              <span>Attach Existing Quote</span>
            </ActionButton>
            <ActionButton onClick={onEdit}>
              <Pencil className="h-4 w-4" aria-hidden />
              <span>Edit Job</span>
            </ActionButton>
            {canAddRevision && (
              <ActionButton onClick={onAddRevision}>
                <Plus className="h-4 w-4" aria-hidden />
                <span>Add Revision</span>
              </ActionButton>
            )}
            {canExportCat2 && (
              <ActionButton onClick={onCat2Export} loading={cat2Exporting}>
                <Download className="h-4 w-4" aria-hidden />
                <span>Export CAT II Check Sheet</span>
              </ActionButton>
            )}
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-center text-t3"
                onClick={onEditDrawingNumber}
              >
                Edit drawing number
              </Button>
            )}
            {isAdmin && (
              <ActionButton danger onClick={onDelete}>
                <Trash2 className="h-4 w-4" aria-hidden />
                <span>Cancel Job</span>
              </ActionButton>
            )}
          </div>
        )}
      </div>

      <JobDetailSummary job={job} revisionFamily={revisionFamily} />

      <section className="rounded-xl border border-bd bg-sr p-5 space-y-4">
        <h3
          className={cn(
            Typography.Small,
            "font-bold uppercase tracking-wider text-t1 border-b border-surface-low pb-3",
          )}
        >
          Linked Records
        </h3>
        <ul className="space-y-4">
          <li className="flex items-center justify-between gap-2 text-sm">
            <span className={cn(Typography.Small, "text-t3")}>Quote</span>
            {quoteRef ? (
              <button
                type="button"
                className={cn(Typography.Small, "font-bold underline text-t1 hover:text-t2")}
                onClick={() => router.push(`/quotes?search=${encodeURIComponent(quoteRef)}`)}
              >
                {quoteRef}
              </button>
            ) : (
              <span className="text-t3">—</span>
            )}
          </li>
          <li className="flex items-center justify-between gap-2 text-sm">
            <span className={cn(Typography.Small, "text-t3")}>Invoices</span>
            {invoice !== "—" ? (
              <button
                type="button"
                className={cn(Typography.Small, "font-bold underline text-t1 hover:text-t2")}
                onClick={() => router.push("/billing")}
              >
                {invoice}
              </button>
            ) : (
              <span className="text-t3">—</span>
            )}
          </li>
          <li className="flex items-center justify-between gap-2 text-sm">
            <span className={cn(Typography.Small, "text-t3")}>Documents</span>
            <button
              type="button"
              className={cn(Typography.Small, "font-bold underline text-t1 hover:text-t2")}
              onClick={onOpenDocumentsTab}
            >
              Job documents
            </button>
          </li>
          <li className="flex items-center justify-between gap-2 text-sm">
            <span className={cn(Typography.Small, "text-t3")}>Client</span>
            {job.clientId ? (
              <button
                type="button"
                className={cn(Typography.Small, "font-bold underline text-t1 hover:text-t2 truncate max-w-[60%]")}
                onClick={() => router.push(`/clients/${job.clientId}`)}
              >
                {job.clientCompany}
              </button>
            ) : (
              <span className={cn(Typography.Small, "font-semibold text-t1 truncate max-w-[60%]")}>
                {job.clientCompany}
              </span>
            )}
          </li>
        </ul>
      </section>
    </aside>
  )
}
