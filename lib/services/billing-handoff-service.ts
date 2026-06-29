/**
 * Billing handoffs during Supabase migration.
 *
 * When SUPABASE_BILLING=true:
 *   - Reads come from Supabase
 *   - Export batch creation runs in SQLite (snapshot logic), then mirrors to Supabase
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

const SYNC_CHUNK = 25

/**
 * Copies billing handoffs (and their source jobs) from Supabase into the
 * ephemeral SQLite DB so createExportBatch / buildAccountsHandoverSnapshot
 * can run unchanged on Vercel.
 */
async function ensureBillingHandoffsInSqlite(ids: string[]): Promise<void> {
  if (!useSupabaseBilling()) return

  const rows = await supabaseBillingRepo.findManyByIds(ids)
  const byId = new Map(rows.map(r => [r.id, r]))
  const missing = ids.filter(id => !byId.has(id))
  if (missing.length) {
    throw new Error(`${missing.length} item(s) not found in the billing queue`)
  }

  const jobIds = [...new Set(rows.map(r => r.sourceJobId))]
  for (let i = 0; i < jobIds.length; i += SYNC_CHUNK) {
    const chunk = jobIds.slice(i, i + SYNC_CHUNK)
    const ok = await Promise.all(chunk.map(jid => ensureJobInSqliteForBilling(jid)))
    const failed = chunk.filter((_, idx) => !ok[idx])
    if (failed.length) {
      throw new Error(`Could not load ${failed.length} job(s) needed for export — try again in a moment`)
    }
  }

  db.transaction(() => {
    for (const row of rows) billingHandoffDb.syncFromRemote(row)
  })()

  const synced = billingHandoffDb.findManyByIds(ids)
  if (synced.length !== ids.length) {
    throw new Error("Failed to prepare billing items for export")
  }
}

async function mirrorBatchExport(
  batchId: string,
  handoffIds: string[],
  meta: { clearedBy: string; clearedAt: string; notes?: string | null },
): Promise<void> {
  if (!useSupabaseBilling()) return
  const batch = billingHandoffDb.findBatchUnique(batchId)
  if (!batch) throw new Error("Export batch missing after create")

  await supabaseBillingRepo.upsertBatch(batch)

  // Direct UPDATE — do not rely on SQLite read-back (ephemeral on Vercel).
  await supabaseBillingRepo.clearHandoffsForExport({
    handoffIds,
    batchId,
    clearedAt: meta.clearedAt,
    clearedBy: meta.clearedBy,
    notes: meta.notes,
  })

  const stillAwaiting = await supabaseBillingRepo.countUnclearedAmong(handoffIds)
  if (stillAwaiting > 0) {
    throw new Error(`${stillAwaiting} item(s) failed to move to Cleared in Supabase`)
  }

  // Full row sync + snapshots are best-effort after the cleared status is set.
  const clearedHandoffs = billingHandoffDb.handoffsForBatch(batchId)
  if (clearedHandoffs.length) {
    await supabaseBillingRepo.upsertManyHandoffs(clearedHandoffs)
  }

  try {
    const snapshotRows = db.prepare("SELECT * FROM BillingExportSnapshot WHERE batchId = ?").all(batchId) as BillingExportSnapshotRow[]
    await supabaseBillingRepo.upsertSnapshots(snapshotRows)
  } catch (err) {
    console.error("[mirrorBatchExport] snapshot mirror failed (re-download may rebuild):", err)
  }
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
    if (!result.snapshots.length) {
      throw new Error("Export produced no snapshot rows")
    }

    const clearedHandoffs = billingHandoffDb.handoffsForBatch(result.batch.id)
    const clearedAt = clearedHandoffs[0]?.clearedByAccountsAt ?? result.batch.createdAt

    await mirrorBatchExport(result.batch.id, data.handoffIds, {
      clearedBy: data.exportedBy,
      clearedAt,
      notes: data.notes,
    })

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

    const fromSupabase = await supabaseBillingRepo.snapshotsForBatch(batchId)
    if (fromSupabase.length) return fromSupabase

    // Recovery path: batch cleared in Supabase but snapshot rows never mirrored.
    const handoffs = await supabaseBillingRepo.handoffsForBatch(batchId)
    if (!handoffs.length) return []

    await ensureBillingHandoffsInSqlite(handoffs.map(h => h.id))
    return handoffs.map(h => billingHandoffDb.buildAccountsHandoverSnapshot(h))
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
