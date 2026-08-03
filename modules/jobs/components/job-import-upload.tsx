"use client"
import { useRef, useState } from "react"
import { Upload, Download, Info, Loader2 } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { cn } from "@/shared/utils/utils"

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

interface Props {
  uploading: boolean
  selectedFile: File | null
  onFileUpload: (file: File) => void
}

export function JobImportUpload({ uploading, selectedFile, onFileUpload }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) onFileUpload(file)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onFileUpload(file)
    if (e.target) e.target.value = ""
  }

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors",
          dragOver ? "border-ac bg-ac-bg" : "border-bd hover:border-bds hover:bg-hover-surface",
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
  )
}
