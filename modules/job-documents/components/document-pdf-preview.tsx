"use client"

import { Download, X } from "lucide-react"
import type { JobDocumentRow } from "../types"

export function DocumentPdfPreview({
  doc,
  jobId,
  onClose,
}: {
  doc: JobDocumentRow
  jobId: string
  onClose: () => void
}) {
  const src = `/api/jobs/${jobId}/documents/${doc.id}/preview`
  return (
    <div className="fixed inset-0 z-[280] flex flex-col bg-black/80" role="dialog" aria-modal="true">
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <p className="text-sm font-semibold truncate">{doc.filename}</p>
        <div className="flex items-center gap-2">
          <a
            href={`/api/jobs/${jobId}/documents/${doc.id}/download`}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/20 px-2.5 py-1.5 text-xs hover:bg-white/10"
          >
            <Download className="h-3.5 w-3.5" /> Download
          </a>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 hover:bg-white/10" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      <iframe title={doc.filename} src={src} className="flex-1 w-full bg-white" />
    </div>
  )
}
