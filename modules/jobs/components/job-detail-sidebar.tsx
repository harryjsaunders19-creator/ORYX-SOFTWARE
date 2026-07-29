"use client"
import { useRouter } from "next/navigation"
import { Button } from "@/shared/ui/button"
import type { Job } from "@/lib/types"
import type { RevisionFamilyResponse } from "../types/revision-types"
import { invoiceLabel } from "./parent-job-helpers"

interface JobDetailSidebarProps {
  job: Job & { currentRevision?: Job | null }
  isCancelled: boolean
  isAdmin: boolean
  cat2Exporting: boolean
  canExportCat2: boolean
  canAddRevision: boolean
  revisionFamily: RevisionFamilyResponse | null
  onAssign: () => void
  onEdit: () => void
  onCreateQuote: () => void
  onAttachExistingQuote: () => void
  onAddRevision: () => void
  onCat2Export: () => void
  onDelete: () => void
  onOpenDocumentsTab: () => void
  onOpenRevisionsTab: () => void
}

export function JobDetailSidebar({
  job,
  isCancelled,
  isAdmin,
  cat2Exporting,
  canExportCat2,
  canAddRevision,
  revisionFamily,
  onAssign,
  onEdit,
  onCreateQuote,
  onAttachExistingQuote,
  onAddRevision,
  onCat2Export,
  onDelete,
  onOpenDocumentsTab,
  onOpenRevisionsTab,
}: JobDetailSidebarProps) {
  const router = useRouter()
  const originalId = revisionFamily?.original?.id ?? job.id
  const currentId = revisionFamily?.chain.find(e => e.isCurrent)?.id ?? job.currentRevision?.id ?? job.id

  const scrollToRevision = (id: string) => {
    onOpenRevisionsTab()
    requestAnimationFrame(() => {
      document.getElementById(`revision-row-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
    })
  }

  return (
    <aside className="lg:col-span-3 space-y-4 lg:sticky lg:top-24 self-start">
      <section className="rounded-lg border border-[#E5E7EB] bg-white px-4 py-4">
        <h2 className="text-sm font-semibold text-t1 mb-3">Actions</h2>
        {isCancelled ? (
          <p className="text-xs text-t3">Restore this job to make changes.</p>
        ) : (
          <div className="space-y-1.5">
            <Button variant="outline" size="sm" className="w-full justify-start" onClick={onAssign}>
              {job.designer ? "Change designer" : "Assign designer"}
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-start" onClick={onCreateQuote}>
              Create quote
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-start" onClick={onEdit}>
              Edit job
            </Button>
            {canAddRevision && (
              <Button variant="outline" size="sm" className="w-full justify-start" onClick={onAddRevision}>
                Add revision
              </Button>
            )}
            <Button variant="ghost" size="sm" className="w-full justify-start text-t3" onClick={onAttachExistingQuote}>
              Attach quote
            </Button>
            {canExportCat2 && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-t3"
                onClick={onCat2Export}
                loading={cat2Exporting}
              >
                Export CAT II
              </Button>
            )}
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-dn hover:bg-dn-bg"
                onClick={onDelete}
              >
                Cancel job
              </Button>
            )}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-[#E5E7EB] bg-white px-4 py-4">
        <h2 className="text-sm font-semibold text-t1 mb-3">Quick links</h2>
        <div className="space-y-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-t2"
            onClick={() => scrollToRevision(originalId)}
          >
            Original
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-t2"
            onClick={() => scrollToRevision(currentId)}
          >
            Current revision
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-t2"
            onClick={onOpenDocumentsTab}
          >
            Documents
          </Button>
        </div>
      </section>

      <section className="rounded-lg border border-[#E5E7EB] bg-white px-4 py-4">
        <h2 className="text-sm font-semibold text-t1 mb-3">Linked records</h2>
        <ul className="space-y-3 text-sm">
          <li className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-t4">Quote</p>
              <p className="font-medium text-t1 truncate">
                {job.currentQuote?.quoteNumber ?? job.quoteReference ?? "—"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={!(job.currentQuote?.quoteNumber ?? job.quoteReference)}
              onClick={() => {
                const q = job.currentQuote?.quoteNumber ?? job.quoteReference
                if (q) router.push(`/quotes?search=${encodeURIComponent(q)}`)
              }}
            >
              Open
            </Button>
          </li>
          <li className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-t4">Invoice</p>
              <p className="font-medium text-t1">
                {invoiceLabel(job.currentRevision?.billingStatus ?? job.billingStatus ?? "")}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => router.push("/billing")}>
              Open
            </Button>
          </li>
          <li className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-t4">Client</p>
              <p className="font-medium text-t1 truncate">{job.clientCompany}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={!job.clientId}
              onClick={() => job.clientId && router.push(`/clients/${job.clientId}`)}
            >
              Open
            </Button>
          </li>
        </ul>
      </section>
    </aside>
  )
}
