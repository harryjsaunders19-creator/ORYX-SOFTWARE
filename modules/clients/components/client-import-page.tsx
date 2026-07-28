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
import type { ClientImportField } from "../import/import-clients"

interface PreviewRow {
  rowIndex: number; name: string; accountCode: string; contactName: string
  phone: string; email: string; billingAddress: string; notes: string
  errors: string[]; warnings: string[]
}

interface PreviewResponse {
  preview: true; filename: string; headers: string[]
  mapping: Record<string, ClientImportField>; unmappedHeaders: string[]
  rows: PreviewRow[]; totalRawRows: number; requiredFieldsMissing: boolean
  summary: { total: number; valid: number; errors: number; warnings: number }
}

interface CommitResponse {
  imported: number; skipped: number
  skippedDetails: { rowIndex: number; reasons: string[] }[]
  importedClients: { name: string; accountCode: string }[]
}

type Step = "upload" | "preview" | "importing" | "done"

function downloadTemplate() {
  const headers = ["Company Name", "Customer ID", "Main Contact", "Phone", "Email", "Billing Address", "Notes"]
  const example = ["ABC Construction Ltd", "ABC01", "James Carter", "01234 567890", "james@abc.co.uk", "14 Industrial Way, Bristol, BS1 2AB", "Net 30 payment terms"]
  const csv = [headers.join(","), example.map(v => `"${v}"`).join(",")].join("\n")
  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a"); a.href = url; a.download = "oryx-client-import-template.csv"; a.click()
  URL.revokeObjectURL(url)
}

export default function ImportClientsPage() {
  return <RequireRole roles={["ADMIN"]}><ImportClientsInner /></RequireRole>
}

function ImportClientsInner() {
  const { toast } = useToast()
  const [step, setStep]             = useState<Step>("upload")
  const [dragOver, setDragOver]     = useState(false)
  const [uploading, setUploading]   = useState(false)
  const [preview, setPreview]       = useState<PreviewResponse | null>(null)
  const [result, setResult]         = useState<CommitResponse | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const uploadFile = useCallback(async (file: File) => {
    const ext = file.name.toLowerCase().split(".").pop()
    if (!ext || !["csv", "xlsx", "xls"].includes(ext)) { toast("Only .csv and .xlsx files are supported", "error"); return }
    if (file.size > 10 * 1024 * 1024) { toast("File too large (max 10 MB)", "error"); return }
    setSelectedFile(file); setUploading(true)
    try {
      const formData = new FormData(); formData.append("file", file)
      const res = await fetch("/api/clients/import", { method: "POST", body: formData })
      const data = await res.json()
      if (!res.ok) { toast(data.error ?? "Failed to parse file", "error"); setSelectedFile(null); return }
      setPreview(data as PreviewResponse); setStep("preview")
    } catch { toast("Upload failed", "error"); setSelectedFile(null) }
    finally { setUploading(false) }
  }, [toast])

  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) uploadFile(f) }, [uploadFile])
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) uploadFile(f); if (e.target) e.target.value = "" }, [uploadFile])

  const handleCommit = async () => {
    if (!preview) return
    const validRows = preview.rows.filter(r => r.errors.length === 0)
    if (validRows.length === 0) { toast("No valid rows to import", "error"); return }
    setStep("importing")
    try {
      const res = await fetch("/api/clients/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "commit", rows: validRows }),
      })
      const data = await res.json() as CommitResponse
      if (!res.ok) { toast((data as unknown as { error: string }).error ?? "Import failed", "error"); setStep("preview"); return }
      setResult(data); setStep("done")
    } catch { toast("Import failed", "error"); setStep("preview") }
  }

  const reset = () => { setStep("upload"); setPreview(null); setResult(null); setSelectedFile(null) }

  return (
    <PageShell wide>
      <BackLink href="/clients">All clients</BackLink>
      <PageHeader
        title="Import Clients"
        description="Upload a CSV or Excel spreadsheet to bulk-add client records."
      />

      {/* Upload */}
      {step === "upload" && (
        <div className="space-y-4">
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn("border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors", dragOver ? "border-ac bg-ac-bg" : "border-bd hover:border-bds hover:bg-pg")}
            style={{ borderWidth: "2px", borderStyle: "dashed", borderRadius: "16px", padding: "48px", textAlign: "center", cursor: "pointer" }}
          >
            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileSelect} className="hidden" />
            {uploading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-5 w-5 text-ac" style={{ animation: "spin 1s linear infinite" }} />
                <p className="text-sm font-medium text-t1">Parsing {selectedFile?.name}…</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: "var(--color-ac-bg)" }}>
                  <Upload className="h-5 w-5 text-ac" />
                </div>
                <p className="text-sm font-medium text-t1">Drop your spreadsheet here, or <span className="text-ac">browse</span></p>
                <p className="text-xs text-t3">Accepts .csv and .xlsx — max 10 MB</p>
              </div>
            )}
          </div>
          <div className="bg-sr border border-bd rounded-md px-5 py-4 flex items-start gap-3" style={{ borderRadius: "14px" }}>
            <Info className="h-4 w-4 text-ac shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-t1 mb-1">Preparing your spreadsheet</p>
              <p className="text-xs text-t3 leading-relaxed mb-3">
                Include a header row with columns like <strong>Company Name</strong>, <strong>Customer ID</strong>,{" "}
                <strong>Main Contact</strong>, <strong>Phone</strong>, <strong>Email</strong>, <strong>Billing Address</strong>, and <strong>Notes</strong>.
                Only <strong>Company Name</strong> is required.
              </p>
              <Button variant="outline" size="sm" onClick={downloadTemplate}><Download className="h-3.5 w-3.5" /> Download template</Button>
            </div>
          </div>
        </div>
      )}

      {/* Preview */}
      {step === "preview" && preview && (
        <div className="space-y-4">
          <div className="bg-sr border border-bd rounded-md px-5 py-3 flex items-center gap-4 flex-wrap" style={{ borderRadius: "14px" }}>
            <div className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-ac" /><span className="text-sm font-medium text-t1">{preview.filename}</span></div>
            <span className="h-4 w-px bg-bd" />
            <span className="text-xs text-t3"><span className="font-semibold text-t2">{preview.summary.total}</span> rows</span>
            {preview.summary.valid > 0 && <span className="text-xs flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-ok-ic" /><span className="font-semibold text-ok-tx">{preview.summary.valid}</span> valid</span>}
            {preview.summary.errors > 0 && <span className="text-xs flex items-center gap-1"><XCircle className="h-3.5 w-3.5 text-dn" /><span className="font-semibold text-dn-tx">{preview.summary.errors}</span> errors</span>}
            {preview.summary.warnings > 0 && <span className="text-xs flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5 text-wn" /><span className="font-semibold text-wn-tx">{preview.summary.warnings}</span> warnings</span>}
            <div className="ml-auto"><Button variant="outline" size="sm" onClick={reset}><Trash2 className="h-3.5 w-3.5" /> Start over</Button></div>
          </div>

          {preview.requiredFieldsMissing && (
            <div className="p-3 rounded-md text-xs font-medium" style={{ backgroundColor: "var(--color-dn-bg)", border: "1px solid var(--color-dn-bd)", color: "var(--color-dn-tx)", borderRadius: "14px" }}>
              <XCircle className="h-3.5 w-3.5 inline mr-1" /> Required column "Company Name" not detected.
            </div>
          )}

          <div className="bg-sr border border-bd rounded-md overflow-hidden" style={{ borderRadius: "14px" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-pg border-b border-bd">
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-t3 uppercase tracking-wider w-12">Row</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-t3 uppercase tracking-wider w-10" />
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-t3 uppercase tracking-wider">Company</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-t3 uppercase tracking-wider">Customer ID</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-t3 uppercase tracking-wider">Contact</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-t3 uppercase tracking-wider">Phone</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-t3 uppercase tracking-wider">Email</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-t3 uppercase tracking-wider">Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map(row => {
                    const hasErrors = row.errors.length > 0
                    const hasWarnings = row.warnings.length > 0
                    return (
                      <tr key={row.rowIndex} className={cn("border-b border-bd last:border-0", hasErrors ? "" : hasWarnings ? "" : "")}
                        style={hasErrors ? { backgroundColor: "rgba(253,241,239,0.4)" } : hasWarnings ? { backgroundColor: "rgba(255,251,235,0.4)" } : undefined}>
                        <td className="px-3 py-2.5 text-xs text-t4 tabular-nums">{row.rowIndex}</td>
                        <td className="px-3 py-2.5">
                          {hasErrors ? <XCircle className="h-3.5 w-3.5 text-dn" /> : hasWarnings ? <AlertTriangle className="h-3.5 w-3.5 text-wn" /> : <CheckCircle2 className="h-3.5 w-3.5 text-ok-ic" />}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-t1 max-w-[160px] truncate">{row.name || <span className="text-dn-tx italic">Missing</span>}</td>
                        <td className="px-3 py-2.5 text-xs text-t2 max-w-[100px] truncate">{row.accountCode || <span className="text-t4">—</span>}</td>
                        <td className="px-3 py-2.5 text-xs text-t2 max-w-[120px] truncate">{row.contactName || <span className="text-t4">—</span>}</td>
                        <td className="px-3 py-2.5 text-xs text-t2 max-w-[110px] truncate">{row.phone || <span className="text-t4">—</span>}</td>
                        <td className="px-3 py-2.5 text-xs text-t2 max-w-[140px] truncate">{row.email || <span className="text-t4">—</span>}</td>
                        <td className="px-3 py-2.5 text-xs max-w-[200px]">
                          {hasErrors && row.errors.map((e, i) => <p key={i} className="text-dn-tx flex items-start gap-1"><X className="h-3.5 w-3.5 shrink-0 mt-0.5" />{e}</p>)}
                          {hasWarnings && row.warnings.map((w, i) => <p key={i} className="text-wn-tx flex items-start gap-1"><AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{w}</p>)}
                          {!hasErrors && !hasWarnings && <span className="text-t4">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 bg-sr border border-bd rounded-md px-5 py-4" style={{ borderRadius: "14px" }}>
            <p className="text-sm text-t2">
              {preview.summary.valid === 0
                ? <span className="text-dn-tx font-medium">No valid rows. Fix errors and re-upload.</span>
                : <><span className="font-semibold text-t1">{preview.summary.valid}</span> client{preview.summary.valid !== 1 ? "s" : ""} will be created.
                    {preview.summary.errors > 0 && <span className="text-dn-tx"> {preview.summary.errors} skipped.</span>}</>}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" onClick={reset}>Cancel</Button>
              <Button variant="primary" onClick={handleCommit} disabled={preview.summary.valid === 0}>
                Import {preview.summary.valid} client{preview.summary.valid !== 1 ? "s" : ""}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Importing */}
      {step === "importing" && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Loader2 className="h-5 w-5 text-ac mb-4" style={{ animation: "spin 1s linear infinite" }} />
          <p className="text-sm font-medium text-t1">Importing clients…</p>
        </div>
      )}

      {/* Done */}
      {step === "done" && result && (
        <div className="space-y-4">
          <div className="p-6 text-center rounded-md" style={{ backgroundColor: "var(--color-ok-bg)", border: "1px solid var(--color-ok-bd)", borderRadius: "14px" }}>
            <CheckCircle2 className="h-5 w-5 mx-auto mb-3" style={{ color: "var(--color-ok-ic)" }} />
            <p className="text-base font-semibold" style={{ color: "var(--color-ok-tx)" }}>
              {result.imported} client{result.imported !== 1 ? "s" : ""} imported
            </p>
            {result.skipped > 0 && <p className="text-sm mt-1" style={{ color: "var(--color-wn-tx)" }}>{result.skipped} skipped</p>}
          </div>

          {result.importedClients.length > 0 && (
            <div className="bg-sr border border-bd rounded-md overflow-hidden" style={{ borderRadius: "14px" }}>
              <div className="px-4 py-3 border-b border-bd"><p className="text-xs font-semibold text-t3 uppercase tracking-wider">Created clients</p></div>
              <div className="max-h-[250px] overflow-y-auto thin-scroll">
                <table className="w-full text-sm"><tbody>
                  {result.importedClients.map((c, i) => (
                    <tr key={i} className="border-b border-bd last:border-0">
                      <td className="px-4 py-2.5 text-xs font-medium text-t1">{c.name}</td>
                      <td className="px-4 py-2.5 text-xs text-t3">{c.accountCode || "—"}</td>
                    </tr>
                  ))}
                </tbody></table>
              </div>
            </div>
          )}

          {result.skippedDetails.length > 0 && (
            <div className="bg-sr border border-bd rounded-md overflow-hidden" style={{ borderRadius: "14px" }}>
              <div className="px-4 py-3 border-b border-bd"><p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-dn-tx)" }}>Skipped</p></div>
              <div className="max-h-[150px] overflow-y-auto thin-scroll divide-y divide-bd">
                {result.skippedDetails.map((s, i) => (
                  <div key={i} className="px-4 py-2.5">
                    <span className="text-xs font-medium text-t2">Row {s.rowIndex}</span>
                    <span className="text-xs ml-2" style={{ color: "var(--color-dn-tx)" }}>{s.reasons.join("; ")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={reset}>Import more</Button>
            <Link href="/clients"><Button variant="primary"><ArrowLeft className="h-3.5 w-3.5" /> Go to clients</Button></Link>
          </div>
        </div>
      )}
    </PageShell>
  )
}
