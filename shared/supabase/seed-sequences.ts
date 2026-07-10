/**
 * lib/supabase/seed-sequences.ts
 *
 * On a fresh Vercel container, the SQLite DrawingSequence and RefSequence
 * tables are empty. Without seeding, the first new job gets drawing number
 * "26/ORYX/07/428", which already exists in Supabase → unique constraint
 * violation → 500 "failed to create job".
 *
 * This module queries Supabase once per serverless container instance and
 * seeds the local SQLite sequences so new numbers never collide.
 */
import { sequenceDb } from "@/lib/db"
import { DRAWING_SEQUENCE_KEY } from "@/lib/drawing-number"
import { db } from "@/lib/db/connection"
import { supabaseJobRepo } from "@/lib/supabase/repositories/jobs"
import { supabaseQuoteRepo } from "@/lib/supabase/repositories/quotes"
import { supabaseBillingRepo } from "@/lib/supabase/repositories/billing"
import { useSupabaseBilling, useSupabaseJobs, useSupabaseQuotes } from "@/lib/supabase/feature-flags"
import { isSupabaseOnly } from "./feature-flags"

let _seeded = false
let _seedInFlight: Promise<void> | null = null

function seedBatchRefSequenceFromSqlite(year: number): void {
  try {
    const prefix = `BATCH-${year}-`
    const rows = db.prepare(
      "SELECT batchNumber FROM BillingExportBatch WHERE batchNumber LIKE ? || '%'",
    ).all(prefix) as { batchNumber: string }[]
    let max = 0
    for (const { batchNumber } of rows) {
      if (!batchNumber.startsWith(prefix)) continue
      const n = parseInt(batchNumber.slice(prefix.length), 10)
      if (!Number.isNaN(n) && n > max) max = n
    }
    if (max > 0) sequenceDb.seedRefSequence("BATCH", year, max)
  } catch {
    // SQLite may be empty or tables not ready
  }
}

async function runSeed(): Promise<void> {
  const year = new Date().getFullYear()
  const promises: Promise<void>[] = []

    if (useSupabaseJobs()) {
      promises.push(
        supabaseJobRepo.maxGlobalDrawingSequence().then(maxSeq => {
          if (maxSeq > 0) {
            sequenceDb.seedSequence(DRAWING_SEQUENCE_KEY, maxSeq)
            console.log(`[seed-sequences] Drawing sequence seeded to ${maxSeq}`)
          } else {
            console.warn("[seed-sequences] No ORYX drawing numbers found in Supabase — starting from 001")
          }
        }),
      supabaseJobRepo.maxRefSequences().then(rows => {
        for (const { prefix, year: y, maxSeq } of rows) sequenceDb.seedRefSequence(prefix, y, maxSeq)
      }),
    )
  }

  if (useSupabaseQuotes()) {
    promises.push(
      supabaseQuoteRepo.maxQuoteRefSequences().then(rows => {
        for (const { prefix, year: y, maxSeq } of rows) sequenceDb.seedRefSequence(prefix, y, maxSeq)
      }),
    )
  }

  if (useSupabaseBilling()) {
    promises.push(
      supabaseBillingRepo.maxBatchRefSequence(year).then(maxSeq => {
        if (maxSeq > 0) sequenceDb.seedRefSequence("BATCH", year, maxSeq)
      }),
    )
  }

  if (promises.length) {
    await Promise.all(promises)
  }

  seedBatchRefSequenceFromSqlite(year)
  console.log("[seed-sequences] Sequences seeded from Supabase/SQLite")
  _seeded = true
}

export async function ensureSequencesSeeded(): Promise<void> {
  if (isSupabaseOnly()) return
  if (_seeded) return
  if (!_seedInFlight) {
    _seedInFlight = runSeed().catch(err => {
      console.error("[seed-sequences] Failed, will retry on next request:", err)
      _seeded = false
      throw err
    }).finally(() => {
      _seedInFlight = null
    })
  }
  await _seedInFlight
}

/** Always sync BATCH-YYYY-NNN counter from Supabase before allocating a new export batch. */
export async function ensureBatchSequenceSeeded(): Promise<void> {
  if (isSupabaseOnly()) return
  const year = new Date().getFullYear()
  seedBatchRefSequenceFromSqlite(year)
  if (!useSupabaseBilling()) return
  const maxSeq = await supabaseBillingRepo.maxBatchRefSequence(year)
  if (maxSeq > 0) sequenceDb.seedRefSequence("BATCH", year, maxSeq)
}
