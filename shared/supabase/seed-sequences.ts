/**
 * Sequence seeding entry — no static SQLite imports.
 * When isSupabaseOnly(), all exports are no-ops (Supabase app_sequences handles allocation).
 * Otherwise loads seed-sequences-sqlite via dynamic import.
 */
import { isSupabaseOnly } from "./feature-flags"

let _seeded = false
let _seedInFlight: Promise<void> | null = null

export async function ensureSequencesSeeded(): Promise<void> {
  if (isSupabaseOnly()) return
  if (_seeded) return
  if (!_seedInFlight) {
    _seedInFlight = (async () => {
      const { runSeed } = await import("./seed-sequences-sqlite")
      await runSeed()
      _seeded = true
    })().catch(err => {
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
  const { seedBatchSequence } = await import("./seed-sequences-sqlite")
  await seedBatchSequence()
}
