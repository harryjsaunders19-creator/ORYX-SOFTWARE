import type {
  BillingExportBatchRow,
  BillingExportSnapshotRow,
  BillingHandoffRow,
} from "@/lib/db/billing-types"
import type { AccountsHandoverSnapshot } from "@/lib/db/stores"

export interface SupabaseBillingHandoffRow {
  id: string
  source_job_id: string
  billing_event_type: string
  drawing_number: string
  item_type: string
  type_of_works: string | null
  custom_type_description: string | null
  client_company: string
  address: string
  designer: string | null
  quote_value: number | null
  quote_reference: string | null
  completion_date: string
  added_to_billing_queue_at: string
  cleared_by_accounts_at: string | null
  cleared_by: string | null
  export_batch_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface SupabaseBillingExportBatchRow {
  id: string
  batch_number: string
  export_date: string
  exported_by: string
  record_count: number
  notes: string | null
  created_at: string
}

export interface SupabaseBillingExportSnapshotRow {
  id: string
  batch_id: string
  handoff_id: string
  snapshot_json: string
  created_at: string
}

function dateOnly(val: string | null | undefined): string | null {
  if (!val) return null
  return val.length >= 10 ? val.slice(0, 10) : val
}

export function toBillingHandoffRow(row: SupabaseBillingHandoffRow): BillingHandoffRow {
  return {
    id: row.id,
    sourceJobId: row.source_job_id,
    billingEventType: row.billing_event_type,
    drawingNumber: row.drawing_number,
    itemType: row.item_type,
    typeOfWorks: row.type_of_works,
    customTypeDescription: row.custom_type_description,
    clientCompany: row.client_company,
    address: row.address,
    designer: row.designer,
    quoteValue: row.quote_value != null ? Number(row.quote_value) : null,
    quoteReference: row.quote_reference,
    completionDate: row.completion_date,
    addedToBillingQueueAt: row.added_to_billing_queue_at,
    clearedByAccountsAt: row.cleared_by_accounts_at,
    clearedBy: row.cleared_by,
    exportBatchId: row.export_batch_id,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toSupabaseBillingHandoffRow(row: BillingHandoffRow): SupabaseBillingHandoffRow {
  return {
    id: row.id,
    source_job_id: row.sourceJobId,
    billing_event_type: row.billingEventType,
    drawing_number: row.drawingNumber,
    item_type: row.itemType,
    type_of_works: row.typeOfWorks,
    custom_type_description: row.customTypeDescription,
    client_company: row.clientCompany,
    address: row.address,
    designer: row.designer,
    quote_value: row.quoteValue,
    quote_reference: row.quoteReference,
    completion_date: dateOnly(row.completionDate)!,
    added_to_billing_queue_at: row.addedToBillingQueueAt,
    cleared_by_accounts_at: row.clearedByAccountsAt,
    cleared_by: row.clearedBy,
    export_batch_id: row.exportBatchId,
    notes: row.notes,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }
}

export function toBillingExportBatchRow(row: SupabaseBillingExportBatchRow): BillingExportBatchRow {
  return {
    id: row.id,
    batchNumber: row.batch_number,
    exportDate: row.export_date,
    exportedBy: row.exported_by,
    recordCount: row.record_count,
    notes: row.notes,
    createdAt: row.created_at,
  }
}

export function toSupabaseBillingExportBatchRow(row: BillingExportBatchRow): SupabaseBillingExportBatchRow {
  return {
    id: row.id,
    batch_number: row.batchNumber,
    export_date: dateOnly(row.exportDate)!,
    exported_by: row.exportedBy,
    record_count: row.recordCount,
    notes: row.notes,
    created_at: row.createdAt,
  }
}

export function toSupabaseBillingExportSnapshotRow(row: BillingExportSnapshotRow): SupabaseBillingExportSnapshotRow {
  return {
    id: row.id,
    batch_id: row.batchId,
    handoff_id: row.handoffId,
    snapshot_json: row.snapshotJson,
    created_at: row.createdAt,
  }
}

export function parseSnapshotJson(json: string): AccountsHandoverSnapshot {
  return JSON.parse(json) as AccountsHandoverSnapshot
}
