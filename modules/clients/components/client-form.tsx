"use client"

import { useState } from "react"
import { Input } from "@/shared/ui/input"
import { Textarea } from "@/shared/ui/textarea"
import { Field, FormAlert } from "@/shared/ui/field"
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
  const [contactError, setContactError] = useState<string | null>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const primaryName = contacts[0]?.name?.trim()
    if (!primaryName) {
      setContactError("A primary contact name is required.")
      return
    }
    setContactError(null)
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
        <Field label="Company name" required htmlFor="client-form-name" className="col-span-2">
          <Input id="client-form-name" value={name} onChange={e => setName(e.target.value)} autoFocus required placeholder="Acme Scaffolding Ltd" />
        </Field>
        <Field label="Customer ID" htmlFor="client-form-account-code">
          <Input id="client-form-account-code" value={accountCode} onChange={e => setAccountCode(e.target.value)} placeholder="e.g. ACME01" />
        </Field>
      </div>
      <div>
        <ClientContactsFields contacts={contacts} onChange={c => { setContacts(c); if (contactError) setContactError(null) }} />
        {contactError && <FormAlert className="mt-2">{contactError}</FormAlert>}
      </div>
      <Field label="Billing address" htmlFor="client-form-billing-address">
        <Textarea id="client-form-billing-address" value={addr} onChange={e => setAddr(e.target.value)} rows={2} placeholder="14 Industrial Way, Bristol" />
      </Field>
      <Field label="Notes" htmlFor="client-form-notes">
        <Textarea id="client-form-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Terms, preferences…" />
      </Field>
    </form>
  )
}
