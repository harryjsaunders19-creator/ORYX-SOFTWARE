"use client"

import { format } from "date-fns"
import { Loader2, Download, Pencil, FolderInput, Trash2, Eye } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { documentKind } from "../constants"
import type { JobDocumentRow } from "../types"
import { formatSize, DocIcon } from "./job-documents-helpers"
import { DocumentEmailCard } from "./document-email-card"

export function JobDocumentsList({
  docs,
  loading,
  jobId,
  writeOk,
  onPreview,
  onRename,
  onCategory,
  onDelete,
}: {
  docs: JobDocumentRow[]
  loading: boolean
  jobId: string
  writeOk: boolean
  onPreview: (doc: JobDocumentRow) => void
  onRename: (doc: JobDocumentRow) => void
  onCategory: (doc: JobDocumentRow) => void
  onDelete: (doc: JobDocumentRow) => void
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-t4">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  if (docs.length === 0) {
    return <p className="text-base text-t4 py-8 text-center">No documents match these filters.</p>
  }

  return (
    <ul className="space-y-3">
      {docs.map(doc => {
        const kind = documentKind(doc.mimeType, doc.fileExt)
        return (
          <li
            key={doc.id}
            className="rounded-lg border border-bd bg-sr p-3.5 flex flex-col sm:flex-row gap-3"
          >
            <div className="shrink-0">
              {kind === "images" ? (
                <button
                  type="button"
                  onClick={() => onPreview(doc)}
                  className="block h-16 w-16 rounded-md overflow-hidden border border-bd bg-pg"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/jobs/${jobId}/documents/${doc.id}/preview`}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </button>
              ) : (
                <div className="h-16 w-16 rounded-md border border-bd bg-pg flex items-center justify-center">
                  <DocIcon doc={doc} />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-1.5">
              {kind === "emails" && (doc.emailSubject || doc.emailFrom) ? (
                <DocumentEmailCard doc={doc} jobId={jobId} />
              ) : (
                <>
                  <p className="text-base font-semibold text-t1 truncate">{doc.filename}</p>
                  <p className="text-sm text-t3 flex flex-wrap gap-x-2 gap-y-0.5">
                    <span className="font-medium text-t2">{doc.category}</span>
                    <span>·</span>
                    <span>{doc.uploadedByName}</span>
                    <span>·</span>
                    <span>{format(new Date(doc.createdAt), "d MMM yyyy HH:mm")}</span>
                    <span>·</span>
                    <span>{formatSize(doc.fileSize)}</span>
                    {doc.revisionLetter && (
                      <>
                        <span>·</span>
                        <span>Rev {doc.revisionLetter}</span>
                      </>
                    )}
                  </p>
                </>
              )}

              <div className="flex flex-wrap gap-1.5 pt-1">
                <Button type="button" size="sm" variant="ghost" onClick={() => onPreview(doc)}>
                  <Eye className="h-3.5 w-3.5" /> Preview
                </Button>
                <a
                  href={`/api/jobs/${jobId}/documents/${doc.id}/download`}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-t3 hover:text-t1 px-2 py-1.5"
                >
                  <Download className="h-3.5 w-3.5" /> Download
                </a>
                {writeOk && (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => onRename(doc)}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Rename
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => onCategory(doc)}
                    >
                      <FolderInput className="h-3.5 w-3.5" /> Category
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => onDelete(doc)}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </Button>
                  </>
                )}
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
