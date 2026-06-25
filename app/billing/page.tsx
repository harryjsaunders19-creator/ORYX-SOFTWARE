"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { Clock, ArrowUpRight, Loader2, ClipboardCheck, Download, FileSpreadsheet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { WorkItemTypeBadge } from "@/components/work-item-type-badge"
import { TypeOfWorksBadge } from "@/components/type-of-works-badge"
import { useToast } from "@/components/ui/toast"
import { useUser } from "@/components/user-context"
import { RequireRole } from "@/components/require-role"
import { formatGBP, parseLocalDate } from "@/lib/utils"
import type { BillingHandoff, BillingExportBatch } from "@/lib/types"

type View = "awaiting" | "cleared" | "history"

function KpiCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="bg-sr border border-bd rounded-md p-4">
      <p className="text-xs font-medium text-t3 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${accent ?? "text-t1"}`}>{value}</p>
      {sub && <p className="text-xs text-t4 mt-0.5">{sub}</p>}
    </div>
  )
}

async function downloadResponse(res: Response, fallbackName: string) {
  const blob = await res.blob()
  const disposition = res.headers.get("Content-Disposition") ?? ""
  const match = disposition.match(/filename="([^"]+)"/)
  const filename = match?.[1] ?? fallbackName
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function ExportModal({ count, onClose, onExported }: {
  count: number
  onClose: () => void
  onExported: (batchNumber: string) => void
}) {
  const { userName } = useUser()
  const { toast } = useToast()
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)

  const submit = async (handoffIds: string[]) => {
    setSaving(true)
    try {
      const res = await fetch("/api/billing-handoffs/export", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handoffIds, exportedBy: userName, notes: notes.trim() || null }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        toast(body.error ?? "Export failed", "error")
        return
      }
      const batchNumber = res.headers.get("X-Batch-Number") ?? ""
      await downloadResponse(res, "accounts-handover.xlsx")
      toast(`${batchNumber} exported — ${count} item${count === 1 ? "" : "s"} cleared`, "success")
      onExported(batchNumber)
    } catch { toast("Network error", "error") }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.45)" }} data-handoff-ids="">
      <div className="bg-sr rounded-xl border border-bd shadow-modal w-[calc(100vw-2rem)] max-w-[460px] overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b border-bd">
          <div className="flex items-center gap-2 mb-1">
            <FileSpreadsheet className="h-4 w-4 text-ac2" />
            <p className="text-sm font-semibold text-t1">Export Accounts Handover</p>
          </div>
          <p className="text-xs text-t3">{count} item{count === 1 ? "" : "s"} selected</p>
        </div>
        <div className="px-6 py-5 space-y-3">
          <p className="text-xs text-t3">
            This downloads a complete workbook for accounts — client, project, commercial, revision, and audit
            details across all selected items — and creates a numbered billing batch. Once exported, these items
            move to Cleared and won&rsquo;t reappear here.
          </p>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-t2">Batch notes (optional)</label>
            <Textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Weekly handover for w/e 21 June"
              rows={2} autoFocus
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-bd flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            variant="primary" className="flex-1" loading={saving}
            onClick={() => { const ids = (window as unknown as { __pendingExportIds: string[] }).__pendingExportIds ?? []; submit(ids) }}
          >
            {saving ? "Exporting…" : "Export & Process"}
          </Button>
        </div>
      </div>
    </div>
  )
}

function HandoffRow({ item, view, selected, onToggle }: {
  item: BillingHandoff; view: View; selected: boolean; onToggle: (id: string) => void
}) {
  return (
    <tr className="hover:bg-pg">
      {view === "awaiting" && (
        <td className="px-3 py-3 w-8">
          <input type="checkbox" className="h-4 w-4 accent-ac" checked={selected} onChange={() => onToggle(item.id)} />
        </td>
      )}
      <td className="px-4 py-3 font-mono text-ac whitespace-nowrap font-semibold">{item.drawingNumber}</td>
      <td className="px-4 py-3 whitespace-nowrap"><TypeOfWorksBadge typeOfWorks={item.typeOfWorks} customTypeDescription={item.customTypeDescription} size="sm" /></td>
      <td className="px-4 py-3 text-t1 whitespace-nowrap">{item.clientCompany}</td>
      <td className="px-4 py-3 text-t3 max-w-[220px] truncate">{item.address}</td>
      <td className="px-4 py-3 whitespace-nowrap"><WorkItemTypeBadge itemType={item.itemType} size="sm" /></td>
      <td className="px-4 py-3 text-t3 tabular-nums whitespace-nowrap">{format(parseLocalDate(item.completionDate), "d MMM yyyy")}</td>
      <td className="px-4 py-3 text-t2 whitespace-nowrap">{item.designer || <span className="text-t4 italic">Unassigned</span>}</td>
      <td className="px-4 py-3 text-t1 font-medium tabular-nums whitespace-nowrap">
        {item.quoteValue != null ? formatGBP(item.quoteValue) : "—"}
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
          View job <ArrowUpRight className="h-3 w-3" />
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
      if (!res.ok) { toast("Failed to download", "error"); return }
      await downloadResponse(res, `${batch.batchNumber}.xlsx`)
    } catch { toast("Network error", "error") }
    finally { setDownloading(false) }
  }
  return (
    <tr className="hover:bg-pg">
      <td className="px-4 py-3 font-mono text-ac whitespace-nowrap font-semibold">{batch.batchNumber}</td>
      <td className="px-4 py-3 text-t3 tabular-nums whitespace-nowrap">{format(parseLocalDate(batch.exportDate), "d MMM yyyy")}</td>
      <td className="px-4 py-3 text-t2 whitespace-nowrap">{batch.exportedBy}</td>
      <td className="px-4 py-3 text-t1 font-medium tabular-nums whitespace-nowrap">{batch.recordCount}</td>
      <td className="px-4 py-3 text-t3 max-w-[260px] truncate">{batch.notes || "—"}</td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <button onClick={redownload} disabled={downloading} className="text-xs text-ac hover:text-ach font-medium inline-flex items-center gap-1 disabled:opacity-50">
          {downloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
          Download
        </button>
      </td>
    </tr>
  )
}

function BillingPageInner() {
  const [view, setView]   = useState<View>("awaiting")
  const [items, setItems] = useState<BillingHandoff[] | null>(null)
  const [batches, setBatches] = useState<BillingExportBatch[] | null>(null)
  const [stats, setStats] = useState<{ awaitingCount: number; awaitingValue: number; clearedCount: number } | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)

  const load = (v: View) => {
    if (v === "history") {
      setBatches(null)
      fetch("/api/billing-handoffs/batches")
        .then(r => r.json() as Promise<{ batches: BillingExportBatch[] }>)
        .then(d => setBatches(d.batches)).catch(() => setBatches([]))
      return
    }
    setItems(null)
    setSelected(new Set())
    fetch(`/api/billing-handoffs?view=${v}`)
      .then(r => r.json() as Promise<{ handoffs: BillingHandoff[]; awaitingCount: number; awaitingValue: number; clearedCount: number }>)
      .then(d => { setItems(d.handoffs); setStats({ awaitingCount: d.awaitingCount, awaitingValue: d.awaitingValue, clearedCount: d.clearedCount }) })
      .catch(() => setItems([]))
  }

  useEffect(() => { load(view) }, [view])

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const toggleAll = () => setSelected(prev =>
    items && prev.size === items.length ? new Set() : new Set(items?.map(i => i.id) ?? [])
  )

  const colCount = view === "awaiting" ? 10 : view === "cleared" ? 10 : 6

  return (
    <div className="px-6 py-6 space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-t1">Ready For Invoicing</h1>
        <p className="text-sm text-t3 mt-0.5">
          A handoff queue for accounts — not an invoicing system. Completed work lands here automatically;
          exporting a selection raises a numbered Accounts Handover batch and clears those items.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard label="Awaiting Accounts Action" value={stats?.awaitingCount ?? "—"} sub={stats ? formatGBP(stats.awaitingValue) : undefined} accent="text-wn-tx" />
        <KpiCard label="Cleared" value={stats?.clearedCount ?? "—"} accent="text-ok-tx" />
      </div>

      <div className="flex items-center justify-between border-b border-bd">
        <div className="flex items-center gap-1">
          {([
            { v: "awaiting" as View, label: "Awaiting Accounts Action", icon: Clock },
            { v: "cleared"  as View, label: "Cleared",                  icon: ClipboardCheck },
            { v: "history"  as View, label: "Export History",           icon: FileSpreadsheet },
          ]).map(({ v, label, icon: Icon }) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-none ${
                view === v ? "border-ac text-ac" : "border-transparent text-t3 hover:text-t2"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
        {view === "awaiting" && selected.size > 0 && (
          <Button size="sm" variant="primary" onClick={() => setExporting(true)}>
            Export Selected ({selected.size})
          </Button>
        )}
      </div>

      {view === "history" ? (
        <div className="bg-sr border border-bd rounded-md overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-pg border-b border-bd">
                <th className="px-4 py-2 text-left font-semibold text-t3 uppercase tracking-wider">Batch Number</th>
                <th className="px-4 py-2 text-left font-semibold text-t3 uppercase tracking-wider">Export Date</th>
                <th className="px-4 py-2 text-left font-semibold text-t3 uppercase tracking-wider">Exported By</th>
                <th className="px-4 py-2 text-left font-semibold text-t3 uppercase tracking-wider">Record Count</th>
                <th className="px-4 py-2 text-left font-semibold text-t3 uppercase tracking-wider">Notes</th>
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
        </div>
      ) : (
        <div className="bg-sr border border-bd rounded-md overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-pg border-b border-bd">
                {view === "awaiting" && (
                  <th className="px-3 py-2 w-8">
                    <input type="checkbox" className="h-4 w-4 accent-ac" checked={!!items && items.length > 0 && selected.size === items.length} onChange={toggleAll} />
                  </th>
                )}
                <th className="px-4 py-2 text-left font-semibold text-t3 uppercase tracking-wider">Job Number</th>
                <th className="px-4 py-2 text-left font-semibold text-t3 uppercase tracking-wider">Project</th>
                <th className="px-4 py-2 text-left font-semibold text-t3 uppercase tracking-wider">Client</th>
                <th className="px-4 py-2 text-left font-semibold text-t3 uppercase tracking-wider">Site Address</th>
                <th className="px-4 py-2 text-left font-semibold text-t3 uppercase tracking-wider">Job Type</th>
                <th className="px-4 py-2 text-left font-semibold text-t3 uppercase tracking-wider">Completed</th>
                <th className="px-4 py-2 text-left font-semibold text-t3 uppercase tracking-wider">Assigned Staff</th>
                <th className="px-4 py-2 text-left font-semibold text-t3 uppercase tracking-wider">Value</th>
                {view === "cleared" && (
                  <>
                    <th className="px-4 py-2 text-left font-semibold text-t3 uppercase tracking-wider">Cleared</th>
                    <th className="px-4 py-2 text-left font-semibold text-t3 uppercase tracking-wider">Cleared By</th>
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
                  <HandoffRow key={item.id} item={item} view={view} selected={selected.has(item.id)} onToggle={toggle} />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {exporting && (
        <ExportModalWrapper
          ids={[...selected]}
          onClose={() => setExporting(false)}
          onExported={() => { setExporting(false); load("awaiting") }}
        />
      )}
    </div>
  )
}

// Thin wrapper so ExportModal can read the selected ids without prop-drilling
// through a window global — keeps the modal component reusable/testable.
function ExportModalWrapper({ ids, onClose, onExported }: { ids: string[]; onClose: () => void; onExported: (batchNumber: string) => void }) {
  useEffect(() => { (window as unknown as { __pendingExportIds: string[] }).__pendingExportIds = ids }, [ids])
  return <ExportModal count={ids.length} onClose={onClose} onExported={onExported} />
}

export default function BillingPage() {
  return (
    <RequireRole roles={["ADMIN"]}>
      <BillingPageInner />
    </RequireRole>
  )
}
