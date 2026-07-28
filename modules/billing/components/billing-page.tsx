"use client"
import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { Clock, ArrowUpRight, Loader2, ClipboardCheck, Download, FileSpreadsheet } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Textarea } from "@/shared/ui/textarea"
import { Field } from "@/shared/ui/field"
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogDescription, DialogBody,
} from "@/shared/ui/dialog"
import { WorkItemTypeBadge } from "@/modules/jobs/components/badges/work-item-type-badge"
import { TypeOfWorksBadge } from "@/modules/jobs/components/badges/type-of-works-badge"
import { useToast } from "@/shared/ui/toast"
import { RequireRole } from "@/components/require-role"
import { PageHeader, PageShell, DataPanel, KpiTile, TabBar, TablePagination } from "@/shared/layouts/page-layout"
import { formatGBP, formatDisplayDate } from "@/shared/utils/utils"
import { useClientMediaQuery } from "@/shared/hooks/use-media-query"
import { useApi } from "@/shared/hooks/use-api"
import type { BillingHandoff, BillingExportBatch } from "@/lib/types"

type View = "awaiting" | "cleared" | "history"

async function downloadResponse(res: Response, fallbackName: string) {
  const contentType = res.headers.get("Content-Type") ?? ""
  if (!contentType.includes("spreadsheetml") && !contentType.includes("octet-stream")) {
    const body = await res.text()
    let message = `Download failed (${res.status})`
    try {
      const parsed = JSON.parse(body) as { error?: string }
      if (parsed.error) message = parsed.error
    } catch { /* not JSON */ }
    throw new Error(message)
  }

  const blob = await res.blob()
  if (blob.size < 512) {
    throw new Error("Downloaded file is empty or too small — export may have failed")
  }

  const disposition = res.headers.get("Content-Disposition") ?? ""
  const match = disposition.match(/filename="([^"]+)"/)
  const filename = match?.[1] ?? fallbackName
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function ExportModal({ ids, onClose, onExported }: {
  ids: string[]
  onClose: () => void
  onExported: (batchNumber: string) => void
}) {
  const { toast } = useToast()
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const count = ids.length

  const submit = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/billing-handoffs/export", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handoffIds: ids, notes: notes.trim() || null }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        toast(body.error ?? "Export failed", "error")
        return
      }
      const batchNumber = res.headers.get("X-Batch-Number") ?? ""
      const recordCount = parseInt(res.headers.get("X-Record-Count") ?? "0", 10)
      await downloadResponse(res, "accounts-handover.xlsx")
      toast(`${batchNumber} exported — ${recordCount || count} item${count === 1 ? "" : "s"} cleared`, "success")
      onExported(batchNumber)
    } catch (err) {
      toast(err instanceof Error ? err.message : "Network error", "error")
    }
    finally { setSaving(false) }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o && !saving) onClose() }}>
      <DialogContent size="sm" showClose={!saving}>
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <FileSpreadsheet className="h-4 w-4 text-ac2" />
            <DialogTitle>Export Accounts Handover</DialogTitle>
          </div>
          <DialogDescription>{count} item{count === 1 ? "" : "s"} selected</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-xs text-t3">
            This downloads a complete workbook for accounts — client, project, commercial, revision, and audit
            details across all selected items — and creates a numbered billing batch. Once exported, these items
            move to Cleared and won&rsquo;t reappear here.
          </p>
          <Field label="Batch notes (optional)">
            <Textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Weekly handover for w/e 21 June"
              rows={2} autoFocus
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" className="flex-1" loading={saving} onClick={() => void submit()}>
            {saving ? "Exporting…" : "Export & Process"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function HandoffQuoteValue({ item, view, onQuoteSaved }: {
  item: BillingHandoff
  view: View
  onQuoteSaved?: () => void
}) {
  const { toast } = useToast()
  const [draftValue, setDraftValue] = useState("")
  const [saving, setSaving] = useState(false)

  const saveQuote = async () => {
    const parsed = parseFloat(draftValue.replace(/[£,\s]/g, ""))
    if (isNaN(parsed) || parsed < 0) {
      toast("Enter a valid amount", "error")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/billing-handoffs/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteValue: parsed }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        toast(body.error ?? "Failed to save", "error")
        return
      }
      toast("Value saved", "success")
      onQuoteSaved?.()
    } catch {
      toast("Network error", "error")
    } finally {
      setSaving(false)
    }
  }

  if (item.quoteValue != null) {
    return <span className="text-t1 font-medium tabular-nums">{formatGBP(item.quoteValue)}</span>
  }
  if (view === "awaiting") {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          value={draftValue}
          onChange={e => setDraftValue(e.target.value)}
          className="h-7 w-24 text-xs tabular-nums"
          disabled={saving}
        />
        <Button size="sm" variant="outline" className="h-7 px-2 type-helper" loading={saving} onClick={saveQuote}>
          Save
        </Button>
      </div>
    )
  }
  return <span>—</span>
}

function HandoffMobileCard({ item, view, selected, onToggle, onQuoteSaved }: {
  item: BillingHandoff
  view: View
  selected: boolean
  onToggle: (id: string) => void
  onQuoteSaved?: () => void
}) {
  return (
    <div className="rounded-xl border border-bd bg-sr shadow-card p-3.5 space-y-2.5">
      <div className="flex items-start gap-2">
        {view === "awaiting" && (
          <input
            type="checkbox"
            className="h-4 w-4 accent-ac mt-1 shrink-0"
            aria-label={`Select ${item.drawingNumber}`}
            checked={selected}
            onChange={() => onToggle(item.id)}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono type-badge text-ac">{item.drawingNumber}</span>
            <WorkItemTypeBadge itemType={item.itemType} size="sm" />
          </div>
          <p className="text-sm font-medium text-t1 mt-1">{item.clientCompany}</p>
          <p className="text-xs text-t3 mt-0.5 line-clamp-2">{item.address}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap text-xs">
        <TypeOfWorksBadge typeOfWorks={item.typeOfWorks} customTypeDescription={item.customTypeDescription} size="sm" />
        <span className="text-t3 tabular-nums">{formatDisplayDate(item.completionDate)}</span>
        {item.designer && <span className="text-t2 truncate">{item.designer}</span>}
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-bd/60">
        <HandoffQuoteValue item={item} view={view} onQuoteSaved={onQuoteSaved} />
        <Link href={`/jobs/${item.sourceJobId}`} className="text-xs text-ac hover:text-ach font-medium inline-flex items-center gap-1 shrink-0">
          View job <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {view === "cleared" && (
        <p className="type-helper text-t3">
          Cleared {item.clearedByAccountsAt ? format(new Date(item.clearedByAccountsAt), "d MMM yyyy") : "—"}
          {item.clearedBy ? ` · ${item.clearedBy}` : ""}
        </p>
      )}
    </div>
  )
}

function BatchMobileCard({ batch }: { batch: BillingExportBatch }) {
  const { toast } = useToast()
  const [downloading, setDownloading] = useState(false)
  const redownload = async () => {
    setDownloading(true)
    try {
      const res = await fetch(`/api/billing-handoffs/batches/${batch.id}/xlsx`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        toast(body.error ?? "Failed to download", "error")
        return
      }
      await downloadResponse(res, `${batch.batchNumber}.xlsx`)
    } catch (err) {
      toast(err instanceof Error ? err.message : "Network error", "error")
    }
    finally { setDownloading(false) }
  }

  return (
    <div className="rounded-xl border border-bd bg-sr shadow-card p-3.5 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="font-mono type-badge text-ac">{batch.batchNumber}</span>
          <p className="text-xs text-t3 mt-1 tabular-nums">{formatDisplayDate(batch.exportDate)}</p>
        </div>
        <span className="text-sm font-semibold text-t1 tabular-nums">{batch.recordCount} rows</span>
      </div>
      <p className="text-xs text-t2">{batch.exportedBy}</p>
      {batch.notes && <p className="text-xs text-t3 line-clamp-2">{batch.notes}</p>}
      <button
        onClick={redownload}
        disabled={downloading}
        className="text-xs text-ac hover:text-ach font-medium inline-flex items-center gap-1 disabled:opacity-50"
      >
        {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        Download
      </button>
    </div>
  )
}

function HandoffRow({ item, view, selected, onToggle, onQuoteSaved }: {
  item: BillingHandoff; view: View; selected: boolean; onToggle: (id: string) => void
  onQuoteSaved?: () => void
}) {
  return (
    <tr className="hover:bg-pg">
      {view === "awaiting" && (
        <td className="px-3 py-3 w-8">
          <input
            type="checkbox"
            className="h-4 w-4 accent-ac"
            aria-label={`Select ${item.drawingNumber}`}
            checked={selected}
            onChange={() => onToggle(item.id)}
          />
        </td>
      )}
      <td className="px-4 py-3 font-mono text-ac whitespace-nowrap font-semibold">{item.drawingNumber}</td>
      <td className="px-4 py-3 whitespace-nowrap"><TypeOfWorksBadge typeOfWorks={item.typeOfWorks} customTypeDescription={item.customTypeDescription} size="sm" /></td>
      <td className="px-4 py-3 text-t1 whitespace-nowrap">{item.clientCompany}</td>
      <td className="px-4 py-3 text-t3 max-w-[220px] truncate">{item.address}</td>
      <td className="px-4 py-3 whitespace-nowrap"><WorkItemTypeBadge itemType={item.itemType} size="sm" /></td>
      <td className="px-4 py-3 text-t3 tabular-nums whitespace-nowrap">{formatDisplayDate(item.completionDate)}</td>
      <td className="px-4 py-3 text-t2 whitespace-nowrap">{item.designer || <span className="text-t4 italic">Unassigned</span>}</td>
      <td className="px-4 py-3 text-t1 font-medium tabular-nums whitespace-nowrap">
        <HandoffQuoteValue item={item} view={view} onQuoteSaved={onQuoteSaved} />
      </td>
      {view === "cleared" && (
        <>
          <td className="px-4 py-3 text-t3 tabular-nums whitespace-nowrap">
            {item.clearedByAccountsAt ? format(new Date(item.clearedByAccountsAt), "d MMM yyyy") : "—"}
          </td>
          <td className="px-4 py-3 text-t3 whitespace-nowrap">{item.clearedBy || "—"}</td>
        </>
      )}
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <Link href={`/jobs/${item.sourceJobId}`} className="text-xs text-ac hover:text-ach font-medium inline-flex items-center gap-1">
          View job <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </td>
    </tr>
  )
}

function BatchRow({ batch }: { batch: BillingExportBatch }) {
  const { toast } = useToast()
  const [downloading, setDownloading] = useState(false)
  const redownload = async () => {
    setDownloading(true)
    try {
      const res = await fetch(`/api/billing-handoffs/batches/${batch.id}/xlsx`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        toast(body.error ?? "Failed to download", "error")
        return
      }
      await downloadResponse(res, `${batch.batchNumber}.xlsx`)
    } catch (err) {
      toast(err instanceof Error ? err.message : "Network error", "error")
    }
    finally { setDownloading(false) }
  }
  return (
    <tr className="hover:bg-pg">
      <td className="px-4 py-3 font-mono text-ac whitespace-nowrap font-semibold">{batch.batchNumber}</td>
      <td className="px-4 py-3 text-t3 tabular-nums whitespace-nowrap">{formatDisplayDate(batch.exportDate)}</td>
      <td className="px-4 py-3 text-t2 whitespace-nowrap">{batch.exportedBy}</td>
      <td className="px-4 py-3 text-t1 font-medium tabular-nums whitespace-nowrap">{batch.recordCount}</td>
      <td className="px-4 py-3 text-t3 max-w-[260px] truncate">{batch.notes || "—"}</td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <button onClick={redownload} disabled={downloading} className="text-xs text-ac hover:text-ach font-medium inline-flex items-center gap-1 disabled:opacity-50">
          {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Download
        </button>
      </td>
    </tr>
  )
}

function BillingPageInner() {
  const { toast } = useToast()
  const [view, setView]   = useState<View>("awaiting")
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 200
  // Perf: SWR key includes view+page so awaiting/cleared/history share the cache correctly.
  const listKey = view === "history" ? null : `/api/billing-handoffs?view=${view}&limit=${PAGE_SIZE}&page=${page}`
  const historyKey = view === "history" ? "/api/billing-handoffs/batches" : null
  const { data: listData, error: listError, isLoading: listLoading, mutate: mutateList } = useApi<{
    handoffs?: BillingHandoff[]
    awaitingCount?: number
    awaitingValue?: number
    clearedCount?: number
    total?: number
    truncated?: boolean
    page?: number
    limit?: number
    error?: string
  }>(listKey)
  const { data: historyData, error: historyError, isLoading: historyLoading, mutate: mutateHistory } = useApi<{
    batches?: BillingExportBatch[]
    error?: string
  }>(historyKey)

  const items = view === "history" ? null : (listData?.handoffs ?? (listLoading ? null : []))
  const batches = view === "history" ? (historyData?.batches ?? (historyLoading ? null : [])) : null
  const stats = listData ? {
    awaitingCount: listData.awaitingCount ?? 0,
    awaitingValue: listData.awaitingValue ?? 0,
    clearedCount: listData.clearedCount ?? 0,
  } : null
  const loadError = !!(listError || historyError ||
    (listData && !Array.isArray(listData.handoffs) && view !== "history") ||
    (historyData && !Array.isArray(historyData.batches) && view === "history"))

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (listError) toast(listError.message || "Failed to load billing queue", "error")
  }, [listError, toast])
  useEffect(() => {
    if (historyError) toast(historyError.message || "Failed to load export history", "error")
  }, [historyError, toast])

  const load = useCallback((v: View) => {
    setView(v)
    setPage(1)
    setSelected(new Set())
    if (v === "history") void mutateHistory()
    else void mutateList()
  }, [mutateHistory, mutateList])

  useEffect(() => { setSelected(new Set()) }, [view, page])

  const viewTotal = listData?.total
    ?? (view === "awaiting" ? stats?.awaitingCount : view === "cleared" ? stats?.clearedCount : undefined)
    ?? 0
  const totalPages = Math.max(1, Math.ceil(viewTotal / PAGE_SIZE))
  const truncated = !!listData?.truncated

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const toggleAll = () => setSelected(prev =>
    items && prev.size === items.length ? new Set() : new Set(items?.map(i => i.id) ?? [])
  )

  const colCount = view === "awaiting" ? 10 : view === "cleared" ? 10 : 6
  const { matches: isMobile, ready: mediaReady } = useClientMediaQuery("(max-width: 767px)")
  const showMobile = mediaReady && isMobile

  return (
    <PageShell wide className="space-y-5">
      <PageHeader
        title="Ready For Invoicing"
        description="A handoff queue for accounts — not an invoicing system. Completed work lands here automatically; exporting a selection raises a numbered Accounts Handover batch and clears those items."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiTile label="Awaiting Accounts Action" value={stats?.awaitingCount ?? "—"} sub={stats ? formatGBP(stats.awaitingValue) : undefined} accent="var(--color-wn)" valueClassName="text-wn-tx" />
        <KpiTile label="Cleared" value={stats?.clearedCount ?? "—"} accent="var(--color-ok-ic)" valueClassName="text-ok-ic" />
      </div>

      <TabBar
        active={view}
        onChange={v => load(v as View)}
        trailing={
          view === "awaiting" && selected.size > 0 ? (
            <Button size="sm" variant="primary" onClick={() => setExporting(true)}>
              Export Selected ({selected.size})
            </Button>
          ) : undefined
        }
        tabs={[
          { id: "awaiting", label: "Awaiting Accounts Action", icon: Clock },
          { id: "cleared", label: "Cleared", icon: ClipboardCheck },
          { id: "history", label: "Export History", icon: FileSpreadsheet },
        ]}
      />

      {loadError && (
        <div className="bg-dn-bg border border-dn-bd rounded-md px-4 py-3 text-sm text-dn-tx">
          Could not load billing data. If this is a fresh Vercel deploy, ensure Supabase env vars are set and data has been synced.
        </div>
      )}

      {view !== "history" && truncated && (
        <div className="bg-wn-bg border border-wn-bd rounded-md px-4 py-3 text-sm text-wn-tx">
          Showing page {page} of {totalPages} ({items?.length ?? 0} of {viewTotal} items). Use the controls below to see the rest before exporting.
        </div>
      )}

      {view !== "history" && (
        <TablePagination
          variant="bare"
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          total={viewTotal}
          pageSize={PAGE_SIZE}
          disabled={listLoading}
        />
      )}

      {view === "history" ? (
        showMobile ? (
          <div className="space-y-2.5">
            {batches === null ? (
              <DataPanel className="px-4 py-10 text-center text-t4">
                <Loader2 className="h-4 w-4 animate-spin inline" />
              </DataPanel>
            ) : batches.length === 0 ? (
              <DataPanel className="px-4 py-10 text-center text-t4 text-xs">No exports yet.</DataPanel>
            ) : (
              batches.map(b => <BatchMobileCard key={b.id} batch={b} />)
            )}
          </div>
        ) : (
        <DataPanel className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-pg border-b border-bd">
                <th className="px-4 py-2 text-left font-semibold text-t3">Batch Number</th>
                <th className="px-4 py-2 text-left font-semibold text-t3">Export Date</th>
                <th className="px-4 py-2 text-left font-semibold text-t3">Exported By</th>
                <th className="px-4 py-2 text-left font-semibold text-t3">Record Count</th>
                <th className="px-4 py-2 text-left font-semibold text-t3">Notes</th>
                <th className="px-4 py-2 w-1" />
              </tr>
            </thead>
            <tbody className="divide-y divide-bd">
              {batches === null ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-t4"><Loader2 className="h-4 w-4 animate-spin inline" /></td></tr>
              ) : batches.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-t4 text-xs">No exports yet.</td></tr>
              ) : (
                batches.map(b => <BatchRow key={b.id} batch={b} />)
              )}
            </tbody>
          </table>
        </DataPanel>
        )
      ) : showMobile ? (
        <div className="space-y-2.5">
          {view === "awaiting" && items && items.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-t3 px-1 min-h-11">
              <input
                type="checkbox"
                className="h-4 w-4 accent-ac"
                aria-label="Select all on this page"
                checked={selected.size === items.length}
                onChange={toggleAll}
              />
              Select all on this page
            </label>
          )}
          {items === null ? (
            <DataPanel className="px-4 py-10 text-center text-t4">
              <Loader2 className="h-4 w-4 animate-spin inline" />
            </DataPanel>
          ) : items.length === 0 ? (
            <DataPanel className="px-4 py-10 text-center text-t4 text-xs">
              {view === "awaiting" ? "Nothing awaiting accounts action." : "Nothing cleared yet."}
            </DataPanel>
          ) : (
            items.map(item => (
              <HandoffMobileCard
                key={item.id}
                item={item}
                view={view}
                selected={selected.has(item.id)}
                onToggle={toggle}
                onQuoteSaved={() => load(view)}
              />
            ))
          )}
        </div>
      ) : (
        <DataPanel className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-pg border-b border-bd">
                {view === "awaiting" && (
                  <th className="px-3 py-2 w-8">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-ac"
                      aria-label="Select all on this page"
                      checked={!!items && items.length > 0 && selected.size === items.length}
                      onChange={toggleAll}
                    />
                  </th>
                )}
                <th className="px-4 py-2 text-left font-semibold text-t3">Job Number</th>
                <th className="px-4 py-2 text-left font-semibold text-t3">Project</th>
                <th className="px-4 py-2 text-left font-semibold text-t3">Client</th>
                <th className="px-4 py-2 text-left font-semibold text-t3">Site Address</th>
                <th className="px-4 py-2 text-left font-semibold text-t3">Job Type</th>
                <th className="px-4 py-2 text-left font-semibold text-t3">Completed</th>
                <th className="px-4 py-2 text-left font-semibold text-t3">Assigned Staff</th>
                <th className="px-4 py-2 text-left font-semibold text-t3">Value</th>
                {view === "cleared" && (
                  <>
                    <th className="px-4 py-2 text-left font-semibold text-t3">Cleared</th>
                    <th className="px-4 py-2 text-left font-semibold text-t3">Cleared By</th>
                  </>
                )}
                <th className="px-4 py-2 w-1" />
              </tr>
            </thead>
            <tbody className="divide-y divide-bd">
              {items === null ? (
                <tr><td colSpan={colCount} className="px-4 py-10 text-center text-t4"><Loader2 className="h-4 w-4 animate-spin inline" /></td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={colCount} className="px-4 py-10 text-center text-t4 text-xs">
                  {view === "awaiting" ? "Nothing awaiting accounts action." : "Nothing cleared yet."}
                </td></tr>
              ) : (
                items.map(item => (
                  <HandoffRow
                    key={item.id}
                    item={item}
                    view={view}
                    selected={selected.has(item.id)}
                    onToggle={toggle}
                    onQuoteSaved={() => load(view)}
                  />
                ))
              )}
            </tbody>
          </table>
        </DataPanel>
      )}

      {exporting && (
        <ExportModal
          ids={[...selected]}
          onClose={() => setExporting(false)}
          onExported={() => { setExporting(false); load("awaiting") }}
        />
      )}
    </PageShell>
  )
}

export default function BillingPage() {
  return (
    <RequireRole roles={["ADMIN"]}>
      <BillingPageInner />
    </RequireRole>
  )
}
