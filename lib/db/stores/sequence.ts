/** DrawingSequence and RefSequence counters. */
import { db, DB_EXISTED } from "../connection"
import { createId as nanoid } from "@paralleldrive/cuid2"
import {
  DRAWING_SEQUENCE_KEY,
  buildDrawingNumber,
  nextDrawingSequenceAfter,
  parseOryxDrawingSequence,
} from "@/lib/drawing-number"

export const sequenceDb = {
  /**
   * @deprecated Use nextDrawingSequence() for ORYX drawing numbers.
   * Retained for non-drawing counters (e.g. health checks).
   */
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
   * Atomically increment the global ORYX drawing sequence (1–999, rolls to 1).
   * Does not reset monthly — YY/MM in the formatted number come from the job date only.
   */
  nextDrawingSequence(): number {
    const run = db.transaction(() => {
      const existing = db.prepare(
        "SELECT sequence FROM DrawingSequence WHERE yearMonth = ?",
      ).get(DRAWING_SEQUENCE_KEY) as { sequence: number } | undefined

      if (existing) {
        const next = nextDrawingSequenceAfter(existing.sequence)
        db.prepare(
          "UPDATE DrawingSequence SET sequence = ? WHERE yearMonth = ?",
        ).run(next, DRAWING_SEQUENCE_KEY)
        return next
      }

      db.prepare(
        "INSERT INTO DrawingSequence (id, yearMonth, sequence) VALUES (?, ?, 1)",
      ).run(nanoid(), DRAWING_SEQUENCE_KEY)
      return 1
    })
    return run() as number
  },

  currentDrawingSequence(): number {
    const row = db.prepare(
      "SELECT sequence FROM DrawingSequence WHERE yearMonth = ?",
    ).get(DRAWING_SEQUENCE_KEY) as { sequence: number } | undefined
    return row?.sequence ?? 0
  },

  /** Allocate the next YY/ORYX/MM/NNN drawing number (global sequence, atomic). */
  allocateDrawingNumber(date = new Date()): string {
    return buildDrawingNumber(this.nextDrawingSequence(), date)
  },

  /** Preview the next drawing number without consuming the sequence. */
  peekNextDrawingNumber(date = new Date()): string {
    return buildDrawingNumber(nextDrawingSequenceAfter(this.currentDrawingSequence()), date)
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

  /** @deprecated Use currentDrawingSequence() for ORYX drawing numbers. */
  currentSequence(yearMonth: string): number {
    const row = db.prepare("SELECT sequence FROM DrawingSequence WHERE yearMonth = ?").get(yearMonth) as { sequence: number } | undefined
    return row?.sequence ?? 0
  },

  /** Seed (or bump up) the global drawing sequence from an external source (e.g. Supabase). */
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
   * Scans every Job.drawingNumber in the database and ensures the global
   * DrawingSequence counter is at least as high as the highest ORYX suffix
   * found. Also reconciles RefSequence counters (SV/SRV/INS prefixes).
   *
   * Atomic: runs inside a single SQLite transaction. Idempotent: safe to
   * call repeatedly — it only ever raises counters, never lowers them.
   */
  syncFromExistingJobs(): { drawingFixups: number; refFixups: number } {
    let drawingFixups = 0
    let refFixups = 0

    db.transaction(() => {
      const drawingRows = db.prepare(
        "SELECT drawingNumber FROM Job WHERE drawingNumber LIKE '%/ORYX/%'",
      ).all() as { drawingNumber: string }[]

      let globalMax = 0
      for (const row of drawingRows) {
        const seq = parseOryxDrawingSequence(row.drawingNumber)
        if (seq !== null && seq > globalMax) globalMax = seq
      }

      if (globalMax > 0) {
        const existing = db.prepare(
          "SELECT sequence FROM DrawingSequence WHERE yearMonth = ?",
        ).get(DRAWING_SEQUENCE_KEY) as { sequence: number } | undefined

        if (!existing) {
          db.prepare(
            "INSERT INTO DrawingSequence (id, yearMonth, sequence) VALUES (?, ?, ?)",
          ).run(nanoid(), DRAWING_SEQUENCE_KEY, globalMax)
          drawingFixups++
        } else if (existing.sequence < globalMax) {
          db.prepare(
            "UPDATE DrawingSequence SET sequence = ? WHERE yearMonth = ?",
          ).run(globalMax, DRAWING_SEQUENCE_KEY)
          drawingFixups++
        }
      }

      const refRows = db.prepare(
        "SELECT drawingNumber FROM Job WHERE drawingNumber LIKE '%-%-%'",
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
          "SELECT seq FROM RefSequence WHERE prefix = ? AND year = ?",
        ).get(prefix, year) as { seq: number } | undefined

        if (!existing) {
          db.prepare(
            "INSERT INTO RefSequence (id, prefix, year, seq) VALUES (?, ?, ?, ?)",
          ).run(nanoid(), prefix, year, maxSeq)
          refFixups++
        } else if (existing.seq < maxSeq) {
          db.prepare(
            "UPDATE RefSequence SET seq = ? WHERE prefix = ? AND year = ?",
          ).run(maxSeq, prefix, year)
          refFixups++
        }
      }
    })()

    return { drawingFixups, refFixups }
  }
}

/** Central API — all job creation should use this for ORYX drawing numbers. */
export function allocateDrawingNumber(date = new Date()): string {
  return sequenceDb.allocateDrawingNumber(date)
}

export function peekNextDrawingNumber(date = new Date()): string {
  return sequenceDb.peekNextDrawingNumber(date)
}

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
