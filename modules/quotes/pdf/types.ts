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

/**
 * Shared source-of-truth model for the live ORYX quotation PDF renderer
 * (`buildQuotePdfFromPayload`). Site Visit Calculator and Quotes both map
 * into this shape — do not duplicate PDF layout code.
 */
export interface QuotationPdfLineItem {
  description: string
  amount: number
  vatApplicable: boolean
  /** Drawn in the Purchase Order column when present. */
  purchaseOrder?: string | null
}

export interface QuotationPdfData {
  quotationNumber: string
  issueDate: string | null
  validUntil: string | null
  preparedBy: string
  /** Shown as CUSTOMER ID in the header meta column. */
  customerId: string | null
  client: string
  contact: string | null
  /** Site / destination address (SITE column). */
  site: string
  /** Optional document-level PO — applied to the first line item when set. */
  purchaseOrder?: string | null
  items: QuotationPdfLineItem[]
  subtotal: number
  /** Amount subject to VAT (defaults to sum of VAT-applicable items). */
  taxable?: number
  /** VAT rate as a percentage (e.g. 20). Null hides the VAT breakdown. */
  vatRate: number | null
  vatAmount: number
  grandTotal: number
  notes?: string | null
  terms: string[]
  /** Override download filename (e.g. draft site-visit exports). */
  filename?: string
}
