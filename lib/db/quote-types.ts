/** Shared quote types — used by SQLite stores, Supabase repo, and API layer. */

export interface QuoteRow {
  id: string
  quoteNumber: string
  clientId: string | null
  clientCompany: string
  contactName: string | null
  address: string
  description: string
  typeOfWorks: string | null
  customTypeDescription: string | null
  quoteValue: number
  quoteDate: string
  expiryDate: string | null
  status: string
  notes: string | null
  jobId: string | null
  createdBy: string
  pdfPath: string | null
  preparedBy: string | null
  vatRate: number | null
  archivedAt: string | null
  archivedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateQuoteData {
  clientId?: string | null
  clientCompany: string
  contactName?: string | null
  address: string
  description: string
  typeOfWorks?: string | null
  customTypeDescription?: string | null
  quoteValue: number
  quoteDate: string
  expiryDate?: string | null
  status?: string
  notes?: string | null
  createdBy?: string
  vatRate?: number | null
}

export interface UpdateQuoteData {
  clientId?: string | null
  clientCompany?: string
  contactName?: string | null
  address?: string
  description?: string
  typeOfWorks?: string | null
  customTypeDescription?: string | null
  quoteValue?: number
  quoteDate?: string
  expiryDate?: string | null
  status?: string
  notes?: string | null
  jobId?: string | null
  pdfPath?: string | null
  preparedBy?: string | null
  vatRate?: number | null
}

export interface QuoteLineItemRow {
  id: string
  quoteId: string
  description: string
  amount: number
  vatApplicable: number
  sortOrder: number
  createdAt: string
}

export interface CreateQuoteLineItemData {
  description: string
  amount: number
  vatApplicable?: boolean
  sortOrder?: number
}

export interface QuoteListOptions {
  search?: string
  status?: string
  clientId?: string
  skip?: number
  take?: number
}
