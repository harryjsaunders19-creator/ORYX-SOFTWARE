"use client"
import { useState, useRef, useCallback } from "react"
import Link from "next/link"
import {
  Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, XCircle,
  ArrowLeft, Trash2, Download, Loader2, X, Info,
} from "lucide-react"
import { Button } from "@/shared/ui/button"
import { useToast } from "@/shared/ui/toast"
import { RequireRole } from "@/components/require-role"
import { PageHeader, PageShell, BackLink } from "@/shared/layouts/page-layout"
import { cn } from "@/shared/utils/utils"
import { getJobStatus } from "@/lib/constants"
import type { ImportField } from "../import/import-jobs"

// ── Types ───────────────────────────────────────────────────────────

interface PreviewRow {
  rowIndex: number
  address: string
  typeOfWorks: string
  customTypeDescription: string | null
  clientCompany: string
  requestedBy: string
  designer: string
  status: string
  notes: string | null
  quoteValue: number | null
  quoteReference: string | null
  quoteDate: string | null
  commercialNotes: string | null
  requiredByDate: string | null
  requestedDate: string | null
  dateCompleted: string | null
  itemType: string
  errors: string[]
  warnings: string[]
}

interface PreviewResponse {
  preview: true
  filename: string
  headers: string[]
  mapping: Record<string, ImportField>
  unmappedHeaders: string[]
  rows: PreviewRow[]
  totalRawRows: number
  requiredFieldsMissing: boolean
  summary: { total: number; valid: number; errors: number; warnings: number }
}

interface CommitResponse {
  imported: number
  skipped: number
  skippedDetails: { rowIndex: number; reasons: string[] }[]
  importedJobs: { drawingNumber: string; address: string; clientCompany: string }[]
  nextDrawingNumber: string
}

type Step = "upload" | "preview" | "importing" | "done"

// ── Helper: downloadable CSV template ───────────────────────────────

function downloadTemplate() {
  const headers = [
    "Site Address", "Type of Works", "Client Company", "Requested By",
    "Designer", "Status", "Notes", "Quote Value", "Quote Reference",
    "Quote Date", "Required By Date", "Date Completed",
  ]
  const exampleRow = [
    "14 Clifton Road, Bristol, BS8 1AF", "Access Scaffold", "ABC Construction Ltd",
    "James Carter", "Sarah Mitchell", "New Request",
    "Standard access scaffold for facade works", "1250", "QT-2026-047",
    "15/01/2026", "28/02/2026", "",
  ]
  const csv = [headers.join(","), exampleRow.map(v => `"${v}"`).join(",")].join("\n")
  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "oryx-import-template.csv"
  a.click()
  URL.revokeObjectURL(url)
}

// ── Main component ──────────────────────────────────────────────────

export default function ImportJobsPage() {
  return (
    <RequireRole roles={["ADMIN"]}>
      <ImportJobsInner />
    </RequireRole>
  )
}

function ImportJobsInner() {
  const { toast } = useToast()
  const [step, setStep] = useState<Step>("upload")
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [result, setResult] = useState<CommitResponse | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const uploadFile = useCallback(async (file: File) => {
    const ext = file.name.toLowerCase().split(".").pop()
    if (!ext || !["csv", "xlsx", "xls"].includes(ext)) {
      toast("Only .csv and .xlsx files are supported", "error")
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast("File too large (max 10 MB)", "error")
      return
    }

    setSelectedFile(file)
    setUploading(true)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/jobs/import", { method: "POST", body: formData })
      const data = await res.json()

      if (!res.ok) {
        toast(data.error ?? "Failed to parse file", "error")
        setSelectedFile(null)
        return
      }

      setPreview(data as PreviewResponse)
      setStep("preview")
    } catch {
      toast("Upload failed — check your connection", "error")
      setSelectedFile(null)
    } finally {
      setUploading(false)
    }
  }, [toast])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  }, [uploadFile])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
    if (e.target) e.target.value = ""
  }, [uploadFile])

  const handleCommit = async () => {
    if (!preview) return
    const validRows = preview.rows.filter(r => r.errors.length === 0)
    if (validRows.length === 0) {
      toast("No valid rows to import", "error")
      return
    }

    setStep("importing")
    try {
      const res = await fetch("/api/jobs/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "commit", rows: validRows }),
      })
      const data = await res.json() as CommitResponse

      if (!res.ok) {
        toast((data as unknown as { error: string }).error ?? "Import failed", "error")
        setStep("preview")
        return
      }

      setResult(data)
      setStep("done")
    } catch {
      toast("Import failed — check your connection", "error")
      setStep("preview")
    }
  }

  const reset = () => {
    setStep("upload")
    setPreview(null)
    setResult(null)
    setSelectedFile(null)
  }

  return (
    <PageShell wide>
      <BackLink href="/jobs">All jobs</BackLink>
      <PageHeader
        title="Import Jobs"
        description="Upload a CSV or Excel spreadsheet to bulk-create job records."
      />

      {/* Step: Upload */}
      {step === "upload" && (
        <div className="space-y-4">
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors",
              dragOver ? "border-ac bg-ac-bg" : "border-bd hover:border-bds hover:bg-pg",
            )}
            style={{
              borderWidth: "2px",
              borderStyle: "dashed",
              borderRadius: "16px",
              padding: "48px",
              textAlign: "center",
              cursor: "pointer",
              borderColor: dragOver ? "var(--color-ac)" : undefined,
              backgroundColor: dragOver ? "var(--color-ac-bg)" : undefined,
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileSelect}
              className="hidden"
            />
            {uploading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-5 w-5 text-ac animate-spin" style={{ animation: "spin 1s linear infinite" }} />
                <p className="text-sm font-medium text-t1">Parsing {selectedFile?.name}…</p>
                <p className="text-xs text-t3">Analysing headers and validating rows</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div
                  className="w-12 h-12 rounded-xl bg-ac-bg flex items-center justify-center"
                  style={{ width: "48px", height: "48px", borderRadius: "12px", backgroundColor: "var(--color-ac-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <Upload className="h-5 w-5 text-ac" />
                </div>
                <div>
                  <p className="text-sm font-medium text-t1">
                    Drop your spreadsheet here, or <span className="text-ac">browse</span>
                  </p>
                  <p className="text-xs text-t3 mt-1">
                    Accepts .csv and .xlsx — max 10 MB, up to 5,000 rows
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Template download + help */}
          <div
            className="bg-sr border border-bd rounded-md px-5 py-4 flex items-start gap-3"
            style={{ backgroundColor: "var(--color-sr)", border: "1px solid var(--color-bd)", borderRadius: "14px", padding: "16px 20px", display: "flex", alignItems: "flex-start", gap: "12px" }}
          >
            <Info className="h-4 w-4 text-ac shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-t1 mb-1">Preparing your spreadsheet</p>
              <p className="text-xs text-t3 leading-relaxed mb-3">
                Your file should have a header row with column names. The importer will
                automatically detect and map columns like <strong>Site Address</strong>,{" "}
                <strong>Client Company</strong>, <strong>Requested By</strong>,{" "}
                <strong>Type of Works</strong>, <strong>Designer</strong>, <strong>Status</strong>,{" "}
                <strong>Quote Value</strong>, and more. Required fields are{" "}
                <strong>Site Address</strong>, <strong>Client Company</strong>, and{" "}
                <strong>Requested By</strong>.
              </p>
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="h-3.5 w-3.5" />
                Download template
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Step: Preview */}
      {step === "preview" && preview && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div
            className="bg-sr border border-bd rounded-md px-5 py-3 flex items-center gap-4 flex-wrap"
            style={{ backgroundColor: "var(--color-sr)", border: "1px solid var(--color-bd)", borderRadius: "14px", padding: "12px 20px", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}
          >
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-ac shrink-0" />
              <span className="text-sm font-medium text-t1">{preview.filename}</span>
            </div>
            <span className="h-4 w-px bg-bd" />
            <span className="text-xs text-t3">
              <span className="font-semibold text-t2">{preview.summary.total}</span> rows parsed
            </span>
            {preview.summary.valid > 0 && (
              <span className="text-xs flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-ok-ic" />
                <span className="font-semibold text-ok-tx">{preview.summary.valid}</span>
                <span className="text-t3">valid</span>
              </span>
            )}
            {preview.summary.errors > 0 && (
              <span className="text-xs flex items-center gap-1">
                <XCircle className="h-3.5 w-3.5 text-dn" />
                <span className="font-semibold text-dn-tx">{preview.summary.errors}</span>
                <span className="text-t3">with errors</span>
              </span>
            )}
            {preview.summary.warnings > 0 && (
              <span className="text-xs flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5 text-wn" />
                <span className="font-semibold text-wn-tx">{preview.summary.warnings}</span>
                <span className="text-t3">with warnings</span>
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={reset}>
                <Trash2 className="h-3.5 w-3.5" />
                Start over
              </Button>
            </div>
          </div>

          {/* Column mapping info */}
          {preview.unmappedHeaders.length > 0 && (
            <div
              className="bg-wn-bg border border-wn-bd rounded-md px-4 py-3"
              style={{ backgroundColor: "var(--color-wn-bg)", border: "1px solid var(--color-wn-bd)", borderRadius: "14px", padding: "12px 16px" }}
            >
              <p className="text-xs font-medium text-wn-tx mb-1">
                <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
                Unmapped columns (ignored): {preview.unmappedHeaders.join(", ")}
              </p>
              <p className="type-helper text-wn-tx/70">
                These columns didn't match any known field name. Data in them won't be imported.
              </p>
            </div>
          )}

          {preview.requiredFieldsMissing && (
            <div
              className="bg-dn-bg border border-dn-bd rounded-md px-4 py-3"
              style={{ backgroundColor: "var(--color-dn-bg)", border: "1px solid var(--color-dn-bd)", borderRadius: "14px", padding: "12px 16px" }}
            >
              <p className="text-xs font-medium text-dn-tx">
                <XCircle className="h-3.5 w-3.5 inline mr-1" />
                Required columns not detected. Make sure your headers include "Site Address", "Client Company", and "Requested By".
              </p>
            </div>
          )}

          {/* Preview table */}
          <div className="bg-sr border border-bd rounded-md overflow-hidden" style={{ backgroundColor: "var(--color-sr)", border: "1px solid var(--color-bd)", borderRadius: "14px", overflow: "hidden" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-pg border-b border-bd">
                    <th className="px-3 py-2.5 text-left type-label text-t3 w-12">Row</th>
                    <th className="px-3 py-2.5 text-left type-label text-t3 w-10">
                      <span className="sr-only">Status</span>
                    </th>
                    <th className="px-3 py-2.5 text-left type-label text-t3">Address</th>
                    <th className="px-3 py-2.5 text-left type-label text-t3">Type of Works</th>
                    <th className="px-3 py-2.5 text-left type-label text-t3">Client</th>
                    <th className="px-3 py-2.5 text-left type-label text-t3">Requested By</th>
                    <th className="px-3 py-2.5 text-left type-label text-t3">Designer</th>
                    <th className="px-3 py-2.5 text-left type-label text-t3">Status</th>
                    <th className="px-3 py-2.5 text-left type-label text-t3">Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map(row => {
                    const hasErrors = row.errors.length > 0
                    const hasWarnings = row.warnings.length > 0
                    return (
                      <tr
                        key={row.rowIndex}
                        className={cn(
                          "border-b border-bd last:border-0",
                          hasErrors ? "bg-dn-bg/40" : hasWarnings ? "bg-wn-bg/40" : "",
                        )}
                        style={hasErrors ? { backgroundColor: "color-mix(in srgb, var(--color-dn-bg) 40%, transparent)" } : hasWarnings ? { backgroundColor: "color-mix(in srgb, var(--color-wn-bg) 40%, transparent)" } : undefined}
                      >
                        <td className="px-3 py-2.5 text-xs text-t4 tabular-nums">{row.rowIndex}</td>
                        <td className="px-3 py-2.5">
                          {hasErrors
                            ? <XCircle className="h-3.5 w-3.5 text-dn" />
                            : hasWarnings
                              ? <AlertTriangle className="h-3.5 w-3.5 text-wn" />
                              : <CheckCircle2 className="h-3.5 w-3.5 text-ok-ic" />}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-t1 max-w-[180px] truncate" title={row.address}>
                          {row.address || <span className="text-dn-tx italic">Missing</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-t2 max-w-[140px] truncate" title={row.typeOfWorks}>
                          {row.typeOfWorks || <span className="text-t4">—</span>}
                          {row.customTypeDescription && (
                            <span className="type-helper text-t4 block truncate">{row.customTypeDescription}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-t1 max-w-[140px] truncate" title={row.clientCompany}>
                          {row.clientCompany || <span className="text-dn-tx italic">Missing</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-t2 max-w-[120px] truncate">
                          {row.requestedBy || <span className="text-dn-tx italic">Missing</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-t2 max-w-[120px] truncate">
                          {row.designer || <span className="text-t4">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          <span className={cn(
                            "inline-block px-2 py-0.5 rounded-full type-badge",
                            row.status === "NEW_REQUEST" ? "bg-gy-bg text-gy-tx" :
                            row.status === "IN_DESIGN"   ? "bg-yl-bg text-yl-tx" :
                            row.status === "CHECKING"        ? "bg-wn-bg text-wn-tx" :
                            row.status === "READY_TO_SEND"   ? "bg-rs-bg text-rs-tx" :
                            row.status === "ISSUED"          ? "bg-ok-bg text-ok-tx" :
                            "bg-pg text-t3",
                          )}>
                            {getJobStatus(row.status).shortLabel}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs max-w-[220px]">
                          {hasErrors && (
                            <div className="space-y-0.5">
                              {row.errors.map((e, i) => (
                                <p key={i} className="text-dn-tx flex items-start gap-1">
                                  <X className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                  {e}
                                </p>
                              ))}
                            </div>
                          )}
                          {hasWarnings && (
                            <div className="space-y-0.5">
                              {row.warnings.map((w, i) => (
                                <p key={i} className="text-wn-tx flex items-start gap-1">
                                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                  {w}
                                </p>
                              ))}
                            </div>
                          )}
                          {!hasErrors && !hasWarnings && (
                            <span className="text-t4">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action bar */}
          <div
            className="flex items-center justify-between gap-4 bg-sr border border-bd rounded-md px-5 py-4"
            style={{ backgroundColor: "var(--color-sr)", border: "1px solid var(--color-bd)", borderRadius: "14px", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}
          >
            <p className="text-sm text-t2">
              {preview.summary.valid === 0 ? (
                <span className="text-dn-tx font-medium">No valid rows to import. Fix the errors and re-upload.</span>
              ) : (
                <>
                  <span className="font-semibold text-t1">{preview.summary.valid}</span> job{preview.summary.valid !== 1 ? "s" : ""} will be created.
                  {preview.summary.errors > 0 && (
                    <span className="text-dn-tx"> {preview.summary.errors} row{preview.summary.errors !== 1 ? "s" : ""} will be skipped due to errors.</span>
                  )}
                </>
              )}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" onClick={reset}>Cancel</Button>
              <Button
                variant="primary"
                onClick={handleCommit}
                disabled={preview.summary.valid === 0}
              >
                Import {preview.summary.valid} job{preview.summary.valid !== 1 ? "s" : ""}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Step: Importing */}
      {step === "importing" && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Loader2
            className="h-5 w-5 text-ac animate-spin mb-4"
            style={{ animation: "spin 1s linear infinite" }}
          />
          <p className="text-sm font-medium text-t1">Importing jobs…</p>
          <p className="text-xs text-t3 mt-1">
            Creating {preview?.summary.valid} job{preview?.summary.valid !== 1 ? "s" : ""} with auto-assigned drawing numbers.
          </p>
        </div>
      )}

      {/* Step: Done */}
      {step === "done" && result && (
        <div className="space-y-4">
          {/* Success card */}
          <div
            className="bg-ok-bg border border-ok-bd rounded-md px-6 py-5 text-center"
            style={{ backgroundColor: "var(--color-ok-bg)", border: "1px solid var(--color-ok-bd)", borderRadius: "14px", padding: "20px 24px", textAlign: "center" }}
          >
            <CheckCircle2 className="h-5 w-5 text-ok-ic mx-auto mb-3" />
            <p className="text-base font-semibold text-ok-tx">
              {result.imported} job{result.imported !== 1 ? "s" : ""} imported successfully
            </p>
            {result.skipped > 0 && (
              <p className="text-sm text-wn-tx mt-1">
                {result.skipped} row{result.skipped !== 1 ? "s" : ""} skipped due to validation errors.
              </p>
            )}
            {result.nextDrawingNumber && (
              <p className="text-sm text-t2 mt-2">
                Next drawing number: <span className="font-mono font-semibold text-ac">{result.nextDrawingNumber}</span>
              </p>
            )}
          </div>

          {/* Imported jobs list */}
          {result.importedJobs.length > 0 && (
            <div className="bg-sr border border-bd rounded-md overflow-hidden" style={{ backgroundColor: "var(--color-sr)", border: "1px solid var(--color-bd)", borderRadius: "14px", overflow: "hidden" }}>
              <div className="px-4 py-3 border-b border-bd">
                <p className="type-label text-t3">Created jobs</p>
              </div>
              <div className="max-h-[300px] overflow-y-auto thin-scroll">
                <table className="w-full text-sm">
                  <tbody>
                    {result.importedJobs.map((job, i) => (
                      <tr key={i} className="border-b border-bd last:border-0">
                        <td className="px-4 py-2.5">
                          <span className="font-mono type-badge text-ac">{job.drawingNumber}</span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-t1">{job.address}</td>
                        <td className="px-4 py-2.5 text-xs text-t3">{job.clientCompany}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Skipped rows detail */}
          {result.skippedDetails.length > 0 && (
            <div className="bg-sr border border-bd rounded-md overflow-hidden" style={{ backgroundColor: "var(--color-sr)", border: "1px solid var(--color-bd)", borderRadius: "14px", overflow: "hidden" }}>
              <div className="px-4 py-3 border-b border-bd">
                <p className="text-xs font-semibold text-dn-tx ">Skipped rows</p>
              </div>
              <div className="max-h-[200px] overflow-y-auto thin-scroll divide-y divide-bd">
                {result.skippedDetails.map((s, i) => (
                  <div key={i} className="px-4 py-2.5">
                    <span className="text-xs font-medium text-t2">Row {s.rowIndex}</span>
                    <span className="text-xs text-dn-tx ml-2">{s.reasons.join("; ")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={reset}>
              Import more
            </Button>
            <Link href="/jobs">
              <Button variant="primary">
                <ArrowLeft className="h-3.5 w-3.5" />
                Go to jobs
              </Button>
            </Link>
          </div>
        </div>
      )}
    </PageShell>
  )
}
