/**
 * Supabase-only billing handoff operations (Vercel / isSupabaseOnly).
 * Never imports SQLite billingHandoffDb / connection.
 */
import type {
  BillingExportBatchRow,
  BillingExportSnapshotRow,
  BillingHandoffListOptions,
  BillingHandoffRow,
} from "../types/billing-types"
import type { AccountsHandoverSnapshot } from "@/lib/db/stores"
import { supabaseBillingRepo } from "../supabase/repository"
import { supabaseJobRepo } from "@/lib/supabase/repositories/jobs"
import { buildAccountsHandoverSnapshotsBatch } from "./billing-snapshot-builder"
import { nextRefNumberAsync } from "@/shared/supabase/sequence-service"
import { createId as nanoid } from "@paralleldrive/cuid2"
import { nowIso } from "@/lib/db/helpers"
import { totalJobCommercialValue } from "@/lib/utils"

export const billingHandoffService = {
  async findMany(opts: BillingHandoffListOptions = {}): Promise<BillingHandoffRow[]> {
    return supabaseBillingRepo.findMany(opts)
  },

  async findBySourceJobId(jobId: string): Promise<BillingHandoffRow | null> {
    return supabaseBillingRepo.findBySourceJobId(jobId)
  },

  async findManyByIds(ids: string[]): Promise<BillingHandoffRow[]> {
    return supabaseBillingRepo.findManyByIds(ids)
  },

  async buildAccountsHandoverSnapshot(handoff: BillingHandoffRow): Promise<AccountsHandoverSnapshot> {
    const [snapshot] = await buildAccountsHandoverSnapshotsBatch([handoff])
    return snapshot!
  },

  async createExportBatch(data: {
    handoffIds: string[]
    exportedBy: string
    exportDate: string
    notes?: string | null
  }): Promise<{ batch: BillingExportBatchRow; snapshots: AccountsHandoverSnapshot[] }> {
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
    const snapshots = await buildAccountsHandoverSnapshotsBatch(orderedHandoffs)
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
  },

  async findBatchUnique(id: string): Promise<BillingExportBatchRow | null> {
    return supabaseBillingRepo.findBatchUnique(id)
  },

  async findBatches(opts: { skip?: number; take?: number } = {}): Promise<BillingExportBatchRow[]> {
    return supabaseBillingRepo.findBatches(opts)
  },

  async handoffsForBatch(batchId: string): Promise<BillingHandoffRow[]> {
    return supabaseBillingRepo.handoffsForBatch(batchId)
  },

  async snapshotsForBatch(batchId: string): Promise<AccountsHandoverSnapshot[]> {
    const fromSupabase = await supabaseBillingRepo.snapshotsForBatch(batchId)
    if (fromSupabase.length) return fromSupabase

    // Recovery path: batch cleared but snapshot rows never persisted — rebuild from handoffs.
    const handoffs = await supabaseBillingRepo.handoffsForBatch(batchId)
    if (!handoffs.length) return []
    return buildAccountsHandoverSnapshotsBatch(handoffs)
  },

  async stats(): Promise<{ awaitingCount: number; awaitingValue: number; clearedCount: number }> {
    return supabaseBillingRepo.stats()
  },

  /** Dashboard KPI — head count only (no sum / cleared scan). */
  async awaitingCount(): Promise<number> {
    return supabaseBillingRepo.awaitingCount()
  },

  async updateQuoteValue(handoffId: string, quoteValue: number): Promise<BillingHandoffRow | { error: string }> {
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
  },

  /** No-op on Supabase-only — handoffs are written directly to Supabase. */
  async syncJobHandoffs(_jobId: string): Promise<void> {
    return
  },
}
