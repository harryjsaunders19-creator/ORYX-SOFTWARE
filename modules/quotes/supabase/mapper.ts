/**
 * lib/supabase/mappers/quote.ts
 */
import type { QuoteLineItemRow, QuoteRow } from "../types/quote-types"

export interface SupabaseQuoteRow {
  id: string
  quote_number: string
  client_id: string | null
  client_company: string
  contact_name: string | null
  address: string
  description: string
  type_of_works: string | null
  custom_type_description: string | null
  quote_value: number
  quote_date: string
  expiry_date: string | null
  status: string
  notes: string | null
  job_id: string | null
  parent_job_id?: string | null
  created_by: string
  pdf_path: string | null
  prepared_by: string | null
  vat_rate: number | null
  archived_at: string | null
  archived_by: string | null
  created_at: string
  updated_at: string
}

export interface SupabaseQuoteLineItemRow {
  id: string
  quote_id: string
  description: string
  amount: number
  vat_applicable: boolean
  sort_order: number
  created_at: string
}

function dateOnly(val: string | null | undefined): string | null {
  if (!val) return null
  return val.length >= 10 ? val.slice(0, 10) : val
}

export function toQuoteRow(row: SupabaseQuoteRow): QuoteRow {
  return {
    id: row.id,
    quoteNumber: row.quote_number,
    clientId: row.client_id,
    clientCompany: row.client_company,
    contactName: row.contact_name,
    address: row.address,
    description: row.description,
    typeOfWorks: row.type_of_works,
    customTypeDescription: row.custom_type_description,
    quoteValue: Number(row.quote_value),
    quoteDate: row.quote_date,
    expiryDate: row.expiry_date,
    status: row.status,
    notes: row.notes,
    jobId: row.job_id,
    parentJobId: row.parent_job_id ?? null,
    createdBy: row.created_by,
    pdfPath: row.pdf_path,
    preparedBy: row.prepared_by,
    vatRate: row.vat_rate != null ? Number(row.vat_rate) : null,
    archivedAt: row.archived_at ?? null,
    archivedBy: row.archived_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toSupabaseQuoteRow(quote: QuoteRow): SupabaseQuoteRow {
  return {
    id: quote.id,
    quote_number: quote.quoteNumber,
    client_id: quote.clientId,
    client_company: quote.clientCompany,
    contact_name: quote.contactName,
    address: quote.address,
    description: quote.description,
    type_of_works: quote.typeOfWorks,
    custom_type_description: quote.customTypeDescription,
    quote_value: quote.quoteValue,
    quote_date: dateOnly(quote.quoteDate)!,
    expiry_date: dateOnly(quote.expiryDate),
    status: quote.status,
    notes: quote.notes,
    job_id: quote.jobId,
    // parent_job_id is set only via dedicated link helpers — omit from full-row upserts
    // so older databases without the column still accept quote sync payloads.
    created_by: quote.createdBy,
    pdf_path: quote.pdfPath,
    prepared_by: quote.preparedBy,
    vat_rate: quote.vatRate,
    archived_at: quote.archivedAt ?? null,
    archived_by: quote.archivedBy ?? null,
    created_at: quote.createdAt,
    updated_at: quote.updatedAt,
  }
}

export function toQuoteLineItemRow(row: SupabaseQuoteLineItemRow): QuoteLineItemRow {
  return {
    id: row.id,
    quoteId: row.quote_id,
    description: row.description,
    amount: Number(row.amount),
    vatApplicable: row.vat_applicable ? 1 : 0,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  }
}

export function toSupabaseLineItemRow(item: QuoteLineItemRow): SupabaseQuoteLineItemRow {
  return {
    id: item.id,
    quote_id: item.quoteId,
    description: item.description,
    amount: item.amount,
    vat_applicable: item.vatApplicable === 1,
    sort_order: item.sortOrder,
    created_at: item.createdAt,
  }
}
