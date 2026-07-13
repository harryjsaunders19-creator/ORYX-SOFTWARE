/**
 * Supabase-backed sequence allocation (drawing numbers, ref numbers, export batches).
 * Used when isSupabaseOnly() — SQLite counters are not reliable on Vercel.
 */
import { createAdminClient } from "./admin"
import {
  DRAWING_SEQUENCE_KEY,
  buildDrawingNumber,
  nextDrawingSequenceAfter,
} from "@/lib/drawing-number"
import { isSupabaseOnly } from "./feature-flags"
import { supabaseJobRepo } from "@/lib/supabase/repositories/jobs"
import { supabaseQuoteRepo } from "@/lib/supabase/repositories/quotes"
import { supabaseBillingRepo } from "@/lib/supabase/repositories/billing"

const drawingInit = { promise: null as Promise<void> | null }
const refInits = new Map<string, Promise<void>>()

function refSequenceName(prefix: string, year: number): string {
  return `ref:${prefix}:${year}`
}

async function bumpSequence(name: string, delta = 1): Promise<number> {
  const { data, error } = await createAdminClient().rpc("bump_app_sequence", {
    p_name: name,
    p_delta: delta,
  })
  if (error) throw error
  return data as number
}

async function currentSequence(name: string): Promise<number | null> {
  const { data, error } = await createAdminClient()
    .from("app_sequences")
    .select("value")
    .eq("name", name)
    .maybeSingle()
  if (error) throw error
  return data?.value ?? null
}

/** Floor the counter to at least `value` — never lowers an existing row (cold-start safe). */
async function seedSequence(name: string, value: number): Promise<void> {
  if (value <= 0) return
  const { error } = await createAdminClient().rpc("seed_app_sequence", {
    p_name: name,
    p_value: value,
  })
  if (error) throw error
}

async function ensureDrawingSequenceInitialized(): Promise<void> {
  if (!drawingInit.promise) {
    drawingInit.promise = (async () => {
      const existing = await currentSequence(DRAWING_SEQUENCE_KEY)
      if (existing != null) return
      const max = await supabaseJobRepo.maxGlobalDrawingSequence()
      await seedSequence(DRAWING_SEQUENCE_KEY, max)
    })().catch(err => {
      drawingInit.promise = null
      throw err
    })
  }
  await drawingInit.promise
}

async function ensureRefSequenceInitialized(prefix: string, year: number): Promise<void> {
  const name = refSequenceName(prefix, year)
  let init = refInits.get(name)
  if (!init) {
    init = (async () => {
      const existing = await currentSequence(name)
      if (existing != null) return
      let max = 0
      if (prefix === "BATCH") {
        max = await supabaseBillingRepo.maxBatchRefSequence(year)
      } else if (prefix === "Q") {
        const rows = await supabaseQuoteRepo.maxQuoteRefSequences()
        max = rows.find(r => r.prefix === prefix && r.year === year)?.maxSeq ?? 0
      } else {
        const rows = await supabaseJobRepo.maxRefSequences()
        max = rows.find(r => r.prefix === prefix && r.year === year)?.maxSeq ?? 0
      }
      await seedSequence(name, max)
    })().catch(err => {
      refInits.delete(name)
      throw err
    })
    refInits.set(name, init)
  }
  await init
}

/** Allocate the next YY/ORYX/MM/NNN drawing number from Supabase. */
export async function allocateDrawingNumberAsync(date = new Date()): Promise<string> {
  if (!isSupabaseOnly()) {
    const { allocateDrawingNumber } = await import("@/lib/db/stores/sequence")
    return allocateDrawingNumber(date)
  }
  await ensureDrawingSequenceInitialized()
  const seq = await bumpSequence(DRAWING_SEQUENCE_KEY)
  return buildDrawingNumber(seq, date)
}

/** Preview next drawing number without consuming (Supabase or SQLite). */
export async function peekNextDrawingNumberAsync(date = new Date()): Promise<string> {
  if (!isSupabaseOnly()) {
    const { peekNextDrawingNumber } = await import("@/lib/db/stores/sequence")
    return peekNextDrawingNumber(date)
  }
  await ensureDrawingSequenceInitialized()
  const current = (await currentSequence(DRAWING_SEQUENCE_KEY)) ?? 0
  return buildDrawingNumber(nextDrawingSequenceAfter(current), date)
}

/** PREFIX-YYYY-NNN reference numbers (Q, BATCH, SV, etc.). */
export async function nextRefNumberAsync(prefix: string): Promise<string> {
  const year = new Date().getFullYear()
  if (!isSupabaseOnly()) {
    const { sequenceDb } = await import("@/lib/db/stores/sequence")
    return sequenceDb.nextRefNumber(prefix)
  }
  await ensureRefSequenceInitialized(prefix, year)
  const seq = await bumpSequence(refSequenceName(prefix, year))
  return `${prefix}-${year}-${String(seq).padStart(3, "0")}`
}
