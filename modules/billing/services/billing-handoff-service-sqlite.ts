/**
 * Billing handoffs — SQLite path for local/CI when Supabase admin is not configured.
 *
 * Dual-write to Supabase was removed: when admin credentials are present the
 * entry router loads billing-handoff-service-supabase.ts instead (isSupabaseOnly()).
 */
import type {
  BillingExportBatchRow,
  BillingHandoffListOptions,
  BillingHandoffRow,
} from "../types/billing-types"
import { billingHandoffDb, type AccountsHandoverSnapshot } from "@/lib/db/stores"
import { ensureBatchSequenceSeeded } from "@/shared/supabase/seed-sequences"

export const billingHandoffService = {
  async findMany(opts: BillingHandoffListOptions = {}): Promise<BillingHandoffRow[]> {
    return billingHandoffDb.findMany(opts)
  },

  async findBySourceJobId(jobId: string): Promise<BillingHandoffRow | null> {
    return billingHandoffDb.findBySourceJobId(jobId)
  },

  findManyByIds(ids: string[]): BillingHandoffRow[] {
    return billingHandoffDb.findManyByIds(ids)
  },

  buildAccountsHandoverSnapshot(handoff: BillingHandoffRow): AccountsHandoverSnapshot {
    return billingHandoffDb.buildAccountsHandoverSnapshot(handoff)
  },

  async createExportBatch(data: {
    handoffIds: string[]
    exportedBy: string
    exportDate: string
    notes?: string | null
  }): Promise<{ batch: BillingExportBatchRow; snapshots: AccountsHandoverSnapshot[] }> {
    await ensureBatchSequenceSeeded()
    const result = billingHandoffDb.createExportBatch(data)
    if (!result.snapshots.length) {
      throw new Error("Export produced no snapshot rows")
    }
    return result
  },

  async findBatchUnique(id: string): Promise<BillingExportBatchRow | null> {
    return billingHandoffDb.findBatchUnique(id)
  },

  async findBatches(opts: { skip?: number; take?: number } = {}): Promise<BillingExportBatchRow[]> {
    return billingHandoffDb.findBatches(opts)
  },

  async handoffsForBatch(batchId: string): Promise<BillingHandoffRow[]> {
    return billingHandoffDb.handoffsForBatch(batchId)
  },

  async snapshotsForBatch(batchId: string): Promise<AccountsHandoverSnapshot[]> {
    return billingHandoffDb.snapshotsForBatch(batchId)
  },

  async stats(): Promise<{ awaitingCount: number; awaitingValue: number; clearedCount: number }> {
    return billingHandoffDb.stats()
  },

  async awaitingCount(): Promise<number> {
    return billingHandoffDb.stats().awaitingCount
  },

  async updateQuoteValue(handoffId: string, quoteValue: number): Promise<BillingHandoffRow | { error: string }> {
    return billingHandoffDb.updateQuoteValue(handoffId, quoteValue)
  },

  /** No-op on SQLite-only — handoffs already live in SQLite job side-effects. */
  async syncJobHandoffs(_jobId: string): Promise<void> {
    return
  },
}
