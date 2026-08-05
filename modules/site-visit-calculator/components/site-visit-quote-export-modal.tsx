"use client"

import { useEffect, useState } from "react"
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogBody,
} from "@/shared/ui/dialog"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Textarea } from "@/shared/ui/textarea"
import { ClientCombobox } from "@/components/client-combobox"
import { QuickCreateClientModal } from "@/components/quick-create-client-modal"
import { useUser } from "@/shared/providers/user-context"
import { useToast } from "@/shared/ui/toast"
import { formatGBP } from "@/shared/utils/utils"
import type { SiteVisitCalculationResult } from "../types"
import { buildSiteVisitNarrative } from "../services/map-site-visit-estimate-to-quotation"

export interface SiteVisitQuoteExportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  result: SiteVisitCalculationResult
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback
  const match = /filename="([^"]+)"/i.exec(header)
  return match?.[1] ?? fallback
}

export function SiteVisitQuoteExportModal({
  open,
  onOpenChange,
  result,
}: SiteVisitQuoteExportModalProps) {
  const { toast } = useToast()
  const { userName } = useUser()

  const [clientId, setClientId] = useState("")
  const [clientCompany, setClientCompany] = useState("")
  const [contactName, setContactName] = useState("")
  const [purchaseOrder, setPurchaseOrder] = useState("")
  const [preparedBy, setPreparedBy] = useState(userName)
  const [quotationLabel, setQuotationLabel] = useState("")
  const [descriptionOverride, setDescriptionOverride] = useState("")
  const [quickCreateName, setQuickCreateName] = useState("")
  const [busy, setBusy] = useState<"preview" | "save" | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setPreparedBy(userName)
    setDescriptionOverride("")
    setError(null)
  }, [open, userName, result.siteAddress])

  const narrative = buildSiteVisitNarrative(result, descriptionOverride || null)

  const payload = () => ({
    result,
    clientId: clientId || null,
    clientCompany: clientCompany.trim(),
    contactName: contactName.trim() || null,
    purchaseOrder: purchaseOrder.trim() || null,
    preparedBy: preparedBy.trim() || userName,
    quotationLabel: quotationLabel.trim() || null,
    descriptionOverride: descriptionOverride.trim() || null,
  })

  const previewPdf = async () => {
    setBusy("preview")
    setError(null)
    try {
      const res = await fetch("/api/site-visit-calculator/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? "PDF preview failed")
        toast(data.error ?? "PDF preview failed", "error")
        return
      }
      const blob = await res.blob()
      const filename = filenameFromDisposition(
        res.headers.get("Content-Disposition"),
        "Site-Visit-Quotation-Draft.pdf",
      )
      downloadBlob(blob, filename)
      toast("Draft quotation PDF downloaded", "success")
    } catch {
      setError("PDF preview failed")
      toast("PDF preview failed", "error")
    } finally {
      setBusy(null)
    }
  }

  const saveAsQuotation = async () => {
    if (!clientCompany.trim()) {
      setError("Select a client before saving as a quotation")
      return
    }
    setBusy("save")
    setError(null)
    try {
      const res = await fetch("/api/site-visit-calculator/save-as-quotation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload(), generatePdf: true }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? "Could not save quotation")
        toast(data.error ?? "Could not save quotation", "error")
        return
      }
      const quoteNumber = res.headers.get("X-Quote-Number") ?? "quotation"
      const blob = await res.blob()
      const filename = filenameFromDisposition(
        res.headers.get("Content-Disposition"),
        `${quoteNumber}.pdf`,
      )
      downloadBlob(blob, filename)
      toast(`Saved as ${quoteNumber}`, "success")
      onOpenChange(false)
    } catch {
      setError("Could not save quotation")
      toast("Could not save quotation", "error")
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={o => { if (!busy) onOpenChange(o) }}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Export quotation</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <p className="text-sm text-t3">
              Uses the standard ORYX quotation template.
              Preview stays as DRAFT; Save as Quotation assigns a real quote number.
            </p>

            <div className="rounded-lg border border-bd bg-sr/40 px-3 py-2 text-sm space-y-0.5">
              <p className="font-medium text-t1 truncate">{result.siteAddress}</p>
              <p className="text-t3">
                {formatGBP(result.subtotal)} ex VAT · {formatGBP(result.grandTotal)} inc VAT
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Client</Label>
              <ClientCombobox
                value={clientId}
                name={clientCompany}
                onChange={(id, name, _onHold, _reason, contact) => {
                  setClientId(id)
                  setClientCompany(name)
                  if (contact) setContactName(contact)
                }}
                onCreateNew={name => setQuickCreateName(name)}
              />
              <p className="text-xs text-t3">Required to save as a formal quotation.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="svc-contact">Contact</Label>
              <Input
                id="svc-contact"
                value={contactName}
                onChange={e => setContactName(e.target.value)}
                placeholder="Optional"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="svc-po">Purchase order</Label>
                <Input
                  id="svc-po"
                  value={purchaseOrder}
                  onChange={e => setPurchaseOrder(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="svc-prepared">Prepared by</Label>
                <Input
                  id="svc-prepared"
                  value={preparedBy}
                  onChange={e => setPreparedBy(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="svc-label">Quotation label / reference</Label>
              <Input
                id="svc-label"
                value={quotationLabel}
                onChange={e => setQuotationLabel(e.target.value)}
                placeholder="Optional"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="svc-desc">Description override</Label>
              <Textarea
                id="svc-desc"
                value={descriptionOverride}
                onChange={e => setDescriptionOverride(e.target.value)}
                placeholder={narrative}
                rows={3}
              />
              <p className="text-xs text-t3">Leave blank to use the generated site-visit description.</p>
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}
          </DialogBody>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!!busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!!busy}
              onClick={() => void previewPdf()}
            >
              {busy === "preview" ? "Preparing…" : "Preview PDF"}
            </Button>
            <Button
              type="button"
              disabled={!!busy}
              onClick={() => void saveAsQuotation()}
            >
              {busy === "save" ? "Saving…" : "Save as Quotation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {quickCreateName !== "" && (
        <QuickCreateClientModal
          initialName={quickCreateName}
          onClose={() => setQuickCreateName("")}
          onCreated={client => {
            setClientId(client.id)
            setClientCompany(client.name)
            if (client.contactName) setContactName(client.contactName)
            setQuickCreateName("")
          }}
        />
      )}
    </>
  )
}
