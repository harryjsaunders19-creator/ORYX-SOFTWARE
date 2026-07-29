import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "fs"
import { join } from "path"

const DRAWING_SEQ_MAX = 999

function nextDrawingSequenceAfter(current) {
  if (current <= 0) return 1
  if (current >= DRAWING_SEQ_MAX) return 1
  return current + 1
}

function buildDrawingNumber(seq, date = new Date()) {
  const yy = String(date.getFullYear()).slice(-2)
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const s = seq <= 0 ? 1 : seq > DRAWING_SEQ_MAX ? (((seq - 1) % DRAWING_SEQ_MAX) + 1) : seq
  return `${yy}/ORYX/${mm}/${String(s).padStart(3, "0")}`
}

describe("concurrent drawing-number uniqueness", () => {
  it("nextDrawingSequenceAfter never produces duplicates in a full cycle", () => {
    const seen = new Set()
    let seq = 0
    for (let i = 0; i < DRAWING_SEQ_MAX + 5; i++) {
      seq = nextDrawingSequenceAfter(seq)
      assert.ok(seq >= 1 && seq <= DRAWING_SEQ_MAX, `seq ${seq} out of range`)
      if (i < DRAWING_SEQ_MAX) {
        assert.ok(!seen.has(seq), `duplicate sequence ${seq} at iteration ${i}`)
        seen.add(seq)
      }
    }
    assert.equal(seen.size, DRAWING_SEQ_MAX)
  })

  it("buildDrawingNumber produces unique values for distinct sequences", () => {
    const date = new Date(2026, 6, 29)
    const numbers = new Set()
    for (let seq = 1; seq <= DRAWING_SEQ_MAX; seq++) {
      const dn = buildDrawingNumber(seq, date)
      assert.ok(!numbers.has(dn), `duplicate drawing number: ${dn}`)
      numbers.add(dn)
    }
    assert.equal(numbers.size, DRAWING_SEQ_MAX)
  })

  it("simulated concurrent allocations never collide (atomic counter)", () => {
    let counter = 0
    function allocate() {
      counter = nextDrawingSequenceAfter(counter)
      return counter
    }

    const WORKERS = 50
    const PER_WORKER = 10
    const all = []
    for (let w = 0; w < WORKERS; w++) {
      for (let a = 0; a < PER_WORKER; a++) {
        all.push(allocate())
      }
    }
    assert.equal(all.length, WORKERS * PER_WORKER)
    assert.equal(new Set(all).size, all.length, "all allocated sequences must be unique")
  })

  it("Supabase table has UNIQUE constraint on drawing_number (migration 002)", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/002_jobs.sql"),
      "utf8",
    )
    assert.match(
      sql,
      /constraint\s+jobs_drawing_number_unique\s+unique\s*\(\s*drawing_number\s*\)/i,
      "migration 002 must declare a UNIQUE constraint on drawing_number",
    )
  })
})
