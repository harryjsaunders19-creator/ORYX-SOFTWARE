/** Shared client hold types. */

export interface ClientHoldRow {
  id: string
  clientId: string
  status: string
  reason: string
  notes: string | null
  addedBy: string
  addedAt: string
  removedBy: string | null
  removedAt: string | null
  removedReason: string | null
}

export interface ClientHoldWithClientRow extends ClientHoldRow {
  clientName: string
  activeJobCount: number
  quoteValueTotal: number
}
