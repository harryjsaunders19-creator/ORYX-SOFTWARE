import type {
  DesignWorkItemRow,
  DesignWorkItemType,
  WorkItemInvoiceStatus,
} from "../types/design-work-item-types"

export interface SupabaseWorkItemRow {
  id: string
  parent_job_id: string
  work_type: string
  revision_letter: string | null
  title: string
  description: string | null
  status: string
  designer: string
  priority: string | null
  billable: boolean
  requested_date: string | null
  required_by_date: string | null
  notes: string | null
  commercial_notes: string | null
  quote_value: number | null
  quote_reference: string | null
  quote_date: string | null
  variation_fees: number | null
  additional_charges: number | null
  invoice_status: string
  invoice_number: string | null
  invoice_date: string | null
  billed_value: number | null
  date_created: string
  completed_at: string | null
  legacy_job_id: string | null
  migrated_at: string
  created_at: string
  updated_at: string
}

function dateOnly(val: string | null | undefined): string | null {
  if (!val) return null
  return val.length >= 10 ? val.slice(0, 10) : val
}

export function toWorkItemRow(row: SupabaseWorkItemRow): DesignWorkItemRow {
  return {
    id: row.id,
    parentJobId: row.parent_job_id,
    workType: row.work_type as DesignWorkItemType,
    revisionLetter: row.revision_letter,
    title: row.title,
    description: row.description,
    status: row.status,
    designer: row.designer ?? "",
    priority: row.priority,
    billable: Boolean(row.billable),
    requestedDate: row.requested_date,
    requiredByDate: row.required_by_date,
    notes: row.notes,
    commercialNotes: row.commercial_notes,
    quoteValue: row.quote_value != null ? Number(row.quote_value) : null,
    quoteReference: row.quote_reference,
    quoteDate: row.quote_date,
    variationFees: row.variation_fees != null ? Number(row.variation_fees) : null,
    additionalCharges: row.additional_charges != null ? Number(row.additional_charges) : null,
    invoiceStatus: (row.invoice_status ?? "NONE") as WorkItemInvoiceStatus,
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date,
    billedValue: row.billed_value != null ? Number(row.billed_value) : null,
    dateCreated: row.date_created,
    completedAt: row.completed_at,
    legacyJobId: row.legacy_job_id,
    migratedAt: row.migrated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toSupabaseWorkItem(row: DesignWorkItemRow): SupabaseWorkItemRow {
  return {
    id: row.id,
    parent_job_id: row.parentJobId,
    work_type: row.workType,
    revision_letter: row.revisionLetter,
    title: row.title,
    description: row.description,
    status: row.status,
    designer: row.designer ?? "",
    priority: row.priority,
    billable: row.billable,
    requested_date: dateOnly(row.requestedDate),
    required_by_date: dateOnly(row.requiredByDate),
    notes: row.notes,
    commercial_notes: row.commercialNotes,
    quote_value: row.quoteValue,
    quote_reference: row.quoteReference,
    quote_date: dateOnly(row.quoteDate),
    variation_fees: row.variationFees,
    additional_charges: row.additionalCharges,
    invoice_status: row.invoiceStatus,
    invoice_number: row.invoiceNumber,
    invoice_date: dateOnly(row.invoiceDate),
    billed_value: row.billedValue,
    date_created: row.dateCreated,
    completed_at: dateOnly(row.completedAt),
    legacy_job_id: row.legacyJobId,
    migrated_at: row.migratedAt,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }
}
