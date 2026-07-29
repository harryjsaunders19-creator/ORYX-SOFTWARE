/**
 * SQLite sequence seeding.
 * Loaded only when !isSupabaseOnly() via dynamic import from seed-sequences.ts.
 * (When admin credentials exist, isSupabaseOnly() is true and this module is never loaded.)
 */
import { sequenceDb } from "@/lib/db"
import { db } from "@/lib/db/connection"

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
  seedBatchRefSequenceFromSqlite(year)
  console.log("[seed-sequences] Sequences seeded from SQLite")
}

export async function seedBatchSequence(): Promise<void> {
  seedBatchRefSequenceFromSqlite(new Date().getFullYear())
}
