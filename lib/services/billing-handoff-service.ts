/**
 * Billing handoffs during Supabase migration.
 *
 * When SUPABASE_BILLING=true:
 *   - Reads come from Supabase
 *   - Writes run SQLite first (complex export/snapshot logic), then mirror
 */
import { db } from "@/lib/db/connection"
import type {
  BillingExportBatchRow,
  BillingExportSnapshotRow,
  BillingHandoffListOptions,
  BillingHandoffRow,
} from "@/lib/db/billing-types"
import { billingHandoffDb, jobDb, type AccountsHandoverSnapshot } from "@/lib/db/stores"
import { useSupabaseBilling, useSupabaseJobs } from "@/lib/supabase/feature-flags"
import { supabaseBillingRepo } from "@/lib/supabase/repositories/billing"
import { supabaseJobRepo } from "@/lib/supabase/repositories/jobs"
import { ensureJobInSqliteForBilling } from "@/lib/services/job-service"

/**
 * Ensures one or more billing handoff rows exist in SQLite, fetching from
 * Supabase if missing. The BillingHandoff table has a NOT NULL FK on Job(id),
 * so the job must also be in SQLite — ensureJobInSqliteForBilling handles that.
 */
async function ensureBillingHandoffsInSqlite(ids: string[]): Promise<void> {
  if (!useSupabaseBilling()) return
  const missing = ids.filter(id => !billingHandoffDb.findUnique(id))
  if (!missing.length) return
  try {
    const rows = await supabaseBillingRepo.findManyByIds(missing)
    for (const row of rows) {
      await ensureJobInSqliteForBilling(row.sourceJobId)
      billingHandoffDb.rawInsertOrIgnore(row)
    }
  } catch {
    // Non-fatal
  }
}

async function mirrorBatchExport(batchId: string): Promise<void> {
  if (!useSupabaseBilling()) return
  const batch = billingHandoffDb.findBatchUnique(batchId)
  if (batch) await supabaseBillingRepo.upsertBatch(batch)
  const handoffs = billingHandoffDb.handoffsForBatch(batchId)
  for (const h of handoffs) await supabaseBillingRepo.upsertHandoff(h)
  const snapshotRows = db.prepare("SELECT * FROM BillingExportSnapshot WHERE batchId = ?").all(batchId) as BillingExportSnapshotRow[]
  await supabaseBillingRepo.upsertSnapshots(snapshotRows)
}

export const billingHandoffService = {
  async findMany(opts: BillingHandoffListOptions = {}): Promise<BillingHandoffRow[]> {
    if (!useSupabaseBilling()) return billingHandoffDb.findMany(opts)
    return supabaseBillingRepo.findMany(opts)
  },

  async findBySourceJobId(jobId: string): Promise<BillingHandoffRow | null> {
    if (!useSupabaseBilling()) return billingHandoffDb.findBySourceJobId(jobId)
    return supabaseBillingRepo.findBySourceJobId(jobId)
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
    await ensureBillingHandoffsInSqlite(data.handoffIds)
    const result = billingHandoffDb.createExportBatch(data)
    await mirrorBatchExport(result.batch.id)
    return result
  },

  async findBatchUnique(id: string): Promise<BillingExportBatchRow | null> {
    if (!useSupabaseBilling()) return billingHandoffDb.findBatchUnique(id)
    return supabaseBillingRepo.findBatchUnique(id)
  },

  async findBatches(opts: { skip?: number; take?: number } = {}): Promise<BillingExportBatchRow[]> {
    if (!useSupabaseBilling()) return billingHandoffDb.findBatches(opts)
    return supabaseBillingRepo.findBatches(opts)
  },

  async handoffsForBatch(batchId: string): Promise<BillingHandoffRow[]> {
    if (!useSupabaseBilling()) return billingHandoffDb.handoffsForBatch(batchId)
    return supabaseBillingRepo.handoffsForBatch(batchId)
  },

  async snapshotsForBatch(batchId: string): Promise<AccountsHandoverSnapshot[]> {
    if (!useSupabaseBilling()) return billingHandoffDb.snapshotsForBatch(batchId)
    return supabaseBillingRepo.snapshotsForBatch(batchId)
  },

  async stats(): Promise<{ awaitingCount: number; awaitingValue: number; clearedCount: number }> {
    if (!useSupabaseBilling()) return billingHandoffDb.stats()
    return supabaseBillingRepo.stats()
  },

  async updateQuoteValue(handoffId: string, quoteValue: number): Promise<BillingHandoffRow | { error: string }> {
    await ensureBillingHandoffsInSqlite([handoffId])
    const result = billingHandoffDb.updateQuoteValue(handoffId, quoteValue)
    if ("error" in result) return result
    const job = jobDb.findUnique(result.sourceJobId)
    if (job && useSupabaseJobs()) await supabaseJobRepo.upsert(job)
    if (useSupabaseBilling()) await supabaseBillingRepo.upsertHandoff(result)
    return result
  },

  /** Mirror handoffs for a job after jobDb side effects (ISSUED / revert). */
  async syncJobHandoffs(jobId: string): Promise<void> {
    if (!useSupabaseBilling()) return
    const rows = billingHandoffDb.findHistoryBySourceJobId(jobId)
    await supabaseBillingRepo.replaceHandoffsForJob(jobId, rows)
  },
}
