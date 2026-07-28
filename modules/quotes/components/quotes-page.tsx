"use client"
import { Suspense, memo, useCallback, useEffect, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"
import { format } from "date-fns"
import {
  Plus, FileText, Download, CheckCircle2, XCircle,
  Loader2, Clock, FileDown, Trash2, Archive,
} from "lucide-react"
import { Button }   from "@/shared/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogBody,
} from "@/shared/ui/dialog"
import { useToast } from "@/shared/ui/toast"
import { formatGBP, cn, parseLocalDate, getQuoteExpiryInfo, quoteExpiryBadgeClass } from "@/shared/utils/utils"
import { quoteWorksDisplayLabel, inferQuoteWorksFromDescription } from "../quote-works"
import { PageHeader, PageShell, SearchField, DataPanel, EmptyPanel, TablePagination } from "@/shared/layouts/page-layout"
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value"
import { useClientMediaQuery } from "@/shared/hooks/use-media-query"
import { useApi, optimisticListRemove, optimisticListPrepend } from "@/shared/hooks/use-api"
import { QUOTE_STATUSES } from "@/lib/types"
import type { Quote } from "@/lib/types"
import { resolveQuotePdfUrl } from "../pdf/urls"
import { EMPTY_FORM, type QuoteFormData } from "./quote-form"

// Perf: code-split form + convert modal (same pattern as jobs JobForm).
const QuoteForm = dynamic(() => import("./quote-form").then(m => m.QuoteForm), { ssr: false })
const CreateJobFromQuoteModal = dynamic(
  () => import("./create-job-from-quote-modal").then(m => m.CreateJobFromQuoteModal),
  { ssr: false },
)

type QuotesData = {
  quotes: Quote[]
  total: number
  page: number
  limit: number
  expiringSoonCount?: number
  expiredClearableCount?: number
}

const QUOTE_PAGE_LIMIT = 25

function statusMeta(status: string) {
  return QUOTE_STATUSES.find(s => s.value === status) ?? QUOTE_STATUSES[0]
}

function QuoteStatusBadge({ status }: { status: string }) {
  const s = statusMeta(status)
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
      s.color,
    )}>
      {s.label}
    </span>
  )
}

function QuoteExpiryCell({ quote }: { quote: Quote }) {
  const info = getQuoteExpiryInfo(quote.expiryDate, quote.status)
  if (!quote.expiryDate) {
    return <span className="text-xs text-t4">—</span>
  }
  return (
    <div className="space-y-1">
      <p className="text-xs text-t3 tabular-nums">
        {format(parseLocalDate(quote.expiryDate), "d MMM yyyy")}
      </p>
      {info.severity !== "none" && (
        <span className={cn(
          "inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded-full",
          quoteExpiryBadgeClass(info.severity),
        )}>
          {info.label}
        </span>
      )}
    </div>
  )
}

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

function QuoteRowActions({ quote: q, isPdfBusy, onGeneratePdf, onEdit, onSetStatus, onConvert, onArchive }: {
  quote: Quote
  isPdfBusy: boolean
  onGeneratePdf: (q: Quote) => void
  onEdit: (q: Quote) => void
  onSetStatus: (q: Quote, status: string) => void
  onConvert: (q: Quote) => void
  onArchive: (q: Quote) => void
}) {
  return (
    <div className="flex items-center gap-1 justify-end flex-wrap">
      {q.pdfPath ? (
        <a href={resolveQuotePdfUrl(q.id, q.pdfPath) ?? "#"} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-t3 hover:text-ac px-1.5 py-1 rounded hover:bg-pg" title="Open PDF">
          <FileDown className="h-3.5 w-3.5" />
        </a>
      ) : (
        <button onClick={() => onGeneratePdf(q)} disabled={isPdfBusy}
          className="inline-flex items-center gap-1 text-xs text-t3 hover:text-ac px-1.5 py-1 rounded hover:bg-pg disabled:opacity-50"
          title="Generate PDF">
          {isPdfBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        </button>
      )}
      <Button variant="ghost" size="sm" onClick={() => onEdit(q)}>Edit</Button>
      {q.status === "DRAFT" && (
        <Button variant="ghost" size="sm" onClick={() => onSetStatus(q, "SENT")}>
          <Clock className="h-3.5 w-3.5" /> Sent
        </Button>
      )}
      {(q.status === "DRAFT" || q.status === "SENT")
        && getQuoteExpiryInfo(q.expiryDate, q.status).severity !== "expired" && (
        <>
          <Button variant="ghost" size="sm" className="text-ok-tx hover:bg-ok-bg" onClick={() => onSetStatus(q, "ACCEPTED")}>
            <CheckCircle2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="text-dn hover:bg-dn-bg" onClick={() => onSetStatus(q, "REJECTED")}>
            <XCircle className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
      {q.status === "ACCEPTED" && !q.jobId && (
        <Button variant="primary" size="sm" onClick={() => onConvert(q)}>Create Job</Button>
      )}
      {!q.jobId && (
        <Button variant="ghost" size="sm" className="text-t4 hover:text-wn-tx hover:bg-wn-bg" title="Archive quote" onClick={() => onArchive(q)}>
          <Archive className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}

const QuoteMobileCard = memo(function QuoteMobileCard({
  quote: q,
  isPdfBusy,
  onGeneratePdf,
  onEdit,
  onSetStatus,
  onConvert,
  onArchive,
}: {
  quote: Quote
  isPdfBusy: boolean
  onGeneratePdf: (q: Quote) => void
  onEdit: (q: Quote) => void
  onSetStatus: (q: Quote, status: string) => void
  onConvert: (q: Quote) => void
  onArchive: (q: Quote) => void
}) {
  return (
    <div className="rounded-xl border border-bd bg-sr shadow-card p-3.5 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="font-mono text-xs font-bold text-ac">{q.quoteNumber}</span>
          <p className="text-sm font-medium text-t1 mt-1 truncate">{q.clientCompany}</p>
          {q.contactName && <p className="text-xs text-t3 truncate">{q.contactName}</p>}
          <p className="text-xs text-t2 mt-1 line-clamp-2">
            {quoteWorksDisplayLabel(q.typeOfWorks, q.customTypeDescription, q.description)}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold tabular-nums text-t1">{formatGBP(q.quoteValue)}</p>
          {q.vatRate != null && <p className="text-[10px] text-t4">+{q.vatRate}% VAT</p>}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap text-xs text-t3">
        <span className="tabular-nums">{format(parseLocalDate(q.quoteDate), "d MMM yyyy")}</span>
        <QuoteExpiryCell quote={q} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <QuoteStatusBadge status={q.status} />
        {q.jobId && (
          <Link href={`/jobs/${q.jobId}`} prefetch={false} className="text-[11px] text-ac hover:underline">
            View job →
          </Link>
        )}
      </div>

      <div className="pt-2 border-t border-bd/60">
        <QuoteRowActions
          quote={q}
          isPdfBusy={isPdfBusy}
          onGeneratePdf={onGeneratePdf}
          onEdit={onEdit}
          onSetStatus={onSetStatus}
          onConvert={onConvert}
          onArchive={onArchive}
        />
      </div>
    </div>
  )
})

function QuoteTableRow({ quote: q, isPdfBusy, onGeneratePdf, onEdit, onSetStatus, onConvert, onArchive }: {
  quote: Quote
  isPdfBusy: boolean
  onGeneratePdf: (q: Quote) => void
  onEdit: (q: Quote) => void
  onSetStatus: (q: Quote, status: string) => void
  onConvert: (q: Quote) => void
  onArchive: (q: Quote) => void
}) {
  return (
    <tr className="border-b border-bd last:border-0 hover:bg-pg">
      <td className="px-4 py-3 whitespace-nowrap">
        <span className="font-mono text-[11px] font-semibold text-ac">{q.quoteNumber}</span>
      </td>
      <td className="px-4 py-3 max-w-[140px]">
        <p className="text-xs font-medium text-t1 truncate">{q.clientCompany}</p>
        {q.contactName && <p className="text-xs text-t3 truncate">{q.contactName}</p>}
      </td>
      <td className="px-4 py-3 max-w-[220px]">
        <p className="text-xs text-t2 truncate">
          {quoteWorksDisplayLabel(q.typeOfWorks, q.customTypeDescription, q.description)}
        </p>
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <p className="text-xs font-semibold tabular-nums text-t1">{formatGBP(q.quoteValue)}</p>
        {q.vatRate != null && <p className="text-[10px] text-t4">+{q.vatRate}% VAT</p>}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <p className="text-xs text-t3 tabular-nums">{format(parseLocalDate(q.quoteDate), "d MMM yyyy")}</p>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <QuoteExpiryCell quote={q} />
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <QuoteStatusBadge status={q.status} />
        {q.jobId && (
          <Link href={`/jobs/${q.jobId}`} prefetch={false} className="block text-[10px] text-ac hover:underline mt-0.5">
            View job →
          </Link>
        )}
      </td>
      <td className="px-4 py-3">
        <QuoteRowActions
          quote={q}
          isPdfBusy={isPdfBusy}
          onGeneratePdf={onGeneratePdf}
          onEdit={onEdit}
          onSetStatus={onSetStatus}
          onConvert={onConvert}
          onArchive={onArchive}
        />
      </td>
    </tr>
  )
}
const MemoQuoteTableRow = memo(QuoteTableRow)

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

  useEffect(() => {
    if (searchParams.get("new") !== "1") return
    setCreateOpen(true)
    const next = new URLSearchParams(searchParams.toString())
    next.delete("new")
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

  const doCreate = async (form: QuoteFormData) => {
    setSaving(true)
    try {
      const res = await fetch("/api/quotes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, status: "DRAFT" }),
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
    setPdfGenerating(quote.id)
    try {
      const res = await fetch(`/api/quotes/${quote.id}/pdf`, { method: "POST" })
      const body = await res.json() as { status?: string; pdfPath?: string; error?: string }
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
          const pollRes = await fetch(`/api/quotes/${quote.id}/pdf`)
          const pollBody = await pollRes.json() as { status: string; pdfPath?: string; error?: string }
          if (!pollRes.ok) return pollBody.error ?? null
          if (pollBody.status === "ready" && pollBody.pdfPath) return pollBody.pdfPath
        }
        return null
      }

      const pdfPath = await pollForPdf()
      if (!pdfPath) { toast("PDF generation timed out", "error"); return }
      window.open(pdfPath, "_blank")
      toast(`PDF generated for ${quote.quoteNumber}`, "success")
      mutate()
    } catch { toast("Network error", "error") }
    finally { setPdfGenerating(null) }
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

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <SearchField value={search} onChange={setSearch} placeholder="Search quotes…" className="max-w-xs" />
        <div className="flex items-center gap-1 flex-wrap">
          <button onClick={() => setStatusFilter("ALL")}
            className={cn("text-[11px] px-2 py-0.5 rounded border font-medium",
              statusFilter === "ALL" ? "bg-ac text-on-ac border-ac" : "border-bd text-t3 hover:text-t2")}>
            All
          </button>
          {QUOTE_STATUSES.map(s => (
            <button key={s.value} onClick={() => setStatusFilter(s.value)}
              className={cn("text-[11px] px-2 py-0.5 rounded border font-medium",
                statusFilter === s.value ? s.color : "border-bd text-t3 hover:text-t2")}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {(data?.expiringSoonCount ?? 0) > 0 && statusFilter !== "EXPIRED" && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-xl border border-wn-bd bg-wn-bg text-sm text-wn-tx">
          <Clock className="h-4 w-4 shrink-0" />
          <p>
            <span className="font-semibold">{data!.expiringSoonCount}</span>
            {" "}sent quote{data!.expiringSoonCount !== 1 ? "s" : ""} expiring within 7 days —
            {" "}
            <button
              type="button"
              className="text-ac hover:text-ach font-medium underline"
              onClick={() => setStatusFilter("SENT")}
            >
              view sent quotes
            </button>
          </p>
        </div>
      )}

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
            />
          ))}
        </div>
      ) : (
        <DataPanel className={cn("overflow-x-auto overscroll-x-contain transition-opacity", refreshing && "opacity-60")}>
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="bg-surface-low border-b border-bd text-xs">
                <th className="px-4 py-2.5 text-left font-semibold text-t3">Quote No.</th>
                <th className="px-4 py-2.5 text-left font-semibold text-t3">Client</th>
                <th className="px-4 py-2.5 text-left font-semibold text-t3">Type of works</th>
                <th className="px-4 py-2.5 text-right font-semibold text-t3">Value</th>
                <th className="px-4 py-2.5 text-left font-semibold text-t3">Date</th>
                <th className="px-4 py-2.5 text-left font-semibold text-t3">Expires</th>
                <th className="px-4 py-2.5 text-left font-semibold text-t3">Status</th>
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

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={o => { if (!o) setCreateOpen(false) }}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>New quote</DialogTitle></DialogHeader>
          <DialogBody>
            <QuoteForm formId="create-quote-form" initial={EMPTY_FORM} onSubmit={doCreate} />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="create-quote-form" variant="primary" loading={saving}>Create quote</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editQuote} onOpenChange={o => { if (!o) setEditQuote(null) }}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>Edit {editQuote?.quoteNumber}</DialogTitle></DialogHeader>
          <DialogBody>
            {editQuote && (
              <QuoteForm formId="edit-quote-form" initial={quoteToForm(editQuote)} quoteId={editQuote.id} onSubmit={doEdit} />
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditQuote(null)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="edit-quote-form" variant="primary" loading={saving}>Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create job from quote */}
      {convertQuote && (
        <CreateJobFromQuoteModal
          quote={convertQuote}
          onClose={() => setConvertQuote(null)}
          onConverted={() => { setConvertQuote(null); mutate() }}
        />
      )}

      {/* Archive single quote */}
      <Dialog open={!!archiveQuote} onOpenChange={o => { if (!o && !archiving) setArchiveQuote(null) }}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Archive quote?</DialogTitle></DialogHeader>
          <DialogBody>
            <p className="text-sm text-t2">
              <span className="font-semibold text-t1">{archiveQuote?.quoteNumber}</span>
              {" "}will be moved to the archive and hidden from the quotes list.
            </p>
            <p className="text-xs text-t3 mt-2">
              You can restore it from the{" "}
              <span className="font-medium text-t2">Archived Items</span>{" "}page.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveQuote(null)} disabled={archiving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={doArchive} loading={archiving} className="bg-wn hover:bg-wn/90">
              <Archive className="h-3.5 w-3.5" /> Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear all expired */}
      <Dialog open={clearConfirmOpen} onOpenChange={o => { if (!o && !clearing) setClearConfirmOpen(false) }}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Archive expired quotes?</DialogTitle></DialogHeader>
          <DialogBody>
            <p className="text-sm text-t2">
              <span className="font-semibold text-t1">{expiredClearableCount}</span>
              {" "}expired quote{expiredClearableCount !== 1 ? "s" : ""} that{" "}
              {expiredClearableCount === 1 ? "was" : "were"} never converted to a job will be archived.
            </p>
            <p className="text-xs text-t3 mt-2">
              They can be restored from the{" "}
              <span className="font-medium text-t2">Archived Items</span>{" "}page.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearConfirmOpen(false)} disabled={clearing}>
              Cancel
            </Button>
            <Button variant="primary" onClick={clearExpired} loading={clearing} className="bg-wn hover:bg-wn/90">
              <Archive className="h-3.5 w-3.5" /> Archive expired
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}
