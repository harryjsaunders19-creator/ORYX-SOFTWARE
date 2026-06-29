import { createAdminClient } from "@/lib/supabase/admin"
import { aggSum } from "@/lib/supabase/aggregates"
import type {
  BillingExportBatchRow,
  BillingExportSnapshotRow,
  BillingHandoffListOptions,
  BillingHandoffRow,
} from "@/lib/db/billing-types"
import type { AccountsHandoverSnapshot } from "@/lib/db/stores"
import {
  parseSnapshotJson,
  toBillingExportBatchRow,
  toBillingHandoffRow,
  toSupabaseBillingExportBatchRow,
  toSupabaseBillingExportSnapshotRow,
  toSupabaseBillingHandoffRow,
} from "@/lib/supabase/mappers/billing"

function handoffs() {
  return createAdminClient().from("billing_handoffs")
}

function batches() {
  return createAdminClient().from("billing_export_batches")
}

function snapshots() {
  return createAdminClient().from("billing_export_snapshots")
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Q = any

function applyHandoffFilters(q: Q, opts: BillingHandoffListOptions): Q {
  if (opts.cleared === true) q = q.not("cleared_by_accounts_at", "is", null)
  if (opts.cleared === false) q = q.is("cleared_by_accounts_at", null)
  return q
}

export const supabaseBillingRepo = {
  async findMany(opts: BillingHandoffListOptions = {}): Promise<BillingHandoffRow[]> {
    const asc = opts.cleared !== true
    let q = applyHandoffFilters(handoffs().select("*"), opts).order(
      asc ? "added_to_billing_queue_at" : "cleared_by_accounts_at",
      { ascending: asc },
    )
    if (opts.skip != null && opts.take != null) q = q.range(opts.skip, opts.skip + opts.take - 1)
    else if (opts.take != null) q = q.limit(opts.take)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map(toBillingHandoffRow)
  },

  async count(opts: { cleared?: boolean } = {}): Promise<number> {
    const { count, error } = await applyHandoffFilters(
      handoffs().select("*", { count: "exact", head: true }),
      opts,
    )
    if (error) throw error
    return count ?? 0
  },

  async findUnique(id: string): Promise<BillingHandoffRow | null> {
    const { data, error } = await handoffs().select("*").eq("id", id).maybeSingle()
    if (error) throw error
    return data ? toBillingHandoffRow(data) : null
  },

  async findManyByIds(ids: string[]): Promise<BillingHandoffRow[]> {
    if (!ids.length) return []
    const { data, error } = await handoffs().select("*").in("id", ids)
    if (error) throw error
    return (data ?? []).map(toBillingHandoffRow)
  },

  async findBySourceJobId(jobId: string): Promise<BillingHandoffRow | null> {
    const { data, error } = await handoffs()
      .select("*")
      .eq("source_job_id", jobId)
      .is("cleared_by_accounts_at", null)
      .maybeSingle()
    if (error) throw error
    return data ? toBillingHandoffRow(data) : null
  },

  async findHistoryBySourceJobId(jobId: string): Promise<BillingHandoffRow[]> {
    const { data, error } = await handoffs()
      .select("*")
      .eq("source_job_id", jobId)
      .order("created_at", { ascending: false })
    if (error) throw error
    return (data ?? []).map(toBillingHandoffRow)
  },

  async upsertHandoff(row: BillingHandoffRow): Promise<void> {
    const { error } = await handoffs().upsert(toSupabaseBillingHandoffRow(row), { onConflict: "id" })
    if (error) throw error
  },

  async upsertManyHandoffs(rows: BillingHandoffRow[]): Promise<void> {
    if (!rows.length) return
    const CHUNK = 50
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK)
      const { error } = await handoffs().upsert(slice.map(toSupabaseBillingHandoffRow), { onConflict: "id" })
      if (error) throw error
    }
  },

  /** Mark exported handoffs cleared in Supabase — source of truth on Vercel. */
  async clearHandoffsForExport(params: {
    handoffIds: string[]
    batchId: string
    clearedAt: string
    clearedBy: string
    notes?: string | null
  }): Promise<void> {
    if (!params.handoffIds.length) return
    const patch: Record<string, string | null> = {
      cleared_by_accounts_at: params.clearedAt,
      cleared_by: params.clearedBy,
      export_batch_id: params.batchId,
      updated_at: params.clearedAt,
    }
    if (params.notes != null) patch.notes = params.notes

    const CHUNK = 50
    for (let i = 0; i < params.handoffIds.length; i += CHUNK) {
      const ids = params.handoffIds.slice(i, i + CHUNK)
      const { error } = await handoffs()
        .update(patch)
        .in("id", ids)
        .is("cleared_by_accounts_at", null)
      if (error) throw error
    }
  },

  async countUnclearedAmong(ids: string[]): Promise<number> {
    if (!ids.length) return 0
    const { count, error } = await handoffs()
      .select("*", { count: "exact", head: true })
      .in("id", ids)
      .is("cleared_by_accounts_at", null)
    if (error) throw error
    return count ?? 0
  },

  async replaceHandoffsForJob(jobId: string, rows: BillingHandoffRow[]): Promise<void> {
    const { error: delError } = await handoffs().delete().eq("source_job_id", jobId)
    if (delError) throw delError
    if (!rows.length) return
    const { error } = await handoffs().insert(rows.map(toSupabaseBillingHandoffRow))
    if (error) throw error
  },

  async handoffsForBatch(batchId: string): Promise<BillingHandoffRow[]> {
    const { data, error } = await handoffs()
      .select("*")
      .eq("export_batch_id", batchId)
      .order("drawing_number", { ascending: true })
    if (error) throw error
    return (data ?? []).map(toBillingHandoffRow)
  },

  async stats(): Promise<{ awaitingCount: number; awaitingValue: number; clearedCount: number }> {
    const [
      { count: awaitingCount, error: aCountErr },
      { data: sumRow, error: aSumErr },
      { count: clearedCount, error: cErr },
    ] = await Promise.all([
      handoffs().select("*", { count: "exact", head: true }).is("cleared_by_accounts_at", null),
      handoffs().select("quote_value.sum()").is("cleared_by_accounts_at", null).maybeSingle(),
      handoffs().select("*", { count: "exact", head: true }).not("cleared_by_accounts_at", "is", null),
    ])
    if (aCountErr) throw aCountErr
    if (cErr) throw cErr

    let awaitingValue = aggSum(sumRow)
    if (aSumErr) {
      // PostgREST aggregate syntax varies by version — fall back to a row scan.
      const { data, error } = await handoffs()
        .select("quote_value")
        .is("cleared_by_accounts_at", null)
      if (error) throw error
      awaitingValue = (data ?? []).reduce(
        (sum, row) => sum + (row.quote_value != null ? Number(row.quote_value) : 0),
        0,
      )
    }

    return {
      awaitingCount: awaitingCount ?? 0,
      awaitingValue,
      clearedCount:  clearedCount ?? 0,
    }
  },

  async upsertBatch(row: BillingExportBatchRow): Promise<void> {
    const { error } = await batches().upsert(toSupabaseBillingExportBatchRow(row), { onConflict: "id" })
    if (error) throw error
  },

  async findBatchUnique(id: string): Promise<BillingExportBatchRow | null> {
    const { data, error } = await batches().select("*").eq("id", id).maybeSingle()
    if (error) throw error
    return data ? toBillingExportBatchRow(data) : null
  },

  async findBatches(opts: { skip?: number; take?: number } = {}): Promise<BillingExportBatchRow[]> {
    let q = batches().select("*").order("created_at", { ascending: false })
    if (opts.skip != null && opts.take != null) q = q.range(opts.skip, opts.skip + opts.take - 1)
    else if (opts.take != null) q = q.limit(opts.take)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map(toBillingExportBatchRow)
  },

  async upsertSnapshots(rows: BillingExportSnapshotRow[]): Promise<void> {
    if (!rows.length) return
    const CHUNK = 50
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK)
      const { error } = await snapshots().upsert(slice.map(toSupabaseBillingExportSnapshotRow), { onConflict: "id" })
      if (error) throw error
    }
  },

  async snapshotsForBatch(batchId: string): Promise<AccountsHandoverSnapshot[]> {
    const { data, error } = await snapshots().select("*").eq("batch_id", batchId)
    if (error) throw error
    const rows = data ?? []
    if (!rows.length) return []
    const handoffIds = rows.map((r) => r.handoff_id as string)
    const { data: hs, error: hErr } = await handoffs().select("id, drawing_number").in("id", handoffIds)
    if (hErr) throw hErr
    const drawingById = new Map((hs ?? []).map((h) => [h.id as string, h.drawing_number as string]))
    rows.sort((a, b) =>
      (drawingById.get(a.handoff_id as string) ?? "").localeCompare(drawingById.get(b.handoff_id as string) ?? ""),
    )
    return rows.map((r) => parseSnapshotJson(r.snapshot_json as string))
  },
}
