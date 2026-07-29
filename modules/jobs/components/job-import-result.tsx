"use client"
import Link from "next/link"
import { CheckCircle2, ArrowLeft } from "lucide-react"
import { Button } from "@/shared/ui/button"
import type { CommitResponse } from "./job-import-types"

interface Props {
  result: CommitResponse
  onReset: () => void
}

export function JobImportResult({ result, onReset }: Props) {
  return (
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
            Next drawing number: <span className="type-drawing-number text-ac">{result.nextDrawingNumber}</span>
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
                      <span className="type-drawing-number type-badge text-ac">{job.drawingNumber}</span>
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
        <Button variant="outline" onClick={onReset}>
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
  )
}
