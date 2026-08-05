"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
  type DragEvent,
} from "react"
import { useToast } from "@/shared/ui/toast"
import { useUser } from "@/shared/providers/user-context"
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value"
import { TablePagination } from "@/shared/layouts/page-layout"
import {
  JOB_DOC_LIST_PAGE_SIZE,
  documentKind,
  type DocumentKindFilter,
  type DocumentPeriodFilter,
  type DocumentScopeFilter,
} from "../constants"
import type { JobDocumentRow } from "../types"
import { collectDroppedFilesFromCapture, captureDropDataSync } from "../collect-dropped-files"
import { DocumentLightbox } from "./document-lightbox"
import { DocumentPdfPreview } from "./document-pdf-preview"
import { JobDocumentsUploadZone } from "./job-documents-upload-zone"
import { JobDocumentsFilters } from "./job-documents-filters"
import { JobDocumentsList } from "./job-documents-list"
import { RenameDocumentDialog, MoveCategoryDialog, DeleteDocumentDialog } from "./job-documents-dialogs"
import { hasFullAccess } from "@/shared/auth/permissions"

type ListResponse = {
  documents: JobDocumentRow[]
  total: number
  page: number
  limit: number
  pages: number
}

export function JobDocumentsPanel({
  jobId,
  canWrite = true,
  showTitle = true,
  onTimelineChange,
}: {
  jobId: string
  canWrite?: boolean
  showTitle?: boolean
  onTimelineChange?: () => void
}) {
  const { toast } = useToast()
  const { user } = useUser()
  const writeOk = canWrite && !!user && (hasFullAccess(user.role) || user.role === "ENGINEER")

  const [docs, setDocs] = useState<JobDocumentRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const [q, setQ] = useState("")
  const debouncedQ = useDebouncedValue(q, 250)
  const [category, setCategory] = useState<string>("ALL")
  const [kind, setKind] = useState<"" | DocumentKindFilter>("")
  const [scope, setScope] = useState<DocumentScopeFilter>("all")
  const [period, setPeriod] = useState<DocumentPeriodFilter>("all")
  const [attachToRevision, setAttachToRevision] = useState(false)
  const [uploadCategory, setUploadCategory] = useState("General")

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [pdfDoc, setPdfDoc] = useState<JobDocumentRow | null>(null)
  const [renameDoc, setRenameDoc] = useState<JobDocumentRow | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [categoryDoc, setCategoryDoc] = useState<JobDocumentRow | null>(null)
  const [categoryValue, setCategoryValue] = useState("General")
  const [deleteDoc, setDeleteDoc] = useState<JobDocumentRow | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async (pageNum = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(pageNum),
        limit: String(JOB_DOC_LIST_PAGE_SIZE),
        scope,
        period,
      })
      if (debouncedQ.trim()) params.set("q", debouncedQ.trim())
      if (category !== "ALL") params.set("category", category)
      if (kind) params.set("kind", kind)

      const res = await fetch(`/api/jobs/${jobId}/documents?${params}`)
      if (!res.ok) throw new Error("Failed to load documents")
      const data = await res.json() as ListResponse
      startTransition(() => {
        setDocs(data.documents ?? [])
        setTotal(data.total ?? 0)
        setPage(data.page ?? 1)
        setPages(data.pages ?? 1)
      })
    } catch {
      toast("Could not load documents", "error")
    } finally {
      setLoading(false)
    }
  }, [jobId, debouncedQ, category, kind, scope, period, toast])

  useEffect(() => { void load(1) }, [load])

  const imageDocs = useMemo(
    () => docs.filter(d => documentKind(d.mimeType, d.fileExt) === "images"),
    [docs],
  )

  const uploadFiles = async (fileList: FileList | File[]) => {
    if (!writeOk) return
    const files = Array.from(fileList).filter(f => f.size > 0)
    if (!files.length) {
      toast("No files to upload", "error")
      return
    }
    setUploading(true)
    try {
      const form = new FormData()
      for (const file of files) form.append("files", file)
      form.append("category", uploadCategory)
      if (attachToRevision) form.append("attachToRevision", "true")

      const res = await fetch(`/api/jobs/${jobId}/documents`, { method: "POST", body: form })
      const data = await res.json().catch(() => ({})) as {
        documents?: JobDocumentRow[]
        errors?: Array<{ name: string; error: string }>
        error?: string
      }

      const uploaded = data.documents?.length ?? 0
      if (uploaded) {
        toast(uploaded === 1 ? "Document uploaded" : `${uploaded} documents uploaded`, "success")
        onTimelineChange?.()
        await load(1)
      }
      if (!res.ok && !uploaded) {
        toast(data.error ?? data.errors?.[0]?.error ?? "Upload failed", "error")
      } else if (data.errors?.length) {
        toast(data.errors[0].error, "error")
      }
    } catch {
      toast("Upload failed", "error")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    if (!writeOk || uploading) return
    const capture = captureDropDataSync(e.dataTransfer)
    void (async () => {
      const { files, rejected } = await collectDroppedFilesFromCapture(capture)
      if (!files.length) {
        toast(
          rejected.some(n => /\.(msg|eml)$/i.test(n))
            ? "Email files aren't supported — print to PDF and upload that"
            : "Only PDF and image files can be uploaded",
          "error",
        )
        return
      }
      if (rejected.length) {
        toast("Skipped non-PDF/image files (including emails)", "error")
      }
      await uploadFiles(files)
    })()
  }

  const handleRename = async () => {
    if (!renameDoc || !renameValue.trim()) return
    const res = await fetch(`/api/jobs/${jobId}/documents/${renameDoc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: renameValue.trim() }),
    })
    if (!res.ok) { toast("Rename failed", "error"); return }
    toast("Renamed", "success")
    setRenameDoc(null)
    await load(page)
  }

  const handleCategory = async () => {
    if (!categoryDoc) return
    const res = await fetch(`/api/jobs/${jobId}/documents/${categoryDoc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: categoryValue }),
    })
    if (!res.ok) { toast("Could not update category", "error"); return }
    toast("Category updated", "success")
    setCategoryDoc(null)
    await load(page)
  }

  const handleDelete = async () => {
    if (!deleteDoc) return
    const res = await fetch(`/api/jobs/${jobId}/documents/${deleteDoc.id}`, { method: "DELETE" })
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string }
      toast(body.error ?? "Delete failed", "error")
      return
    }
    toast("Document deleted", "success")
    setDeleteDoc(null)
    onTimelineChange?.()
    await load(1)
  }

  const openPreview = (doc: JobDocumentRow) => {
    const kind = documentKind(doc.mimeType, doc.fileExt)
    if (kind === "images") {
      const idx = imageDocs.findIndex(d => d.id === doc.id)
      setLightboxIndex(idx >= 0 ? idx : 0)
      return
    }
    if (kind === "pdfs") {
      setPdfDoc(doc)
      return
    }
    window.open(`/api/jobs/${jobId}/documents/${doc.id}/download`, "_blank")
  }

  return (
    <div className="space-y-5">
      <JobDocumentsUploadZone
        writeOk={writeOk}
        showTitle={showTitle}
        total={total}
        uploading={uploading}
        uploadCategory={uploadCategory}
        onUploadCategoryChange={setUploadCategory}
        attachToRevision={attachToRevision}
        onAttachToRevisionChange={setAttachToRevision}
        fileInputRef={fileInputRef}
        onFilesSelected={files => void uploadFiles(files)}
        dragOver={dragOver}
        onDragEnter={e => {
          e.preventDefault()
          e.stopPropagation()
          setDragOver(true)
        }}
        onDragOver={e => {
          e.preventDefault()
          e.stopPropagation()
          e.dataTransfer.dropEffect = "copy"
          setDragOver(true)
        }}
        onDragLeave={e => {
          e.preventDefault()
          if (e.currentTarget.contains(e.relatedTarget as Node)) return
          setDragOver(false)
        }}
        onDrop={handleDrop}
      />

      <JobDocumentsFilters
        q={q}
        onQChange={setQ}
        scope={scope}
        onScopeChange={setScope}
        kind={kind}
        onKindChange={setKind}
        category={category}
        onCategoryChange={setCategory}
        period={period}
        onPeriodChange={setPeriod}
      />

      <JobDocumentsList
        docs={docs}
        loading={loading}
        jobId={jobId}
        writeOk={writeOk}
        onPreview={openPreview}
        onRename={doc => { setRenameDoc(doc); setRenameValue(doc.filename) }}
        onCategory={doc => { setCategoryDoc(doc); setCategoryValue(doc.category) }}
        onDelete={doc => setDeleteDoc(doc)}
      />

      <TablePagination
        variant="bare"
        page={page}
        totalPages={pages}
        onPageChange={p => void load(p)}
        total={total}
        pageSize={JOB_DOC_LIST_PAGE_SIZE}
      />

      {lightboxIndex != null && imageDocs[lightboxIndex] && (
        <DocumentLightbox
          images={imageDocs}
          index={lightboxIndex}
          jobId={jobId}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
      {pdfDoc && (
        <DocumentPdfPreview doc={pdfDoc} jobId={jobId} onClose={() => setPdfDoc(null)} />
      )}

      <RenameDocumentDialog
        doc={renameDoc}
        value={renameValue}
        onValueChange={setRenameValue}
        onClose={() => setRenameDoc(null)}
        onConfirm={() => void handleRename()}
      />

      <MoveCategoryDialog
        doc={categoryDoc}
        value={categoryValue}
        onValueChange={setCategoryValue}
        onClose={() => setCategoryDoc(null)}
        onConfirm={() => void handleCategory()}
      />

      <DeleteDocumentDialog
        doc={deleteDoc}
        onClose={() => setDeleteDoc(null)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  )
}
