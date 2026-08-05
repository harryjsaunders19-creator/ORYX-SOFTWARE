/** Normalised data passed into the quote PDF layout components. */
export interface QuotePdfLineItem {
  description: string
  /** Optional per-row purchase order reference (not always available). */
  purchaseOrder?: string | null
  /** Per-row VAT value (blank when null). */
  vatAmount: number | null
  /** Per-row amount (blank when null). */
  amount: number | null
}

export interface QuotePdfClientFields {
  client?: string
  contact?: string
  project?: string
  site?: string
  address?: string
  reference?: string
}

export interface QuotePdfDocumentMeta {
  quoteNumber: string
  issueDate: string | null
  validUntil: string | null
  preparedBy: string
}

export interface QuotePdfTotals {
  subtotal: number
  vat: number | null
  grandTotal: number
  showVat: boolean
}

export interface QuotePdfPayload {
  meta: QuotePdfDocumentMeta
  client: QuotePdfClientFields
  /** Quote description / scope shown as the narrative proposal section. */
  scope: string | null
  /** Optional quote notes (additional narrative). */
  quotationNotes: string | null
  lineItems: QuotePdfLineItem[]
  totals: QuotePdfTotals
  terms: string[]
}
