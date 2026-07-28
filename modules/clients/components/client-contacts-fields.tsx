"use client"

import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import type { ClientContactInput } from "../types/client-contact-types"
import { emptyContact } from "../types/client-contact-types"

interface Props {
  contacts: ClientContactInput[]
  onChange: (contacts: ClientContactInput[]) => void
}

export function ClientContactsFields({ contacts, onChange }: Props) {
  const update = (index: number, patch: Partial<ClientContactInput>) => {
    onChange(contacts.map((c, i) => i === index ? { ...c, ...patch } : c))
  }

  const addContact = () => {
    onChange([...contacts, emptyContact()])
  }

  const removeContact = (index: number) => {
    if (contacts.length <= 1) return
    onChange(contacts.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="mb-0">Contacts</Label>
        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={addContact}>
          <Plus className="h-3.5 w-3.5" />
          Add contact
        </Button>
      </div>

      {contacts.map((contact, index) => (
        <div
          key={contact.id ?? `contact-${index}`}
          className="rounded-lg border border-bd bg-pg/30 p-3 space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="type-label text-t3">
              {index === 0 ? "Primary contact" : `Contact ${index + 1}`}
            </p>
            {contacts.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="h-7 w-7 text-t4 hover:text-dn"
                onClick={() => removeContact(index)}
                title="Remove contact"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2 sm:col-span-1 flex flex-col gap-1.5">
              <Label>Name</Label>
              <Input
                value={contact.name}
                onChange={e => update(index, { name: e.target.value })}
                placeholder={index === 0 ? "Jane Smith" : "Contact name"}
              />
            </div>
            <div className="col-span-2 sm:col-span-1 flex flex-col gap-1.5">
              <Label>Role (optional)</Label>
              <Input
                value={contact.role ?? ""}
                onChange={e => update(index, { role: e.target.value })}
                placeholder="e.g. Accounts, Site manager"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Phone</Label>
              <Input
                value={contact.phone ?? ""}
                onChange={e => update(index, { phone: e.target.value })}
                placeholder="01179 000000"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={contact.email ?? ""}
                onChange={e => update(index, { email: e.target.value })}
                placeholder="name@example.co.uk"
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
