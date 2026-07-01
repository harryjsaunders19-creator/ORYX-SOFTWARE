/**
 * Billing module — public API.
 * Import from `@/modules/billing` only; do not reach into subfolders.
 */
export { billingHandoffService } from "./services/billing-handoff-service"

export type {
  BillingHandoffRow,
  BillingExportBatchRow,
  BillingExportSnapshotRow,
  BillingHandoffListOptions,
} from "./types"

export { supabaseBillingRepo } from "./supabase/repository"

export { buildAccountsHandoverWorkbook, workbookToBuffer } from "./billing-export"

export { default as BillingPage } from "./components/billing-page"
