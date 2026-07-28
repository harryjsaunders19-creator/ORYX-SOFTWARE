"use client"
import { useEffect, useState } from "react"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Textarea } from "@/shared/ui/textarea"
import { Field } from "@/shared/ui/field"
import { ClientCombobox } from "@/components/client-combobox"
import { QuickCreateClientModal } from "@/components/quick-create-client-modal"
import { TypeOfWorksCombobox } from "@/components/type-of-works-combobox"
import { OTHER_WORKS_TYPE } from "@/lib/constants"
import type { Client } from "@/lib/types"

// Perf: split into its own chunk so the quotes list page does not pay for the form graph on first paint.
const TODAY_ISO = new Date().toISOString().split("T")[0]
const addDaysIso = (iso: string, days: number) => {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().split("T")[0]
}

interface LineItemDraft { description: string; amount: string; vatApplicable: boolean }

export const EMPTY_FORM = {
  clientId: "", clientCompany: "", contactName: "", address: "",
  typeOfWorks: "", customTypeDescription: "",
  quoteValue: "", quoteDate: TODAY_ISO,
  expiryDate: addDaysIso(TODAY_ISO, 30), notes: "", vatRate: "20",
  lineItems: [] as LineItemDraft[],
}
export type QuoteFormData = typeof EMPTY_FORM

export function QuoteForm({ formId, initial, quoteId, onSubmit }: {
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
        <Field label="Client" required error={clientError}>
          <ClientCombobox
            value={form.clientId}
            name={form.clientCompany}
            onChange={(clientId, clientName) => {
              setClientError(null)
              setForm(f => ({ ...f, clientId, clientCompany: clientName }))
            }}
            onCreateNew={name => setQuickCreateName(name)}
          />
        </Field>
        <Field label="Contact name">
          <Input value={form.contactName} onChange={setF("contactName")} placeholder="Jane Smith" />
        </Field>
      </div>

      <Field label="Address" required error={addressError}>
        <Input
          value={form.address}
          onChange={e => { setAddressError(null); setF("address")(e) }}
          placeholder="14 Clifton Road, Bristol, BS8 1AF"
          autoComplete="off"
        />
      </Field>

      <Field label="Type of works" required error={worksError}>
        <TypeOfWorksCombobox
          value={form.typeOfWorks}
          onChange={v => { setTypeOfWorks(v); setWorksError(null) }}
          error={!!worksError}
        />
      </Field>

      {form.typeOfWorks === OTHER_WORKS_TYPE && (
        <Field label="Specify type of works" required error={customWorksError}>
          <Input
            value={form.customTypeDescription}
            onChange={e => {
              setForm(f => ({ ...f, customTypeDescription: e.target.value }))
              setCustomWorksError(null)
            }}
            placeholder="e.g. Temporary Pedestrian Tunnel"
            autoComplete="off"
          />
        </Field>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Field label="Quote value (£)" required hint={form.lineItems.length > 0 ? "Set by the line items below" : undefined}>
          <Input value={displayedQuoteValue} onChange={setF("quoteValue")} placeholder="e.g. 1850" inputMode="decimal" autoComplete="off"
            disabled={form.lineItems.length > 0} />
        </Field>
        <Field label="VAT rate (%)" hint="Blank = no VAT breakdown on the PDF">
          <Input value={form.vatRate} onChange={setF("vatRate")} placeholder="e.g. 20" inputMode="decimal" autoComplete="off" />
        </Field>
        <Field label="Quote date" required>
          <Input type="date" value={form.quoteDate} onChange={handleQuoteDateChange} />
        </Field>
        <Field label="Expiry date" hint={!expiryTouched ? "Defaults to 30 days out" : undefined}>
          <Input type="date" value={form.expiryDate} onChange={handleExpiryDateChange} />
        </Field>
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
