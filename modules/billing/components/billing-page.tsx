"use client"
import { useEffect, useState, useCallback } from "react"
import { Clock, Loader2, ClipboardCheck, FileSpreadsheet } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { useToast } from "@/shared/ui/toast"
import { RequireRole } from "@/components/require-role"
import { PageHeader, PageShell, DataPanel, KpiTile, TabBar, TablePagination } from "@/shared/layouts/page-layout"
import { formatGBP } from "@/shared/utils/utils"
import { useClientMediaQuery } from "@/shared/hooks/use-media-query"
import { useApi } from "@/shared/hooks/use-api"
import type { BillingHandoff, BillingExportBatch } from "@/lib/types"
import { ExportModal } from "./billing-export-modal"
import { HandoffRow, HandoffMobileCard } from "./billing-handoff-row"
import { BatchRow, BatchMobileCard } from "./billing-batch-row"
import { type View } from "./billing-handoff-quote-value"

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
                <th className="px-4 py-2 text-left ">Batch Number</th>
                <th className="px-4 py-2 text-left ">Export Date</th>
                <th className="px-4 py-2 text-left ">Exported By</th>
                <th className="px-4 py-2 text-left ">Record Count</th>
                <th className="px-4 py-2 text-left ">Notes</th>
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
                <th className="px-4 py-2 text-left ">Job Number</th>
                <th className="px-4 py-2 text-left ">Project</th>
                <th className="px-4 py-2 text-left ">Client</th>
                <th className="px-4 py-2 text-left ">Site Address</th>
                <th className="px-4 py-2 text-left ">Job Type</th>
                <th className="px-4 py-2 text-left ">Completed</th>
                <th className="px-4 py-2 text-left ">Assigned Staff</th>
                <th className="px-4 py-2 text-left ">Value</th>
                {view === "cleared" && (
                  <>
                    <th className="px-4 py-2 text-left ">Cleared</th>
                    <th className="px-4 py-2 text-left ">Cleared By</th>
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
    <RequireRole roles={["ADMIN", "ACCOUNTS"]}>
      <BillingPageInner />
    </RequireRole>
  )
}
