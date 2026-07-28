/**
 * SQLite sequence seeding from Supabase maxima.
 * Loaded only when !isSupabaseOnly() via dynamic import from seed-sequences.ts.
 */
import { sequenceDb } from "@/lib/db"
import { DRAWING_SEQUENCE_KEY } from "@/lib/drawing-number"
import { db } from "@/lib/db/connection"
import { supabaseJobRepo } from "@/modules/jobs/supabase/repository"
import { supabaseQuoteRepo } from "@/modules/quotes/supabase/repository"
import { supabaseBillingRepo } from "@/modules/billing/supabase/repository"
import { useSupabaseBilling, useSupabaseJobs, useSupabaseQuotes } from "@/shared/supabase/feature-flags"

export function seedBatchRefSequenceFromSqlite(year: number): void {
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

export async function runSeed(): Promise<void> {
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
}

export async function seedBatchSequence(): Promise<void> {
  const year = new Date().getFullYear()
  seedBatchRefSequenceFromSqlite(year)
  if (!useSupabaseBilling()) return
  const maxSeq = await supabaseBillingRepo.maxBatchRefSequence(year)
  if (maxSeq > 0) sequenceDb.seedRefSequence("BATCH", year, maxSeq)
}
