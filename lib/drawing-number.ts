/**
 * Drawing numbers: YY/ORYX/MM/NNN
 * MM = creation month; NNN = global sequence (no monthly reset).
 */

/** SQLite DrawingSequence row key — one global counter, not per month. */
export const DRAWING_SEQUENCE_KEY = "GLOBAL"

/** Three-digit sequence rolls back to 001 after 999. */
export const DRAWING_SEQ_MAX = 999

const ORYX_DRAWING_RE = /^(\d{2})\/ORYX\/(\d{2})\/(\d+)$/

/** Parse the numeric suffix from a drawing number, or null if not ORYX format. */
export function parseOryxDrawingSequence(drawingNumber: string): number | null {
  const match = drawingNumber.trim().match(ORYX_DRAWING_RE)
  if (!match) return null
  const seq = parseInt(match[3], 10)
  return Number.isFinite(seq) ? seq : null
}

/** Next sequence after `current` — rolls 999 → 001. */
export function nextDrawingSequenceAfter(current: number): number {
  if (current <= 0) return 1
  if (current >= DRAWING_SEQ_MAX) return 1
  return current + 1
}

function normalizeSequence(seq: number): number {
  if (seq <= 0) return 1
  if (seq > DRAWING_SEQ_MAX) return ((seq - 1) % DRAWING_SEQ_MAX) + 1
  return seq
}

export function formatDrawingNumber(year: number, month: number, seq: number) {
  const yy = String(year).slice(-2)
  const mm = String(month).padStart(2, "0")
  const nnn = String(normalizeSequence(seq)).padStart(3, "0")
  return `${yy}/ORYX/${mm}/${nnn}`
}

export function getYearMonthKey(date = new Date()) {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const key = `${String(year).slice(-2)}${String(month).padStart(2, "0")}`
  return { year, month, key }
}

/** Build a drawing number for a given sequence value and date (YY/MM from date). */
export function buildDrawingNumber(seq: number, date = new Date()): string {
  const { year, month } = getYearMonthKey(date)
  return formatDrawingNumber(year, month, seq)
}
