"use client"
import { useState, useCallback } from "react"
import { Loader2 } from "lucide-react"
import { useToast } from "@/shared/ui/toast"
import { RequireRole } from "@/components/require-role"
import { PageHeader, PageShell, BackLink } from "@/shared/layouts/page-layout"
import type { PreviewResponse, CommitResponse, Step } from "./job-import-types"
import { JobImportUpload } from "./job-import-upload"
import { JobImportPreview } from "./job-import-preview"
import { JobImportResult } from "./job-import-result"

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
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [result, setResult] = useState<CommitResponse | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

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

      {step === "upload" && (
        <JobImportUpload
          uploading={uploading}
          selectedFile={selectedFile}
          onFileUpload={uploadFile}
        />
      )}

      {step === "preview" && preview && (
        <JobImportPreview
          preview={preview}
          onReset={reset}
          onCommit={handleCommit}
        />
      )}

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

      {step === "done" && result && (
        <JobImportResult result={result} onReset={reset} />
      )}
    </PageShell>
  )
}
