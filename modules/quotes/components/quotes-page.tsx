"use client"
import { Suspense, memo, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { format } from "date-fns"
import {
  Plus, FileText, Download, CheckCircle2, XCircle,
  Loader2, ArrowRight, Clock, FileDown, Trash2, Archive,
  ChevronLeft, ChevronRight, AlertTriangle,
} from "lucide-react"
import { Button }   from "@/shared/ui/button"
import { Input }    from "@/shared/ui/input"
import { Label }    from "@/shared/ui/label"
import { Textarea } from "@/shared/ui/textarea"
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogBody,
} from "@/shared/ui/dialog"
import { ClientCombobox } from "@/components/client-combobox"
import { DesignerCombobox } from "@/components/designer-combobox"
import { QuickCreateClientModal } from "@/components/quick-create-client-modal"
import { useToast } from "@/shared/ui/toast"
import { formatGBP, cn, parseLocalDate, defaultRequiredByDate, getQuoteExpiryInfo, quoteExpiryBadgeClass } from "@/shared/utils/utils"
import { OTHER_WORKS_TYPE } from "@/lib/constants"
import { inferQuoteWorksFromDescription, quoteWorksDisplayLabel } from "../quote-works"
import { TypeOfWorksCombobox } from "@/components/type-of-works-combobox"
import { PageHeader, PageShell, SearchField, DataPanel, EmptyPanel } from "@/shared/layouts/page-layout"
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value"
import { useMediaQuery } from "@/shared/hooks/use-media-query"
import { useApi, optimisticListRemove, optimisticListPrepend } from "@/shared/hooks/use-api"
import { QUOTE_STATUSES } from "@/lib/types"
import type { Quote, Client } from "@/lib/types"
import { resolveQuotePdfUrl } from "../pdf/urls"

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

const TODAY_ISO = new Date().toISOString().split("T")[0]
const addDaysIso = (iso: string, days: number) => {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().split("T")[0]
}

interface LineItemDraft { description: string; amount: string; vatApplicable: boolean }

const EMPTY_FORM = {
  clientId: "", clientCompany: "", contactName: "", address: "",
  typeOfWorks: "", customTypeDescription: "",
  quoteValue: "", quoteDate: TODAY_ISO,
  expiryDate: addDaysIso(TODAY_ISO, 30), notes: "", vatRate: "20",
  lineItems: [] as LineItemDraft[],
}
type QuoteFormData = typeof EMPTY_FORM

function QuoteForm({ formId, initial, quoteId, onSubmit }: {
  formId: string
  initial: QuoteFormData
  quoteId?: string
  onSubmit: (data: QuoteFormData) => void
}) {
  const [form, setForm] = useState<QuoteFormData>(initial)
  const [quickCreateName, setQuickCreateName] = useState("")
  const [worksError, setWorksError] = useState<string | null>(null)
  const [customWorksError, setCustomWorksError] = useState<string | null>(null)
  const [clientError, setClientError] = useState<string | null>(null)
  const [addressError, setAddressError] = useState<string | null>(null)
  const [expiryTouched, setExpiryTouched] = useState(
    () => !!initial.quoteDate && initial.expiryDate !== addDaysIso(initial.quoteDate, 30)
  )
  const setF = (k: keyof QuoteFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))

  // Editing an existing quote: fetch its line items separately (kept off
  // the main list/detail response to avoid an N+1 join there) and seed the
  // editor with them.
  useEffect(() => {
    if (!quoteId) return
    fetch(`/api/quotes/${quoteId}/line-items`)
      .then(r => r.json() as Promise<{ lineItems: { description: string; amount: number; vatApplicable: number }[] }>)
      .then(d => {
        if (d.lineItems?.length) {
          setForm(f => ({ ...f, lineItems: d.lineItems.map(li => ({
            description: li.description, amount: String(li.amount), vatApplicable: li.vatApplicable === 1,
          })) }))
        }
      })
      .catch(() => { /* line items are optional — a fetch failure just leaves the simple single-total mode */ })
  }, [quoteId])

  const setTypeOfWorks = (v: string) =>
    setForm(f => ({
      ...f,
      typeOfWorks: v,
      customTypeDescription: v === OTHER_WORKS_TYPE ? f.customTypeDescription : "",
    }))

  // Quote date drives a sensible expiry default (30 days out) until the user deliberately
  // overrides the expiry field themselves — after that, the two fields move independently.
  const handleQuoteDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const quoteDate = e.target.value
    setForm(f => ({
      ...f, quoteDate,
      expiryDate: !expiryTouched && quoteDate ? addDaysIso(quoteDate, 30) : f.expiryDate,
    }))
  }
  const handleExpiryDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setExpiryTouched(true)
    setForm(f => ({ ...f, expiryDate: e.target.value }))
  }

  const addLineItem = () => setForm(f => ({ ...f, lineItems: [...f.lineItems, { description: "", amount: "", vatApplicable: true }] }))
  const removeLineItem = (i: number) => setForm(f => ({ ...f, lineItems: f.lineItems.filter((_, idx) => idx !== i) }))
  const updateLineItem = (i: number, patch: Partial<LineItemDraft>) =>
    setForm(f => ({ ...f, lineItems: f.lineItems.map((li, idx) => idx === i ? { ...li, ...patch } : li) }))
  const lineItemsTotal = form.lineItems.reduce((sum, li) => sum + (parseFloat(li.amount) || 0), 0)
  // Derived, not stored — when line items exist they're the source of
  // truth for the total; this avoids syncing two pieces of state together
  // via an effect (which would otherwise need a setState call inside that
  // effect, an anti-pattern that risks an extra cascading render).
  const displayedQuoteValue = form.lineItems.length > 0 ? lineItemsTotal.toFixed(2) : form.quoteValue

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    let hasError = false
    if (!form.clientId || !form.clientCompany.trim()) {
      setClientError("Client is required")
      hasError = true
    } else {
      setClientError(null)
    }
    if (!form.address.trim()) {
      setAddressError("Address is required")
      hasError = true
    } else {
      setAddressError(null)
    }
    if (!form.typeOfWorks.trim()) {
      setWorksError("Required")
      hasError = true
    } else {
      setWorksError(null)
    }
    if (form.typeOfWorks === OTHER_WORKS_TYPE && !form.customTypeDescription.trim()) {
      setCustomWorksError("Please specify the type of works")
      hasError = true
    } else {
      setCustomWorksError(null)
    }
    if (hasError) return
    onSubmit(form.lineItems.length > 0 ? { ...form, quoteValue: lineItemsTotal.toFixed(2) } : form)
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Client *</Label>
          <ClientCombobox
            value={form.clientId}
            name={form.clientCompany}
            onChange={(clientId, clientName) => {
              setClientError(null)
              setForm(f => ({ ...f, clientId, clientCompany: clientName }))
            }}
            onCreateNew={name => setQuickCreateName(name)}
          />
          {clientError && <p className="text-xs text-er">{clientError}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Contact name</Label>
          <Input value={form.contactName} onChange={setF("contactName")} placeholder="Jane Smith" />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Address *</Label>
        <Input
          value={form.address}
          onChange={e => { setAddressError(null); setF("address")(e) }}
          placeholder="14 Clifton Road, Bristol, BS8 1AF"
          autoComplete="off"
        />
        {addressError && <p className="text-xs text-er">{addressError}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Type of works *</Label>
        <TypeOfWorksCombobox
          value={form.typeOfWorks}
          onChange={v => { setTypeOfWorks(v); setWorksError(null) }}
          error={!!worksError}
        />
        {worksError && <p className="text-xs text-dn">{worksError}</p>}
      </div>

      {form.typeOfWorks === OTHER_WORKS_TYPE && (
        <div className="flex flex-col gap-1.5">
          <Label>Specify type of works *</Label>
          <Input
            value={form.customTypeDescription}
            onChange={e => {
              setForm(f => ({ ...f, customTypeDescription: e.target.value }))
              setCustomWorksError(null)
            }}
            placeholder="e.g. Temporary Pedestrian Tunnel"
            autoComplete="off"
          />
          {customWorksError && <p className="text-xs text-dn">{customWorksError}</p>}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Quote value (£) *</Label>
          <Input value={displayedQuoteValue} onChange={setF("quoteValue")} placeholder="e.g. 1850" inputMode="decimal" autoComplete="off"
            disabled={form.lineItems.length > 0} />
          {form.lineItems.length > 0 && <p className="text-[11px] text-t4">Set by the line items below</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>VAT rate (%)</Label>
          <Input value={form.vatRate} onChange={setF("vatRate")} placeholder="e.g. 20" inputMode="decimal" autoComplete="off" />
          <p className="text-[11px] text-t4">Blank = no VAT breakdown on the PDF</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Quote date *</Label>
          <Input type="date" value={form.quoteDate} onChange={handleQuoteDateChange} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Expiry date</Label>
          <Input type="date" value={form.expiryDate} onChange={handleExpiryDateChange} />
          {!expiryTouched && <p className="text-[11px] text-t4">Defaults to 30 days out</p>}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>Individual jobs / work items (optional)</Label>
          <button type="button" onClick={addLineItem} className="text-xs text-ac hover:text-ach font-medium">+ Add job / item</button>
        </div>
        <p className="text-[11px] text-t4">
          Leave empty for a single-line quote using the description and value above. For a quote covering several jobs at the same site, add one entry per job here — each gets its own detailed description and price on the PDF, and the quote value becomes the sum of all of them.
        </p>
        {form.lineItems.length > 0 && (
          <div className="border border-bd rounded-md divide-y divide-bd">
            {form.lineItems.map((li, i) => (
              <div key={i} className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-t3">Item {i + 1}</span>
                  <button type="button" onClick={() => removeLineItem(i)} className="text-t4 hover:text-dn text-xs px-1">Remove ✕</button>
                </div>
                <Textarea
                  value={li.description}
                  onChange={e => updateLineItem(i, { description: e.target.value })}
                  placeholder="Detailed description of this design / work item — wraps onto its own row(s) under this item on the PDF"
                  rows={3}
                />
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-t3">£</span>
                    <Input value={li.amount} onChange={e => updateLineItem(i, { amount: e.target.value })}
                      placeholder="0.00" inputMode="decimal" className="w-28" />
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-t3 whitespace-nowrap">
                    <input type="checkbox" checked={li.vatApplicable} onChange={e => updateLineItem(i, { vatApplicable: e.target.checked })} />
                    VAT applicable
                  </label>
                </div>
              </div>
            ))}
            <div className="flex justify-end p-2 text-xs text-t2 font-medium">Lines total: £{lineItemsTotal.toFixed(2)}</div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Notes</Label>
        <Textarea value={form.notes} onChange={setF("notes")} rows={2} placeholder="Terms, exclusions, conditions…" />
      </div>

      {/* Quick-create client modal — lets the user register a brand-new client without leaving the quote form */}
      {quickCreateName && (
        <QuickCreateClientModal
          initialName={quickCreateName}
          onCreated={(client: Client) => {
            setForm(f => ({ ...f, clientId: client.id, clientCompany: client.name }))
            setQuickCreateName("")
          }}
          onClose={() => setQuickCreateName("")}
        />
      )}
    </form>
  )
}

function CreateJobFromQuoteModal({ quote, onClose, onConverted }: {
  quote: Quote
  onClose: () => void
  onConverted: () => void
}) {
  const { toast }     = useToast()
  const [designer,       setDesigner]       = useState("")
  const [requiredByDate, setRequiredByDate] = useState(defaultRequiredByDate)
  const [saving,         setSaving]         = useState(false)
  const [holdWarning,    setHoldWarning]    = useState<string | null>(null)

  const doConvert = async (proceedDespiteHold = false) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/quotes/${quote.id}/convert`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          designer: designer.trim(),
          requiredByDate: requiredByDate || null,
          proceedDespiteHold,
        }),
      })
      const body = await res.json() as {
        job?: { drawingNumber: string }
        error?: string
        detail?: string
        onHold?: boolean
        holdReason?: string
      }
      if (res.status === 422 && body.onHold) {
        setHoldWarning(body.holdReason ?? body.error ?? "This client is on hold")
        return
      }
      if (!res.ok) {
        const msg = body.detail?.trim() || body.error || "Failed to create job"
        toast(msg, "error")
        return
      }
      toast(`Job ${body.job?.drawingNumber} created from ${quote.quoteNumber}`, "success")
      onConverted()
    } catch { toast("Network error", "error") }
    finally { setSaving(false) }
  }

  const submit = () => { setHoldWarning(null); void doConvert(false) }
  const proceedDespiteHold = () => { setHoldWarning(null); void doConvert(true) }

  return (
    <>
    <Dialog open onOpenChange={o => { if (!o && !saving) onClose() }}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Create job from {quote.quoteNumber}</DialogTitle></DialogHeader>
        <DialogBody className="space-y-4">
          <div className="bg-pg border border-bd rounded-md p-3 space-y-1.5">
            <p className="text-[11px] font-semibold text-t3 uppercase tracking-wider mb-1">Will be copied to the new job</p>
            <p className="text-xs text-t2"><span className="text-t4">Client:</span> {quote.clientCompany}</p>
            <p className="text-xs text-t2"><span className="text-t4">Address:</span> {quote.address}</p>
            <p className="text-xs text-t2"><span className="text-t4">Quote value:</span> {formatGBP(quote.quoteValue)}</p>
            <p className="text-xs text-t2"><span className="text-t4">Quote ref:</span> {quote.quoteNumber}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Drawing number</Label>
            <p className="text-xs text-t4 bg-pg border border-bd rounded-md px-3 py-2">
              Generated automatically when the job is created
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Designer</Label>
            <DesignerCombobox value={designer} onChange={setDesigner} placeholder="Sarah Mitchell (optional)" autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Required by date</Label>
            <Input type="date" value={requiredByDate} onChange={e => setRequiredByDate(e.target.value)} />
            <p className="text-xs text-t4">Defaults to 1 week from today if left blank</p>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            <ArrowRight className="h-3.5 w-3.5" /> Create job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {holdWarning && (
      <div
        className="fixed inset-0 z-[300] flex items-center justify-center"
        style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      >
        <div className="bg-sr rounded-xl border-2 border-dn shadow-modal w-[calc(100vw-2rem)] max-w-[440px] overflow-hidden">
          <div className="bg-dn px-6 py-4 flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-white shrink-0" />
            <div>
              <p className="text-base font-bold text-white">Client On Hold</p>
              <p className="text-white/85 text-xs mt-0.5">This client is restricted from receiving new work.</p>
            </div>
          </div>
          <div className="px-6 py-5">
            <div className="bg-dn-bg border border-dn-bd rounded-md px-4 py-3 mb-5">
              <p className="text-xs font-semibold text-dn uppercase tracking-wider mb-1">Reason</p>
              <p className="text-sm text-dn-tx font-medium">{holdWarning}</p>
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setHoldWarning(null)} disabled={saving}>Cancel</Button>
              <Button variant="danger" onClick={proceedDespiteHold} loading={saving}>Proceed anyway</Button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

export default function QuotesPage() {
  return (
    <Suspense>
      <QuotesInner />
    </Suspense>
  )
}

function QuoteRowActions({ quote: q, pdfGenerating, onGeneratePdf, onEdit, onSetStatus, onConvert, onArchive }: {
  quote: Quote
  pdfGenerating: string | null
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
        <button onClick={() => onGeneratePdf(q)} disabled={pdfGenerating === q.id}
          className="inline-flex items-center gap-1 text-xs text-t3 hover:text-ac px-1.5 py-1 rounded hover:bg-pg disabled:opacity-50"
          title="Generate PDF">
          {pdfGenerating === q.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
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
  pdfGenerating,
  onGeneratePdf,
  onEdit,
  onSetStatus,
  onConvert,
  onArchive,
}: {
  quote: Quote
  pdfGenerating: string | null
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
          pdfGenerating={pdfGenerating}
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

function QuoteTableRow({ quote: q, pdfGenerating, onGeneratePdf, onEdit, onSetStatus, onConvert, onArchive }: {
  quote: Quote
  pdfGenerating: string | null
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
          pdfGenerating={pdfGenerating}
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
  const isMobile = useMediaQuery("(max-width: 767px)")

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

  const setStatus = async (quote: Quote, status: string) => {
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
  }

  const generatePdf = async (quote: Quote) => {
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
  }

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
      {loading ? (
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
              pdfGenerating={pdfGenerating}
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
                <th className="px-4 py-2.5 text-left font-semibold text-t3 uppercase tracking-wider">Quote No.</th>
                <th className="px-4 py-2.5 text-left font-semibold text-t3 uppercase tracking-wider">Client</th>
                <th className="px-4 py-2.5 text-left font-semibold text-t3 uppercase tracking-wider">Type of works</th>
                <th className="px-4 py-2.5 text-right font-semibold text-t3 uppercase tracking-wider">Value</th>
                <th className="px-4 py-2.5 text-left font-semibold text-t3 uppercase tracking-wider">Date</th>
                <th className="px-4 py-2.5 text-left font-semibold text-t3 uppercase tracking-wider">Expires</th>
                <th className="px-4 py-2.5 text-left font-semibold text-t3 uppercase tracking-wider">Status</th>
                <th className="px-4 py-2.5 w-72" />
              </tr>
            </thead>
            <tbody>
              {data.quotes.map(q => (
                <MemoQuoteTableRow
                  key={q.id}
                  quote={q}
                  pdfGenerating={pdfGenerating}
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

      {data && totalPages > 1 && (
        <div className="flex items-center justify-between gap-4 mt-4 px-1">
          <p className="text-xs text-t3">
            {((page - 1) * QUOTE_PAGE_LIMIT) + 1}–{Math.min(page * QUOTE_PAGE_LIMIT, data.total)} of{" "}
            <span className="font-semibold text-t2">{data.total.toLocaleString()}</span>
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-t3 tabular-nums px-2">{page} / {totalPages}</span>
            <Button variant="outline" size="icon-sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

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
