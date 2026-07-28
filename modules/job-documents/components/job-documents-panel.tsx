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
import { format } from "date-fns"
import {
  Upload, Search, FileText, Image as ImageIcon, File, Trash2,
  Download, Pencil, FolderInput, Loader2, X, Eye,
} from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/shared/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogDescription, DialogBody,
} from "@/shared/ui/dialog"
import { useToast } from "@/shared/ui/toast"
import { useUser } from "@/shared/providers/user-context"
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value"
import { cn } from "@/shared/utils/utils"
import { TablePagination } from "@/shared/layouts/page-layout"
import {
  JOB_DOCUMENT_CATEGORIES,
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
import { DocumentEmailCard } from "./document-email-card"

type ListResponse = {
  documents: JobDocumentRow[]
  total: number
  page: number
  limit: number
  pages: number
}

const KIND_CHIPS: Array<{ value: "" | DocumentKindFilter; label: string }> = [
  { value: "", label: "All types" },
  { value: "images", label: "Images" },
  { value: "pdfs", label: "PDFs" },
  { value: "emails", label: "Emails" },
  { value: "drawings", label: "Drawings" },
  { value: "calculations", label: "Calculations" },
  { value: "other", label: "Other" },
]

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function DocIcon({ doc }: { doc: JobDocumentRow }) {
  const kind = documentKind(doc.mimeType, doc.fileExt)
  if (kind === "images") return <ImageIcon className="h-4 w-4 text-ac" />
  if (kind === "emails") return <FileText className="h-4 w-4 text-ac" />
  if (kind === "pdfs") return <FileText className="h-4 w-4 text-dn" />
  return <File className="h-4 w-4 text-t3" />
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
  const writeOk = canWrite && (user?.role === "ADMIN" || user?.role === "ENGINEER")

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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {showTitle ? (
            <h2 className="text-lg font-semibold text-t1">Documents</h2>
          ) : null}
          <p className={cn("text-sm text-t3", showTitle ? "mt-0.5" : "")}>
            {total} file{total === 1 ? "" : "s"} — PDFs and images (print emails to PDF)
          </p>
        </div>
        {writeOk && (
          <div className="flex flex-wrap items-center gap-2">
            <Select value={uploadCategory} onValueChange={setUploadCategory}>
              <SelectTrigger className="h-9 w-[160px] text-sm">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {JOB_DOCUMENT_CATEGORIES.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-1.5 text-sm text-t3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={attachToRevision}
                onChange={e => setAttachToRevision(e.target.checked)}
                className="rounded border-bd"
              />
              Current revision
            </label>
            <Button
              type="button"
              size="sm"
              variant="primary"
              loading={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" /> Upload
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,application/pdf,image/*"
              className="hidden"
              onChange={e => e.target.files && void uploadFiles(e.target.files)}
            />
          </div>
        )}
      </div>

      {writeOk && (
        <div
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
          onDrop={e => { handleDrop(e) }}
          className={cn(
            "rounded-lg border border-dashed px-4 py-7 text-center transition-colors",
            dragOver ? "border-ac bg-ac/5" : "border-bd bg-pg/30",
            uploading && "pointer-events-none opacity-60",
          )}
        >
          <p className="text-base text-t2">Drag & drop PDFs or images here</p>
          <p className="text-sm text-t4 mt-1">
            For emails, print to PDF first — then upload. Up to 50 MB each.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-t4" />
          <Input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search filename, category…"
            className="pl-9 h-10 text-base"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {(["all", "current", "previous"] as DocumentScopeFilter[]).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={cn(
                "text-sm px-3 py-1.5 rounded-full font-medium border",
                scope === s ? "bg-ac text-on-ac border-ac" : "border-bd text-t3 hover:text-t2",
              )}
            >
              {s === "all" ? "All Documents" : s === "current" ? "Current Revision" : "Previous Revisions"}
            </button>
          ))}
          {KIND_CHIPS.map(c => (
            <button
              key={c.value || "all-kinds"}
              type="button"
              onClick={() => setKind(c.value)}
              className={cn(
                "text-sm px-3 py-1.5 rounded-full font-medium border",
                kind === c.value ? "bg-sr text-t1 border-bds" : "border-bd text-t3 hover:text-t2",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-9 w-[170px] text-sm">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All categories</SelectItem>
              {JOB_DOCUMENT_CATEGORIES.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={period} onValueChange={v => setPeriod(v as DocumentPeriodFilter)}>
            <SelectTrigger className="h-9 w-[150px] text-sm">
              <SelectValue placeholder="Uploaded" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any time</SelectItem>
              <SelectItem value="today">Uploaded today</SelectItem>
              <SelectItem value="week">This week</SelectItem>
              <SelectItem value="month">This month</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-t4">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : docs.length === 0 ? (
        <p className="text-base text-t4 py-8 text-center">No documents match these filters.</p>
      ) : (
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
                      onClick={() => openPreview(doc)}
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
                    <Button type="button" size="sm" variant="ghost" onClick={() => openPreview(doc)}>
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
                          onClick={() => { setRenameDoc(doc); setRenameValue(doc.filename) }}
                        >
                          <Pencil className="h-3.5 w-3.5" /> Rename
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => { setCategoryDoc(doc); setCategoryValue(doc.category) }}
                        >
                          <FolderInput className="h-3.5 w-3.5" /> Category
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteDoc(doc)}
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
      )}

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

      <Dialog open={!!renameDoc} onOpenChange={open => !open && setRenameDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename document</DialogTitle>
            <DialogDescription>Update the display filename.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Label htmlFor="doc-rename">Filename</Label>
            <Input id="doc-rename" value={renameValue} onChange={e => setRenameValue(e.target.value)} className="mt-1.5" />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setRenameDoc(null)}>Cancel</Button>
            <Button type="button" variant="primary" onClick={() => void handleRename()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!categoryDoc} onOpenChange={open => !open && setCategoryDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move category</DialogTitle>
            <DialogDescription>Choose a category for this document.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Select value={categoryValue} onValueChange={setCategoryValue}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {JOB_DOCUMENT_CATEGORIES.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setCategoryDoc(null)}>Cancel</Button>
            <Button type="button" variant="primary" onClick={() => void handleCategory()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteDoc} onOpenChange={open => !open && setDeleteDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete document?</DialogTitle>
            <DialogDescription>
              {deleteDoc?.filename} will be removed from this job. This cannot be undone from the UI.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setDeleteDoc(null)}>
              <X className="h-3.5 w-3.5" /> Cancel
            </Button>
            <Button type="button" variant="danger" onClick={() => void handleDelete()}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
