/**
 * lib/supabase/seed-sequences.ts
 *
 * On a fresh Vercel container, the SQLite DrawingSequence and RefSequence
 * tables are empty. Without seeding, the first new job gets drawing number
 * "26/ORYX/06/001", which already exists in Supabase → unique constraint
 * violation → 500 "failed to create job".
 *
 * This module queries Supabase once per serverless container instance and
 * seeds the local SQLite sequences so new numbers never collide.
 */
import { sequenceDb } from "@/lib/db"
import { supabaseJobRepo } from "@/lib/supabase/repositories/jobs"
import { supabaseQuoteRepo } from "@/lib/supabase/repositories/quotes"
import { useSupabaseJobs, useSupabaseQuotes } from "@/lib/supabase/feature-flags"

let _seeded = false

export async function ensureSequencesSeeded(): Promise<void> {
  if (_seeded) return
  _seeded = true
  try {
    const promises: Promise<void>[] = []

    if (useSupabaseJobs()) {
      promises.push(
        supabaseJobRepo.maxDrawingSequences().then(rows => {
          for (const { yearMonth, maxSeq } of rows) sequenceDb.seedSequence(yearMonth, maxSeq)
        }),
        supabaseJobRepo.maxRefSequences().then(rows => {
          for (const { prefix, year, maxSeq } of rows) sequenceDb.seedRefSequence(prefix, year, maxSeq)
        }),
      )
    }

    if (useSupabaseQuotes()) {
      promises.push(
        supabaseQuoteRepo.maxQuoteRefSequences().then(rows => {
          for (const { prefix, year, maxSeq } of rows) sequenceDb.seedRefSequence(prefix, year, maxSeq)
        }),
      )
    }

    if (promises.length) {
      await Promise.all(promises)
      console.log("[seed-sequences] Sequences seeded from Supabase")
    }
  } catch (err) {
    console.error("[seed-sequences] Failed, will retry on next request:", err)
    _seeded = false
  }
}
