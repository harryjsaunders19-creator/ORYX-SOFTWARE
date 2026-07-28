"use client"

import { format } from "date-fns"
import { Download, Mail } from "lucide-react"
import type { JobDocumentRow } from "../types"

export function DocumentEmailCard({
  doc,
  jobId,
}: {
  doc: JobDocumentRow
  jobId: string
}) {
  return (
    <div className="rounded-lg border border-bd bg-pg/40 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <Mail className="h-4 w-4 text-ac mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-t1 truncate">
            {doc.emailSubject || doc.filename}
          </p>
          {doc.emailFrom && (
            <p className="text-xs text-t3 truncate">From {doc.emailFrom}</p>
          )}
          {doc.emailDate && (
            <p className="type-helper text-t4">
              {format(new Date(doc.emailDate), "d MMM yyyy HH:mm")}
            </p>
          )}
        </div>
      </div>
      {doc.emailPreview && (
        <p className="text-xs text-t3 line-clamp-3">{doc.emailPreview}</p>
      )}
      {doc.parseStatus === "failed" && (
        <p className="type-helper text-wn-tx">
          Email metadata could not be extracted — original file still available.
        </p>
      )}
      <a
        href={`/api/jobs/${jobId}/documents/${doc.id}/download`}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-ac hover:underline"
      >
        <Download className="h-3.5 w-3.5" /> Download original
      </a>
    </div>
  )
}
