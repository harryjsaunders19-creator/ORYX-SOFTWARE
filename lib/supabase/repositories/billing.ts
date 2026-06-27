import { createAdminClient } from "@/lib/supabase/admin"
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
    const { data: awaitingRows, error: aErr } = await handoffs()
      .select("quote_value")
      .is("cleared_by_accounts_at", null)
    if (aErr) throw aErr
    const { count: clearedCount, error: cErr } = await handoffs()
      .select("*", { count: "exact", head: true })
      .not("cleared_by_accounts_at", "is", null)
    if (cErr) throw cErr
    const awaitingCount = awaitingRows?.length ?? 0
    const awaitingValue = (awaitingRows ?? []).reduce((sum, r) => sum + Number(r.quote_value ?? 0), 0)
    return { awaitingCount, awaitingValue, clearedCount: clearedCount ?? 0 }
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
    const { error } = await snapshots().upsert(rows.map(toSupabaseBillingExportSnapshotRow), { onConflict: "id" })
    if (error) throw error
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
