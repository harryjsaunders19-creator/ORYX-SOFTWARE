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
} from "../types/billing-types"
import { billingHandoffDb, jobDb, type AccountsHandoverSnapshot } from "@/lib/db/stores"
import { useSupabaseBilling, useSupabaseJobs, isSupabaseOnly } from "@/lib/supabase/feature-flags"
import { supabaseBillingRepo } from "../supabase/repository"
import { supabaseJobRepo } from "@/lib/supabase/repositories/jobs"
import { ensureJobInSqliteForBilling } from "@/lib/services/job-service"
import { ensureBatchSequenceSeeded } from "@/lib/supabase/seed-sequences"
import { buildAccountsHandoverSnapshotAsync } from "./billing-snapshot-builder"
import { nextRefNumberAsync } from "@/shared/supabase/sequence-service"
import { createId as nanoid } from "@paralleldrive/cuid2"
import { nowIso } from "@/lib/db/helpers"
import { totalJobCommercialValue } from "@/lib/utils"

const SYNC_CHUNK = 25

/**
 * Copies billing handoffs (and their source jobs) from Supabase into the
 * ephemeral SQLite DB so createExportBatch / buildAccountsHandoverSnapshot
 * can run unchanged on Vercel.
 */
async function ensureBillingHandoffsInSqlite(ids: string[]): Promise<void> {
  if (!useSupabaseBilling() || isSupabaseOnly()) return

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
    if (isSupabaseOnly()) {
      if (!data.handoffIds.length) throw new Error("No items selected for export")
      const handoffs = await supabaseBillingRepo.findManyByIds(data.handoffIds)
      const byId = new Map(handoffs.map(h => [h.id, h]))
      for (const id of data.handoffIds) {
        const h = byId.get(id)
        if (!h) throw new Error(`Item ${id} not found`)
        if (h.clearedByAccountsAt) throw new Error(`${h.drawingNumber} has already been cleared`)
      }
      const orderedHandoffs = data.handoffIds.map(id => byId.get(id)!)
      const batchId = nanoid()
      const batchNumber = await nextRefNumberAsync("BATCH")
      const now = nowIso()
      const snapshots = await Promise.all(
        orderedHandoffs.map(h => buildAccountsHandoverSnapshotAsync(h)),
      )
      if (!snapshots.length) throw new Error("Export produced no snapshot rows")

      const batch: BillingExportBatchRow = {
        id: batchId,
        batchNumber,
        exportDate: data.exportDate,
        exportedBy: data.exportedBy,
        recordCount: orderedHandoffs.length,
        notes: data.notes ?? null,
        createdAt: now,
      }
      await supabaseBillingRepo.upsertBatch(batch)

      const snapshotRows: BillingExportSnapshotRow[] = orderedHandoffs.map((h, i) => ({
        id: nanoid(),
        batchId,
        handoffId: h.id,
        snapshotJson: JSON.stringify(snapshots[i]),
        createdAt: now,
      }))
      await supabaseBillingRepo.upsertSnapshots(snapshotRows)

      await supabaseBillingRepo.clearHandoffsForExport({
        handoffIds: data.handoffIds,
        batchId,
        clearedAt: now,
        clearedBy: data.exportedBy,
        notes: data.notes,
      })

      const stillAwaiting = await supabaseBillingRepo.countUnclearedAmong(data.handoffIds)
      if (stillAwaiting > 0) {
        throw new Error(`${stillAwaiting} item(s) failed to move to Cleared in Supabase`)
      }

      return { batch, snapshots }
    }

    await ensureBatchSequenceSeeded()
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
    if (isSupabaseOnly()) {
      const handoff = await supabaseBillingRepo.findUnique(handoffId)
      if (!handoff) return { error: "Not found" }
      if (handoff.clearedByAccountsAt) return { error: "Cannot edit a cleared item" }
      if (quoteValue < 0) return { error: "Value cannot be negative" }
      const job = await supabaseJobRepo.findUnique(handoff.sourceJobId)
      if (!job) return { error: "Source job not found" }
      const now = nowIso()
      const updatedJob = { ...job, quoteValue, updatedAt: now }
      await supabaseJobRepo.upsert(updatedJob)
      const snapshotValue = totalJobCommercialValue(updatedJob) ?? quoteValue
      const updatedHandoff: BillingHandoffRow = {
        ...handoff,
        quoteValue: snapshotValue,
        updatedAt: now,
      }
      await supabaseBillingRepo.upsertHandoff(updatedHandoff)
      return updatedHandoff
    }
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
    if (!useSupabaseBilling() || isSupabaseOnly()) return
    const rows = billingHandoffDb.findHistoryBySourceJobId(jobId)
    await supabaseBillingRepo.replaceHandoffsForJob(jobId, rows)
  },
}
