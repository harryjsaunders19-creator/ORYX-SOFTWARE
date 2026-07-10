/**
 * lib/supabase/mappers/job.ts — map between JobRow (app) and Supabase row (snake_case).
 */
import type { JobRow } from "../types/job-types"
import { computeJobListSortKey } from "../job-list-sort"

export interface SupabaseJobRow {
  id: string
  drawing_number: string
  item_type: string
  address: string
  type_of_works: string
  custom_type_description: string | null
  legacy_type_of_works: string | null
  client_company: string
  client_id: string | null
  requested_by: string
  status: string
  designer: string
  date_created: string
  date_completed: string | null
  notes: string | null
  quote_value: number | null
  quote_reference: string | null
  quote_date: string | null
  commercial_notes: string | null
  variation_fees: number | null
  additional_charges: number | null
  invoice_id: string | null
  billing_status: string | null
  billing_batch_id: string | null
  requested_date: string | null
  required_by_date: string | null
  parent_job_id: string | null
  revision_letter: string | null
  archived_at: string | null
  archived_by: string | null
  latitude: number | null
  longitude: number | null
  geocoded_at: string | null
  geocoded_address: string | null
  site_name: string | null
  site_address: string | null
  location_status: string | null
  location_source: string | null
  list_sort_key: string | null
  created_at: string
  updated_at: string
}

function dateOnly(val: string | null | undefined): string | null {
  if (!val) return null
  return val.length >= 10 ? val.slice(0, 10) : val
}

export function toJobRow(row: SupabaseJobRow): JobRow {
  return {
    id: row.id,
    drawingNumber: row.drawing_number,
    itemType: row.item_type,
    address: row.address,
    typeOfWorks: row.type_of_works,
    customTypeDescription: row.custom_type_description,
    legacyTypeOfWorks: row.legacy_type_of_works,
    clientCompany: row.client_company,
    clientId: row.client_id,
    requestedBy: row.requested_by,
    status: row.status,
    designer: row.designer ?? "",
    dateCreated: row.date_created,
    dateCompleted: row.date_completed,
    notes: row.notes,
    quoteValue: row.quote_value != null ? Number(row.quote_value) : null,
    quoteReference: row.quote_reference,
    quoteDate: row.quote_date,
    commercialNotes: row.commercial_notes,
    variationFees: row.variation_fees != null ? Number(row.variation_fees) : null,
    additionalCharges: row.additional_charges != null ? Number(row.additional_charges) : null,
    invoiceId: row.invoice_id,
    billingStatus: row.billing_status,
    billingBatchId: row.billing_batch_id,
    requestedDate: row.requested_date,
    requiredByDate: row.required_by_date,
    parentJobId: row.parent_job_id,
    revisionLetter: row.revision_letter,
    archivedAt: row.archived_at ?? null,
    archivedBy: row.archived_by ?? null,
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
    geocodedAt: row.geocoded_at ?? null,
    geocodedAddress: row.geocoded_address ?? null,
    siteName: row.site_name ?? null,
    siteAddress: row.site_address ?? null,
    locationStatus: row.location_status ?? null,
    locationSource: row.location_source ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toSupabaseRow(job: JobRow): SupabaseJobRow & { list_sort_key: string } {
  return {
    id: job.id,
    drawing_number: job.drawingNumber,
    item_type: job.itemType,
    address: job.address,
    type_of_works: job.typeOfWorks,
    custom_type_description: job.customTypeDescription,
    legacy_type_of_works: job.legacyTypeOfWorks,
    client_company: job.clientCompany,
    client_id: job.clientId,
    requested_by: job.requestedBy,
    status: job.status,
    designer: job.designer ?? "",
    date_created: job.dateCreated,
    date_completed: dateOnly(job.dateCompleted),
    notes: job.notes,
    quote_value: job.quoteValue,
    quote_reference: job.quoteReference,
    quote_date: dateOnly(job.quoteDate),
    commercial_notes: job.commercialNotes,
    variation_fees: job.variationFees,
    additional_charges: job.additionalCharges,
    invoice_id: job.invoiceId,
    billing_status: job.billingStatus,
    billing_batch_id: job.billingBatchId,
    requested_date: dateOnly(job.requestedDate),
    required_by_date: dateOnly(job.requiredByDate),
    parent_job_id: job.parentJobId,
    revision_letter: job.revisionLetter,
    archived_at: job.archivedAt ?? null,
    archived_by: job.archivedBy ?? null,
    latitude: job.latitude,
    longitude: job.longitude,
    geocoded_at: job.geocodedAt,
    geocoded_address: job.geocodedAddress,
    site_name: job.siteName,
    site_address: job.siteAddress,
    location_status: job.locationStatus,
    location_source: job.locationSource,
    list_sort_key: computeJobListSortKey(job.drawingNumber, job.parentJobId, job.revisionLetter),
    created_at: job.createdAt,
    updated_at: job.updatedAt,
  }
}

const SORT_COLUMNS: Record<string, keyof SupabaseJobRow> = {
  createdAt: "created_at",
  drawingNumber: "drawing_number",
  clientCompany: "client_company",
  designer: "designer",
  status: "status",
  dateCreated: "date_created",
  quoteValue: "quote_value",
  itemType: "item_type",
  requiredByDate: "required_by_date",
  requestedDate: "requested_date",
  address: "address",
}

export function sortColumn(field: string): keyof SupabaseJobRow {
  return SORT_COLUMNS[field] ?? "date_created"
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export function weekEndIsoDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return d.toISOString().slice(0, 10)
}
