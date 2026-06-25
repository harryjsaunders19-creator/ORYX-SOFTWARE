"use client"
import { useState } from "react"
import { Button }   from "@/components/ui/button"
import { Input }    from "@/components/ui/input"
import { Label }    from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogBody,
} from "@/components/ui/dialog"
import type { Client } from "@/lib/types"

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
  const [name,    setName]    = useState(initialName)
  const [contact, setContact] = useState("")
  const [email,   setEmail]   = useState("")
  const [phone,   setPhone]   = useState("")
  const [address, setAddress] = useState("")
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState("")

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true); setError("")
    try {
      const res = await fetch("/api/clients", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          contactName: contact.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          billingAddress: address.trim() || null,
        }),
      })
      const body = await res.json() as Client & { error?: string; existing?: Client }
      if (res.status === 409 && body.existing) {
        // Duplicate — use existing
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
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>New client</DialogTitle></DialogHeader>
        <form id="qc-form" onSubmit={submit}>
          <DialogBody className="space-y-3">
            {error && <p className="text-xs text-dn bg-dn-bg border border-dn-bd rounded px-3 py-2">{error}</p>}
            <div className="flex flex-col gap-1.5">
              <Label>Company name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} autoFocus required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Contact name</Label>
              <Input value={contact} onChange={e => setContact(e.target.value)} placeholder="Jane Smith" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Phone</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="01179 000000" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Address</Label>
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
