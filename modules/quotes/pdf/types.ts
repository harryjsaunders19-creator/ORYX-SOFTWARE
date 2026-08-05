/** Normalised data passed into the quote PDF layout components. */
export interface QuotePdfLineItem {
  description: string
  quantity: number
  unitRate: number
  vatApplicable: boolean
  lineTotal: number
  vatAmount: number | null
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
  projectDescription: string | null
  lineItems: QuotePdfLineItem[]
  totals: QuotePdfTotals
  terms: string[]
}
