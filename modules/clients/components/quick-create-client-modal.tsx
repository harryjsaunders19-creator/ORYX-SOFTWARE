"use client"

import { useState } from "react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogBody,
} from "@/shared/ui/dialog"
import type { Client } from "@/lib/types"
import type { ClientContactInput } from "../types/client-contact-types"
import { emptyContact } from "../types/client-contact-types"
import { ClientContactsFields } from "./client-contacts-fields"

/**
 * Inline "create a brand-new client" modal, used anywhere a ClientCombobox's
 * onCreateNew fires (job form, quote form, …) so the user never has to leave
 * the screen they're on to register a new client before continuing.
 */
export function QuickCreateClientModal({ initialName, onCreated, onClose }: {
  initialName: string
  onCreated: (client: Client) => void
  onClose: () => void
}) {
  const [name,     setName]     = useState(initialName)
  const [contacts, setContacts] = useState<ClientContactInput[]>([emptyContact()])
  const [address,  setAddress]  = useState("")
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState("")

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true); setError("")
    try {
      const res = await fetch("/api/clients", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          billingAddress: address.trim() || null,
          contacts,
        }),
      })
      const body = await res.json() as Client & { error?: string; existing?: Client }
      if (res.status === 409 && body.existing) {
        onCreated(body.existing)
        return
      }
      if (!res.ok) { setError(body.error ?? "Failed to create client"); return }
      onCreated(body as Client)
    } catch { setError("Network error") }
    finally { setSaving(false) }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent size="sm" nested>
        <DialogHeader><DialogTitle>New client</DialogTitle></DialogHeader>
        <form id="qc-form" onSubmit={submit}>
          <DialogBody className="space-y-3">
            {error && <p className="text-xs text-dn bg-dn-bg border border-dn-bd rounded px-3 py-2">{error}</p>}
            <div className="flex flex-col gap-1.5">
              <Label>Company name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} autoFocus required />
            </div>
            <ClientContactsFields contacts={contacts} onChange={setContacts} />
            <div className="flex flex-col gap-1.5">
              <Label>Billing address</Label>
              <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="14 Clifton Road, Bristol, BS8 1AF" />
            </div>
          </DialogBody>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" form="qc-form" variant="primary" loading={saving}>Create client</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
