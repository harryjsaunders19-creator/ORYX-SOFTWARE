"use client"
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
  onEditDrawingNumber: () => void
}

function ActionButton({
  children,
  onClick,
  variant = "outline",
  loading,
}: {
  children: React.ReactNode
  onClick: () => void
  variant?: "primary" | "outline"
  loading?: boolean
}) {
  return (
    <Button
      variant={variant}
      size="md"
      loading={loading}
      onClick={onClick}
      className="w-full justify-center font-bold rounded-md h-11"
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
  onEditDrawingNumber,
}: JobDetailSidebarProps) {
  return (
    <aside className="w-full lg:w-auto space-y-6 lg:sticky lg:top-6 self-start">
      <div className="space-y-3">
        <p className={cn(Typography.Helper, "uppercase tracking-[0.05em] text-t3 px-1 mb-2")}>
          Primary Actions
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
              <span>Attach Quote</span>
            </ActionButton>
            {canExportCat2 && (
              <ActionButton onClick={onCat2Export} loading={cat2Exporting}>
                <Download className="h-4 w-4" aria-hidden />
                <span>Export CAT II</span>
              </ActionButton>
            )}
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
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onDelete}
                  className={cn(
                    Typography.Helper,
                    "w-full py-2.5 text-t3 font-bold uppercase tracking-widest",
                    "flex items-center justify-center gap-2 rounded-md",
                    "hover:text-dn hover:bg-dn-bg hover:border-dn-bd border border-transparent transition-colors",
                  )}
                >
                  <Trash2 className="h-3 w-3" aria-hidden />
                  Cancel Job
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <JobDetailSummary job={job} revisionFamily={revisionFamily} />
    </aside>
  )
}
