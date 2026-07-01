/** DrawingSequence and RefSequence counters. */
import { db, DB_EXISTED } from "../connection"
import { createId as nanoid } from "@paralleldrive/cuid2"

export const sequenceDb = {
  nextSequence(yearMonth: string): number {
    const run = db.transaction(() => {
      const existing = db.prepare("SELECT sequence FROM DrawingSequence WHERE yearMonth = ?").get(yearMonth) as { sequence: number } | undefined
      if (existing) {
        const next = existing.sequence + 1
        db.prepare("UPDATE DrawingSequence SET sequence = ? WHERE yearMonth = ?").run(next, yearMonth)
        return next
      } else {
        db.prepare("INSERT INTO DrawingSequence (id,yearMonth,sequence) VALUES (?,?,1)").run(nanoid(), yearMonth)
        return 1
      }
    })
    return run() as number
  },

  /**
   * Generate a reference number for non-drawing work items.
   * Format: PREFIX-YYYY-NNN  e.g. SV-2026-001
   * Prefixes: SV (Site Visit), SRV (Survey), INS (Inspection)
   */
  nextRefNumber(prefix: string): string {
    const year = new Date().getFullYear()
    const run = db.transaction((): number => {
      const existing = db.prepare("SELECT seq FROM RefSequence WHERE prefix = ? AND year = ?").get(prefix, year) as { seq: number } | undefined
      if (existing) {
        const next = existing.seq + 1
        db.prepare("UPDATE RefSequence SET seq = ? WHERE prefix = ? AND year = ?").run(next, prefix, year)
        return next
      } else {
        db.prepare("INSERT INTO RefSequence (id,prefix,year,seq) VALUES (?,?,?,1)").run(nanoid(), prefix, year)
        return 1
      }
    })
    const seq = run()
    return `${prefix}-${year}-${String(seq).padStart(3, "0")}`
  },

  currentSequence(yearMonth: string): number {
    const row = db.prepare("SELECT sequence FROM DrawingSequence WHERE yearMonth = ?").get(yearMonth) as { sequence: number } | undefined
    return row?.sequence ?? 0
  },

  /** Seed (or bump up) the drawing sequence for a year-month from an external source (e.g. Supabase). */
  seedSequence(yearMonth: string, value: number): void {
    const existing = db.prepare("SELECT sequence FROM DrawingSequence WHERE yearMonth = ?").get(yearMonth) as { sequence: number } | undefined
    if (!existing) {
      db.prepare("INSERT INTO DrawingSequence (id,yearMonth,sequence) VALUES (?,?,?)").run(nanoid(), yearMonth, value)
    } else if (existing.sequence < value) {
      db.prepare("UPDATE DrawingSequence SET sequence = ? WHERE yearMonth = ?").run(value, yearMonth)
    }
  },

  /** Seed (or bump up) the ref sequence for a prefix/year from an external source (e.g. Supabase). */
  seedRefSequence(prefix: string, year: number, value: number): void {
    const existing = db.prepare("SELECT seq FROM RefSequence WHERE prefix = ? AND year = ?").get(prefix, year) as { seq: number } | undefined
    if (!existing) {
      db.prepare("INSERT INTO RefSequence (id,prefix,year,seq) VALUES (?,?,?,?)").run(nanoid(), prefix, year, value)
    } else if (existing.seq < value) {
      db.prepare("UPDATE RefSequence SET seq = ? WHERE prefix = ? AND year = ?").run(value, prefix, year)
    }
  },

  /**
   * Scans every Job.drawingNumber in the database, extracts the YYMM key
   * and sequence number from each, and ensures the DrawingSequence counter
   * for that YYMM is at least as high as the highest number found. This
   * prevents duplicate drawing numbers after:
   *   - a database restore from backup
   *   - manual SQL inserts or data migration from an older system
   *   - a bulk spreadsheet import (called as a safety net after every import)
   *
   * Also reconciles RefSequence counters (SV/SRV/INS prefixes) the same way.
   *
   * Atomic: runs inside a single SQLite transaction. Idempotent: safe to
   * call repeatedly — it only ever raises counters, never lowers them.
   */
  syncFromExistingJobs(): { drawingFixups: number; refFixups: number } {
    let drawingFixups = 0
    let refFixups = 0

    db.transaction(() => {
      // ── Drawing numbers (YY/ORYX/MM/NNN) ──────────────────────
      const drawingRows = db.prepare(
        "SELECT drawingNumber FROM Job WHERE drawingNumber LIKE '%/ORYX/%'"
      ).all() as { drawingNumber: string }[]

      const maxByYearMonth = new Map<string, number>()
      for (const row of drawingRows) {
        const match = row.drawingNumber.match(/^(\d{2})\/ORYX\/(\d{2})\/(\d+)/)
        if (!match) continue
        const [, yy, mm, nnn] = match
        const key = `${yy}${mm}`
        const seq = parseInt(nnn, 10)
        const prev = maxByYearMonth.get(key) ?? 0
        if (seq > prev) maxByYearMonth.set(key, seq)
      }

      for (const [yearMonth, maxSeq] of maxByYearMonth) {
        const existing = db.prepare(
          "SELECT sequence FROM DrawingSequence WHERE yearMonth = ?"
        ).get(yearMonth) as { sequence: number } | undefined

        if (!existing) {
          db.prepare(
            "INSERT INTO DrawingSequence (id, yearMonth, sequence) VALUES (?, ?, ?)"
          ).run(nanoid(), yearMonth, maxSeq)
          drawingFixups++
        } else if (existing.sequence < maxSeq) {
          db.prepare(
            "UPDATE DrawingSequence SET sequence = ? WHERE yearMonth = ?"
          ).run(maxSeq, yearMonth)
          drawingFixups++
        }
      }

      // ── Reference numbers (PREFIX-YYYY-NNN) ───────────────────
      const refRows = db.prepare(
        "SELECT drawingNumber FROM Job WHERE drawingNumber LIKE '%-%-%'"
      ).all() as { drawingNumber: string }[]

      const maxByPrefixYear = new Map<string, number>()
      for (const row of refRows) {
        const match = row.drawingNumber.match(/^([A-Z]+)-(\d{4})-(\d+)$/)
        if (!match) continue
        const [, prefix, yearStr, nnn] = match
        const mapKey = `${prefix}||${yearStr}`
        const seq = parseInt(nnn, 10)
        const prev = maxByPrefixYear.get(mapKey) ?? 0
        if (seq > prev) maxByPrefixYear.set(mapKey, seq)
      }

      for (const [mapKey, maxSeq] of maxByPrefixYear) {
        const [prefix, yearStr] = mapKey.split("||")
        const year = parseInt(yearStr, 10)
        const existing = db.prepare(
          "SELECT seq FROM RefSequence WHERE prefix = ? AND year = ?"
        ).get(prefix, year) as { seq: number } | undefined

        if (!existing) {
          db.prepare(
            "INSERT INTO RefSequence (id, prefix, year, seq) VALUES (?, ?, ?, ?)"
          ).run(nanoid(), prefix, year, maxSeq)
          refFixups++
        } else if (existing.seq < maxSeq) {
          db.prepare(
            "UPDATE RefSequence SET seq = ? WHERE prefix = ? AND year = ?"
          ).run(maxSeq, prefix, year)
          refFixups++
        }
      }
    })()

    return { drawingFixups, refFixups }
  },
}

// Ensure drawing-number and reference-number sequence counters are at least
// as high as the highest values actually present in the Job table. Protects
// against duplicate numbers after a database restore, manual SQL inserts, or
// data migration from another system. Harmless no-op when already in sync.
// Skipped when the DB is brand-new (tables not yet created) or during the
// Next.js production build phase where no database is available.
if (DB_EXISTED) {
  try {
    const { drawingFixups, refFixups } = sequenceDb.syncFromExistingJobs()
    if (drawingFixups || refFixups) {
      console.log(`[syncDrawingSequences] Reconciled ${drawingFixups} drawing sequence(s) and ${refFixups} reference sequence(s) to match existing Job data.`)
    }
  } catch {
    // Silently skip if tables aren't ready yet (e.g. mid-migration or build time)
  }
}
