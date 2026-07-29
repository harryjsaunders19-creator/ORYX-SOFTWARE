"use client"
import {
  FileSpreadsheet, AlertTriangle, CheckCircle2, XCircle, Trash2, X,
} from "lucide-react"
import { Button } from "@/shared/ui/button"
import { cn } from "@/shared/utils/utils"
import { getJobStatus } from "@/lib/constants"
import type { PreviewResponse } from "./job-import-types"

interface Props {
  preview: PreviewResponse
  onReset: () => void
  onCommit: () => void
}

export function JobImportPreview({ preview, onReset, onCommit }: Props) {
  return (
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
          <Button variant="outline" size="sm" onClick={onReset}>
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
          <Button variant="outline" onClick={onReset}>Cancel</Button>
          <Button
            variant="primary"
            onClick={onCommit}
            disabled={preview.summary.valid === 0}
          >
            Import {preview.summary.valid} job{preview.summary.valid !== 1 ? "s" : ""}
          </Button>
        </div>
      </div>
    </div>
  )
}
