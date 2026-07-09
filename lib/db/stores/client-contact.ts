import { createId } from "@paralleldrive/cuid2"
import { db } from "../connection"
import { nowIso } from "../helpers"
import type { ClientContactInput, ClientContactRow } from "@/modules/clients/types/client-contact-types"

export const clientContactDb = {
  findByClientId(clientId: string): ClientContactRow[] {
    return db.prepare(`
      SELECT * FROM ClientContact
      WHERE clientId = ?
      ORDER BY isPrimary DESC, sortOrder ASC, createdAt ASC
    `).all(clientId) as ClientContactRow[]
  },

  replaceForClient(clientId: string, contacts: ClientContactInput[]): ClientContactRow[] {
    const now = nowIso()
    db.transaction(() => {
      db.prepare("DELETE FROM ClientContact WHERE clientId = ?").run(clientId)
      contacts.forEach((contact, index) => {
        db.prepare(`
          INSERT INTO ClientContact
            (id, clientId, name, email, phone, role, isPrimary, sortOrder, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          contact.id ?? createId(),
          clientId,
          contact.name,
          contact.email ?? null,
          contact.phone ?? null,
          contact.role ?? null,
          index === 0 ? 1 : 0,
          index,
          now,
          now,
        )
      })
    })()
    return this.findByClientId(clientId)
  },

  rawInsertOrIgnore(contact: ClientContactRow): void {
    db.prepare(`
      INSERT OR IGNORE INTO ClientContact
        (id, clientId, name, email, phone, role, isPrimary, sortOrder, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      contact.id,
      contact.clientId,
      contact.name,
      contact.email,
      contact.phone,
      contact.role,
      contact.isPrimary,
      contact.sortOrder,
      contact.createdAt,
      contact.updatedAt,
    )
  },
}
