/**
 * Pure table-row geometry for the quotation PDF.
 * Kept free of pdf-lib so unit tests can cover multi-line sizing without fonts.
 */

/** Cap-height / em — matches generate.ts Inter approximation. */
export const PDF_CAP = 0.72
/** Descender depth / em — matches generate.ts Inter approximation. */
export const PDF_DSC = 0.21

export const capH = (size: number) => Math.round(size * PDF_CAP)
export const dscH = (size: number) => Math.round(size * PDF_DSC)

export interface TableRowMetricsInput {
  /** Number of wrapped description lines (≥ 1; empty rows use 1). */
  lineCount: number
  fontSize: number
  /** Distance between successive baselines. */
  lineStep: number
  /** Minimum row height (one-line template rows). */
  minRowHeight: number
  /** Vertical padding above first glyph and below last descender. */
  cellPadY: number
}

/**
 * Content-driven row height: expands with wrapped description lines.
 * Never uses a fixed height for multi-line content.
 */
export function measureTableRowHeight(input: TableRowMetricsInput): number {
  const n = Math.max(1, Math.floor(input.lineCount))
  const textBlockH =
    capH(input.fontSize) +
    (n - 1) * input.lineStep +
    dscH(input.fontSize)
  return Math.max(input.minRowHeight, textBlockH + input.cellPadY * 2)
}

/**
 * Baseline Y of the first description line within a row whose top is `rowTop`.
 *
 * - One-line rows: vertically centred (preserves existing quotation look).
 * - Multi-line rows: top-aligned with cellPadY above the first glyph cap.
 *
 * Purchase Order / VAT / Amount should use this same baseline.
 */
export function firstLineBaselineY(
  rowTop: number,
  rowHeight: number,
  input: Pick<TableRowMetricsInput, "lineCount" | "fontSize" | "cellPadY">,
): number {
  const n = Math.max(1, Math.floor(input.lineCount))
  const ch = capH(input.fontSize)
  if (n <= 1) {
    // Preserve existing single-line centering used by standard quotations.
    return rowTop - Math.round((rowHeight - ch) / 2)
  }
  // Top-align: pad above glyph top, then drop to baseline.
  return rowTop - input.cellPadY - ch
}

/**
 * Wrap text to `maxWidth`. Breaks overlong tokens so nothing overflows
 * neighbouring columns. Never truncates/clips content.
 */
export function wrapTextToWidth(
  text: string,
  measure: (s: string) => number,
  maxWidth: number,
): string[] {
  const lines: string[] = []
  for (const paragraph of text.split(/\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (!words.length) {
      lines.push("")
      continue
    }
    let current = ""
    for (const word of words) {
      const pieces = breakTokenToWidth(word, measure, maxWidth)
      for (const piece of pieces) {
        const trial = current ? `${current} ${piece}` : piece
        if (current && measure(trial) > maxWidth) {
          lines.push(current)
          current = piece
        } else {
          current = trial
        }
      }
    }
    if (current) lines.push(current)
  }
  return lines.length ? lines : [""]
}

/** Split a single token that is wider than maxWidth into fitting chunks. */
export function breakTokenToWidth(
  token: string,
  measure: (s: string) => number,
  maxWidth: number,
): string[] {
  if (measure(token) <= maxWidth) return [token]
  const parts: string[] = []
  let rest = token
  while (rest.length > 0) {
    if (measure(rest) <= maxWidth) {
      parts.push(rest)
      break
    }
    let lo = 1
    let hi = rest.length
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2)
      if (measure(rest.slice(0, mid)) <= maxWidth) lo = mid
      else hi = mid - 1
    }
    const take = Math.max(1, lo)
    parts.push(rest.slice(0, take))
    rest = rest.slice(take)
  }
  return parts
}
