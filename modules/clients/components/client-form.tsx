"use client"

import { useState } from "react"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Textarea } from "@/shared/ui/textarea"
import type { Client } from "@/lib/types"
import type { ClientContactInput } from "../types/client-contact-types"
import { contactsFromClient, emptyContact } from "../types/client-contact-types"
import { ClientContactsFields } from "./client-contacts-fields"

export function ClientForm({ formId, initial, initialContacts, onSubmit, saving: _saving }: {
  formId: string
  initial: Partial<Client>
  initialContacts?: ClientContactInput[]
  onSubmit: (data: Partial<Client> & { contacts: ClientContactInput[] }) => Promise<void>
  saving: boolean
}) {
  const [name,    setName]    = useState(initial.name            ?? "")
  const [contacts, setContacts] = useState<ClientContactInput[]>(
    initialContacts?.length
      ? initialContacts
      : contactsFromClient(initial),
  )
  const [addr,    setAddr]    = useState(initial.billingAddress   ?? "")
  const [notes,   setNotes]   = useState(initial.notes           ?? "")
  const [accountCode, setAccountCode] = useState(initial.accountCode ?? "")

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      name: name.trim(),
      billingAddress: addr.trim() || null,
      notes: notes.trim() || null,
      accountCode: accountCode.trim() || null,
      contacts: contacts.length ? contacts : [emptyContact()],
    })
  }

  return (
    <form id={formId} onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label>Company name *</Label>
          <Input value={name} onChange={e => setName(e.target.value)} autoFocus required placeholder="Acme Scaffolding Ltd" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Customer ID</Label>
          <Input value={accountCode} onChange={e => setAccountCode(e.target.value)} placeholder="e.g. ACME01" />
        </div>
      </div>
      <ClientContactsFields contacts={contacts} onChange={setContacts} />
      <div className="flex flex-col gap-1.5">
        <Label>Billing address</Label>
        <Textarea value={addr} onChange={e => setAddr(e.target.value)} rows={2} placeholder="14 Industrial Way, Bristol" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Notes</Label>
        <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Terms, preferences…" />
      </div>
    </form>
  )
}
