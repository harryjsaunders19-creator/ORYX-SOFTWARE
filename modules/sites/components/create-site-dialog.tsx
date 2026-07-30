"use client"

import { useState } from "react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Textarea } from "@/shared/ui/textarea"
import { Label } from "@/shared/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogBody,
} from "@/shared/ui/dialog"
import { formatSiteAddress } from "@/modules/sites/lib/normalize"
import type { SiteSummary } from "@/modules/sites/types"

/**
 * Compact Create Managed Site modal — used from New Job without restarting the form.
 */
export function CreateSiteDialog({
  clientId,
  clientName,
  onCreated,
  onClose,
  onUseExisting,
}: {
  clientId: string
  clientName: string
  onCreated: (site: SiteSummary) => void
  onClose: () => void
  onUseExisting?: (site: SiteSummary) => void
}) {
  const [name, setName] = useState("")
  const [addressLine1, setAddressLine1] = useState("")
  const [addressLine2, setAddressLine2] = useState("")
  const [city, setCity] = useState("")
  const [county, setCounty] = useState("")
  const [postcode, setPostcode] = useState("")
  const [country, setCountry] = useState("United Kingdom")
  const [siteReference, setSiteReference] = useState("")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [duplicates, setDuplicates] = useState<SiteSummary[] | null>(null)

  const payload = (createAnyway = false) => ({
    clientId,
    name: name.trim(),
    addressLine1: addressLine1.trim() || null,
    addressLine2: addressLine2.trim() || null,
    city: city.trim() || null,
    county: county.trim() || null,
    postcode: postcode.trim() || null,
    country: country.trim() || null,
    siteReference: siteReference.trim() || null,
    notes: notes.trim() || null,
    createAnyway,
  })

  const submit = async (createAnyway = false) => {
    if (!name.trim()) {
      setError("Site name is required")
      return
    }
    setSaving(true)
    setError("")
    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload(createAnyway)),
      })
      const body = await res.json() as SiteSummary & {
        error?: string
        detail?: string
        duplicates?: SiteSummary[]
      }
      if (res.status === 409 && body.duplicates?.length) {
        setDuplicates(body.duplicates)
        return
      }
      if (!res.ok) {
        setError(
          (typeof body.detail === "string" && body.detail.trim())
            || body.error
            || "Failed to create managed site",
        )
        return
      }
      onCreated(body)
    } catch {
      setError("Network error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Managed Site</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-xs text-t3">
            Client: <span className="font-medium text-t1">{clientName}</span>
          </p>

          {duplicates && duplicates.length > 0 && (
            <div className="rounded-lg border border-wn-bd bg-wn-bg px-3 py-3 space-y-2">
              <p className="text-sm font-semibold text-wn-tx">Possible existing managed site</p>
              {duplicates.slice(0, 3).map(d => {
                const addr = formatSiteAddress(d)
                return (
                  <div key={d.id} className="rounded-md border border-bd bg-sr px-3 py-2">
                    <p className="text-sm font-medium text-t1">{d.name}</p>
                    {addr && <p className="text-xs text-t3">{addr}</p>}
                    {d.jobCounts && (
                      <p className="mt-1 text-[11px] text-t4">
                        {d.jobCounts.total} existing jobs
                      </p>
                    )}
                    {onUseExisting && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        onClick={() => onUseExisting(d)}
                      >
                        Use Existing Managed Site
                      </Button>
                    )}
                  </div>
                )
              })}
              <div className="flex gap-2 pt-1">
                <Button type="button" size="sm" variant="outline" onClick={() => setDuplicates(null)}>
                  Edit details
                </Button>
                <Button type="button" size="sm" onClick={() => void submit(true)} disabled={saving}>
                  Create Anyway
                </Button>
              </div>
            </div>
          )}

          {!duplicates && (
            <>
              <div>
                <Label>Site Name</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Temple Meads Station" autoFocus />
              </div>
              <div>
                <Label>Address Line 1</Label>
                <Input value={addressLine1} onChange={e => setAddressLine1(e.target.value)} />
              </div>
              <div>
                <Label>Address Line 2</Label>
                <Input value={addressLine2} onChange={e => setAddressLine2(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>City</Label>
                  <Input value={city} onChange={e => setCity(e.target.value)} />
                </div>
                <div>
                  <Label>County</Label>
                  <Input value={county} onChange={e => setCounty(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Postcode</Label>
                  <Input value={postcode} onChange={e => setPostcode(e.target.value)} />
                </div>
                <div>
                  <Label>Country</Label>
                  <Input value={country} onChange={e => setCountry(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Site Reference <span className="text-t4 font-normal">(optional)</span></Label>
                <Input value={siteReference} onChange={e => setSiteReference(e.target.value)} />
              </div>
              <div>
                <Label>Notes <span className="text-t4 font-normal">(optional)</span></Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
              </div>
            </>
          )}

          {error && <p className="text-xs text-dn">{error}</p>}
        </DialogBody>
        {!duplicates && (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="button" onClick={() => void submit(false)} disabled={saving || !name.trim()}>
              {saving ? "Creating…" : "Create Managed Site"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
