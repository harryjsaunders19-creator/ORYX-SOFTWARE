"use client"
import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Plus, FileText, Trash2 } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { useToast } from "@/shared/ui/toast"
import { cn } from "@/shared/utils/utils"
import { inferQuoteWorksFromDescription } from "../quote-works"
import { PageHeader, PageShell, DataPanel, EmptyPanel, TablePagination } from "@/shared/layouts/page-layout"
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value"
import { useClientMediaQuery } from "@/shared/hooks/use-media-query"
import { useApi, optimisticListRemove, optimisticListPrepend } from "@/shared/hooks/use-api"
import type { Quote } from "@/lib/types"
import { type QuoteFormData } from "./quote-form"
import { statusMeta } from "./quote-status-badge"
import { MemoQuoteTableRow } from "./quotes-table-row"
import { QuoteMobileCard } from "./quotes-mobile-card"
import { QuotesFilterBar } from "./quotes-filter-bar"
import { QuotesDialogs } from "./quotes-dialogs"
import { LinkJobModal } from "./link-job-modal"

type QuotesData = {
  quotes: Quote[]
  total: number
  page: number
  limit: number
  expiringSoonCount?: number
  expiredClearableCount?: number
}

const QUOTE_PAGE_LIMIT = 25

export default function QuotesPage() {
  return (
    <Suspense
      fallback={
        <PageShell>
          <div className="skeleton h-9 w-36 rounded mb-2" />
          <div className="skeleton h-4 w-48 rounded mb-8" />
          <DataPanel>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 border-b border-bd last:border-0 px-4 flex items-center">
                <div className="skeleton h-4 w-64 rounded" />
              </div>
            ))}
          </DataPanel>
        </PageShell>
      }
    >
      <QuotesInner />
    </Suspense>
  )
}

function QuotesInner() {
  const { toast }    = useToast()
  const searchParams = useSearchParams()
  const router = useRouter()

  const [search,     setSearch]     = useState(() => searchParams.get("search") ?? "")
  const debouncedSearch = useDebouncedValue(search, 280)
  const [statusFilter, setStatusFilter] = useState("ALL")
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [editQuote,  setEditQuote]  = useState<Quote | null>(null)
  const [convertQuote, setConvertQuote] = useState<Quote | null>(null)
  const [saving,     setSaving]     = useState(false)
  const [pdfGenerating, setPdfGenerating] = useState<string | null>(null)
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [archiveQuote, setArchiveQuote] = useState<Quote | null>(null)
  const [archiving,    setArchiving]    = useState(false)

  // Guard PDF poll setState/toast/mutate after navigate-away. Network polls are left
  // to finish so the PDF can still land in cache; we only skip UI updates.
  const isMountedRef = useRef(true)
  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  // Prepopulate from URL params when navigated from "Create quote for job"
  const [createInitial, setCreateInitial] = useState<Partial<QuoteFormData> & { jobId?: string }>({})

  useEffect(() => {
    if (searchParams.get("new") !== "1") return
    const init: Partial<QuoteFormData> & { jobId?: string } = {}
    if (searchParams.get("jobId")) init.jobId = searchParams.get("jobId")!
    if (searchParams.get("clientCompany")) init.clientCompany = searchParams.get("clientCompany")!
    if (searchParams.get("clientId")) init.clientId = searchParams.get("clientId")!
    if (searchParams.get("address")) init.address = searchParams.get("address")!
    if (searchParams.get("typeOfWorks")) init.typeOfWorks = searchParams.get("typeOfWorks")!
    setCreateInitial(init)
    setCreateOpen(true)
    const next = new URLSearchParams(searchParams.toString())
    for (const k of ["new", "jobId", "clientCompany", "clientId", "address", "typeOfWorks"]) next.delete(k)
    const qs = next.toString()
    router.replace(qs ? `/quotes?${qs}` : "/quotes", { scroll: false })
  }, [searchParams, router])

  useEffect(() => { setPage(1) }, [debouncedSearch, statusFilter])

  const apiKey = `/api/quotes?${new URLSearchParams({
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(statusFilter !== "ALL" && { status: statusFilter }),
    page: String(page),
    limit: String(QUOTE_PAGE_LIMIT),
  })}`
  const { data, error, isLoading, isValidating, mutate } = useApi<QuotesData>(apiKey)

  useEffect(() => { if (error) toast("Failed to load quotes", "error") }, [error, toast])

  const loading = isLoading && !data
  const refreshing = isValidating && !!data
  const totalPages = data ? Math.max(1, Math.ceil(data.total / QUOTE_PAGE_LIMIT)) : 1
  const { matches: isMobile, ready: mediaReady } = useClientMediaQuery("(max-width: 767px)")

  const handleEdit = useCallback((q: Quote) => setEditQuote(q), [])
  const handleConvert = useCallback((q: Quote) => setConvertQuote(q), [])
  const handleArchiveOpen = useCallback((q: Quote) => setArchiveQuote(q), [])
  const [linkJobQuote, setLinkJobQuote] = useState<Quote | null>(null)
  const handleLinkJob = useCallback((q: Quote) => setLinkJobQuote(q), [])

  const doCreate = async (form: QuoteFormData) => {
    setSaving(true)
    try {
      const res = await fetch("/api/quotes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, status: "DRAFT", ...(createInitial.jobId && { jobId: createInitial.jobId }) }),
      })
      const body = await res.json() as Quote & { error?: string }
      if (!res.ok) { toast(body.error ?? "Failed to create quote", "error"); return }
      toast(`${body.quoteNumber} created`, "success")
      setCreateOpen(false)
      optimisticListPrepend(mutate, "quotes", body)
    } catch { toast("Network error", "error") }
    finally { setSaving(false) }
  }

  const doEdit = async (form: QuoteFormData) => {
    if (!editQuote) return
    setSaving(true)
    try {
      const res = await fetch(`/api/quotes/${editQuote.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const body = await res.json() as Quote & { error?: string }
      if (!res.ok) { toast(body.error ?? "Failed to save", "error"); return }
      toast("Quote updated", "success")
      setEditQuote(null)
      mutate()
    } catch { toast("Network error", "error") }
    finally { setSaving(false) }
  }

  const setStatus = useCallback(async (quote: Quote, status: string) => {
    try {
      const res = await fetch(`/api/quotes/${quote.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      const body = await res.json() as { error?: string }
      if (!res.ok) { toast(body.error ?? "Failed to update status", "error"); return }
      toast(`${quote.quoteNumber} marked ${statusMeta(status).label}`, status === "ACCEPTED" ? "success" : "info")
      mutate()
    } catch { toast("Network error", "error") }
  }, [mutate, toast])

  const generatePdf = useCallback(async (quote: Quote) => {
    if (!isMountedRef.current) return
    setPdfGenerating(quote.id)
    try {
      const res = await fetch(`/api/quotes/${quote.id}/pdf`, { method: "POST" })
      const body = await res.json() as { status?: string; pdfPath?: string; error?: string }
      if (!isMountedRef.current) return
      if (!res.ok) { toast(body.error ?? "PDF generation failed", "error"); return }

      if (body.status === "ready" && body.pdfPath) {
        window.open(body.pdfPath, "_blank")
        toast(`PDF generated for ${quote.quoteNumber}`, "success")
        mutate()
        return
      }

      const pollForPdf = async (): Promise<string | null> => {
        for (let attempt = 0; attempt < 60; attempt++) {
          await new Promise(r => setTimeout(r, 500))
          if (!isMountedRef.current) return null
          const pollRes = await fetch(`/api/quotes/${quote.id}/pdf`)
          if (!isMountedRef.current) return null
          const pollBody = await pollRes.json() as { status: string; pdfPath?: string; error?: string }
          if (!pollRes.ok) return pollBody.error ?? null
          if (pollBody.status === "ready" && pollBody.pdfPath) return pollBody.pdfPath
        }
        return null
      }

      const pdfPath = await pollForPdf()
      if (!isMountedRef.current) return
      if (!pdfPath) { toast("PDF generation timed out", "error"); return }
      window.open(pdfPath, "_blank")
      toast(`PDF generated for ${quote.quoteNumber}`, "success")
      mutate()
    } catch {
      if (isMountedRef.current) toast("Network error", "error")
    }
    finally {
      if (isMountedRef.current) setPdfGenerating(null)
    }
  }, [mutate, toast])

  const clearExpired = async () => {
    setClearing(true)
    try {
      const res = await fetch("/api/quotes/expired", { method: "DELETE" })
      const body = await res.json() as { archived?: number; error?: string }
      if (!res.ok) { toast(body.error ?? "Failed to archive expired quotes", "error"); return }
      const n = body.archived ?? 0
      toast(`Archived ${n} expired quote${n === 1 ? "" : "s"}`, "success")
      setClearConfirmOpen(false)
      mutate()
    } catch { toast("Network error", "error") }
    finally { setClearing(false) }
  }

  const doArchive = async () => {
    if (!archiveQuote) return
    setArchiving(true)
    try {
      const res = await fetch(`/api/quotes/${archiveQuote.id}`, { method: "DELETE" })
      const body = await res.json() as { error?: string }
      if (!res.ok) { toast(body.error ?? "Failed to archive quote", "error"); return }
      toast(`${archiveQuote.quoteNumber} archived`, "success")
      setArchiveQuote(null)
      optimisticListRemove(mutate, "quotes", archiveQuote.id)
    } catch { toast("Network error", "error") }
    finally { setArchiving(false) }
  }

  const expiredClearableCount = data?.expiredClearableCount ?? 0
  const total      = data?.total ?? 0

  const quoteToForm = (q: Quote): QuoteFormData => {
    const works = q.typeOfWorks
      ? { typeOfWorks: q.typeOfWorks, customTypeDescription: q.customTypeDescription ?? "" }
      : inferQuoteWorksFromDescription(q.description)
    return {
      clientId: q.clientId ?? "", clientCompany: q.clientCompany,
      contactName: q.contactName ?? "", address: q.address,
      typeOfWorks: works.typeOfWorks, customTypeDescription: works.customTypeDescription,
      quoteValue: String(q.quoteValue),
      quoteDate: q.quoteDate, expiryDate: q.expiryDate ?? "", notes: q.notes ?? "",
      vatRate: q.vatRate != null ? String(q.vatRate) : "",
      lineItems: [],
    }
  }

  return (
    <PageShell wide>
      <PageHeader
        title="Quotes"
        description={`${total} quote${total !== 1 ? "s" : ""}`}
        actions={
          <div className="flex items-center gap-2">
            {expiredClearableCount > 0 && (
              <Button variant="outline" size="sm" onClick={() => setClearConfirmOpen(true)}>
                <Trash2 className="h-3.5 w-3.5" />
                Clear expired ({expiredClearableCount})
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> New quote
            </Button>
          </div>
        }
      />

      <QuotesFilterBar
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        expiringSoonCount={data?.expiringSoonCount ?? 0}
        onViewSentQuotes={() => setStatusFilter("SENT")}
      />

      {/* Table */}
      {loading || !mediaReady ? (
        <DataPanel>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 border-b border-bd last:border-0 px-4 flex items-center">
              <div className="skeleton h-4 w-64 rounded" />
            </div>
          ))}
        </DataPanel>
      ) : !data?.quotes.length ? (
        <DataPanel>
          <EmptyPanel
            icon={FileText}
            title="No quotes yet"
            description="Create a quote to start the quotation workflow."
            action={
              <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> New quote
              </Button>
            }
          />
        </DataPanel>
      ) : isMobile ? (
        <div className={cn("space-y-2.5 transition-opacity", refreshing && "opacity-60")}>
          {data.quotes.map(q => (
            <QuoteMobileCard
              key={q.id}
              quote={q}
              isPdfBusy={pdfGenerating === q.id}
              onGeneratePdf={generatePdf}
              onEdit={handleEdit}
              onSetStatus={setStatus}
              onConvert={handleConvert}
              onArchive={handleArchiveOpen}
              onLinkJob={handleLinkJob}
            />
          ))}
        </div>
      ) : (
        <DataPanel className={cn("overflow-x-auto overscroll-x-contain transition-opacity", refreshing && "opacity-60")}>
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="bg-surface-low border-b border-bd text-xs">
                <th className="px-4 py-2.5 text-left ">Quote No.</th>
                <th className="px-4 py-2.5 text-left ">Client</th>
                <th className="px-4 py-2.5 text-left ">Type of works</th>
                <th className="px-4 py-2.5 text-right ">Value</th>
                <th className="px-4 py-2.5 text-left ">Date</th>
                <th className="px-4 py-2.5 text-left ">Expires</th>
                <th className="px-4 py-2.5 text-left ">Status</th>
                <th className="px-4 py-2.5 w-72" />
              </tr>
            </thead>
            <tbody>
              {data.quotes.map(q => (
                <MemoQuoteTableRow
                  key={q.id}
                  quote={q}
                  isPdfBusy={pdfGenerating === q.id}
                  onGeneratePdf={generatePdf}
                  onEdit={handleEdit}
                  onSetStatus={setStatus}
                  onConvert={handleConvert}
                  onArchive={handleArchiveOpen}
                  onLinkJob={handleLinkJob}
                />
              ))}
            </tbody>
          </table>
        </DataPanel>
      )}

      <TablePagination
        variant="bare"
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        total={data?.total}
        pageSize={QUOTE_PAGE_LIMIT}
      />

      <QuotesDialogs
        createOpen={createOpen}
        onCreateClose={() => { setCreateOpen(false); setCreateInitial({}) }}
        saving={saving}
        onCreateSubmit={doCreate}
        createInitialOverrides={createInitial}
        editQuote={editQuote}
        onEditClose={() => setEditQuote(null)}
        editInitial={editQuote ? quoteToForm(editQuote) : null}
        onEditSubmit={doEdit}
        convertQuote={convertQuote}
        onConvertClose={() => setConvertQuote(null)}
        onConverted={() => { setConvertQuote(null); mutate() }}
        archiveQuote={archiveQuote}
        archiving={archiving}
        onArchiveClose={() => setArchiveQuote(null)}
        onArchiveConfirm={doArchive}
        clearConfirmOpen={clearConfirmOpen}
        clearing={clearing}
        expiredClearableCount={expiredClearableCount}
        onClearClose={() => setClearConfirmOpen(false)}
        onClearConfirm={clearExpired}
      />

      <LinkJobModal
        quote={linkJobQuote}
        onClose={() => setLinkJobQuote(null)}
        onLinked={() => { setLinkJobQuote(null); mutate(); toast("Quote linked to job", "success") }}
      />
    </PageShell>
  )
}
