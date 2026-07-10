import { createAdminClient } from "@/lib/supabase/admin"
import { aggSum } from "@/lib/supabase/aggregates"
import type {
  BillingExportBatchRow,
  BillingExportSnapshotRow,
  BillingHandoffListOptions,
  BillingHandoffRow,
} from "../types/billing-types"
import type { AccountsHandoverSnapshot } from "@/lib/db/stores"
import {
  parseSnapshotJson,
  toBillingExportBatchRow,
  toBillingHandoffRow,
  toSupabaseBillingExportBatchRow,
  toSupabaseBillingExportSnapshotRow,
  toSupabaseBillingHandoffRow,
} from "./mapper"

function handoffs() {
  return createAdminClient().from("billing_handoffs")
}

function batches() {
  return createAdminClient().from("billing_export_batches")
}

function snapshots() {
  return createAdminClient().from("billing_export_snapshots")
}

const IN_CHUNK = 40

/** PostgREST throws plain objects — normalise to Error so API routes surface the message. */
function throwSupabaseError(error: { message?: string; details?: string; hint?: string; code?: string } | null): void {
  if (!error) return
  const msg = [error.message, error.details, error.hint, error.code ? `(${error.code})` : null]
    .filter(Boolean)
    .join(" — ")
  throw new Error(msg || "Supabase request failed")
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
    throwSupabaseError(error)
    return (data ?? []).map(toBillingHandoffRow)
  },

  async count(opts: { cleared?: boolean } = {}): Promise<number> {
    const { count, error } = await applyHandoffFilters(
      handoffs().select("*", { count: "exact", head: true }),
      opts,
    )
    throwSupabaseError(error)
    return count ?? 0
  },

  async findUnique(id: string): Promise<BillingHandoffRow | null> {
    const { data, error } = await handoffs().select("*").eq("id", id).maybeSingle()
    throwSupabaseError(error)
    return data ? toBillingHandoffRow(data) : null
  },

  async findManyByIds(ids: string[]): Promise<BillingHandoffRow[]> {
    if (!ids.length) return []
    const unique = [...new Set(ids)]
    const out: BillingHandoffRow[] = []
    for (let i = 0; i < unique.length; i += IN_CHUNK) {
      const chunk = unique.slice(i, i + IN_CHUNK)
      const { data, error } = await handoffs().select("*").in("id", chunk)
      throwSupabaseError(error)
      out.push(...(data ?? []).map(toBillingHandoffRow))
    }
    return out
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
    throwSupabaseError(error)
  },

  async upsertManyHandoffs(rows: BillingHandoffRow[]): Promise<void> {
    if (!rows.length) return
    const CHUNK = 50
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK)
      const { error } = await handoffs().upsert(slice.map(toSupabaseBillingHandoffRow), { onConflict: "id" })
      throwSupabaseError(error)
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

    const rows = await this.findManyByIds(params.handoffIds)
    const byId = new Map(rows.map(r => [r.id, r]))
    const missing = params.handoffIds.filter(id => !byId.has(id))
    if (missing.length) {
      throw new Error(`${missing.length} item(s) not found in Supabase billing queue`)
    }

    const clearedRows = params.handoffIds.map(id => {
      const row = byId.get(id)!
      return {
        ...row,
        clearedByAccountsAt: row.clearedByAccountsAt ?? params.clearedAt,
        clearedBy: row.clearedBy ?? params.clearedBy,
        exportBatchId: params.batchId,
        notes: params.notes ?? row.notes,
        updatedAt: params.clearedAt,
      }
    })

    await this.upsertManyHandoffs(clearedRows)
  },

  async countUnclearedAmong(ids: string[]): Promise<number> {
    if (!ids.length) return 0
    const unique = [...new Set(ids)]
    let total = 0
    for (let i = 0; i < unique.length; i += IN_CHUNK) {
      const chunk = unique.slice(i, i + IN_CHUNK)
      const { count, error } = await handoffs()
        .select("*", { count: "exact", head: true })
        .in("id", chunk)
        .is("cleared_by_accounts_at", null)
      throwSupabaseError(error)
      total += count ?? 0
    }
    return total
  },

  async replaceHandoffsForJob(jobId: string, rows: BillingHandoffRow[]): Promise<void> {
    const { error: delError } = await handoffs().delete().eq("source_job_id", jobId)
    if (delError) throw delError
    if (!rows.length) return
    const { error } = await handoffs().insert(rows.map(toSupabaseBillingHandoffRow))
    if (error) throw error
  },

  async deleteHandoff(id: string): Promise<void> {
    const { error } = await handoffs().delete().eq("id", id)
    throwSupabaseError(error)
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
    throwSupabaseError(error)
  },

  /** Highest BATCH-YYYY-NNN suffix already used in Supabase (for sequence seeding on Vercel). */
  async maxBatchRefSequence(year: number): Promise<number> {
    const prefix = `BATCH-${year}-`
    const { data, error } = await batches()
      .select("batch_number")
      .ilike("batch_number", `${prefix}%`)
    throwSupabaseError(error)
    let max = 0
    for (const row of data ?? []) {
      const bn = String(row.batch_number)
      if (!bn.startsWith(prefix)) continue
      const n = parseInt(bn.slice(prefix.length), 10)
      if (!Number.isNaN(n) && n > max) max = n
    }
    return max
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
      const { error } = await snapshots().upsert(
        slice.map(toSupabaseBillingExportSnapshotRow),
        { onConflict: "handoff_id" },
      )
      throwSupabaseError(error)
    }
  },

  async snapshotsForBatch(batchId: string): Promise<AccountsHandoverSnapshot[]> {
    const { data, error } = await snapshots().select("*").eq("batch_id", batchId)
    if (error) throw error
    const rows = data ?? []
    if (!rows.length) return []
    const handoffIds = rows.map((r) => r.handoff_id as string)
    const drawingById = new Map<string, string>()
    for (let i = 0; i < handoffIds.length; i += IN_CHUNK) {
      const chunk = handoffIds.slice(i, i + IN_CHUNK)
      const { data: hs, error: hErr } = await handoffs().select("id, drawing_number").in("id", chunk)
      throwSupabaseError(hErr)
      for (const h of hs ?? []) {
        drawingById.set(h.id as string, h.drawing_number as string)
      }
    }
    rows.sort((a, b) =>
      (drawingById.get(a.handoff_id as string) ?? "").localeCompare(drawingById.get(b.handoff_id as string) ?? ""),
    )
    return rows.map((r) => parseSnapshotJson(r.snapshot_json as string))
  },
}
