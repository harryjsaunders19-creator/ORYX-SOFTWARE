import type { QuotePdfDocumentMeta } from "../types"
import {
  COLOR,
  CONTENT_LEFT,
  CONTENT_RIGHT,
  SP,
  TYPE,
  capHeight,
  descender,
  lineStep,
} from "../layout"
import type { QuotePdfContext } from "../context"

const META_ROWS: { key: keyof QuotePdfDocumentMeta; label: string; prominent?: boolean }[] = [
  { key: "issueDate", label: "Issue Date" },
  { key: "validUntil", label: "Valid Until" },
  { key: "preparedBy", label: "Prepared By" },
]

/** Structured title block beneath the letterhead. */
export function drawQuoteTitleBlock(
  ctx: QuotePdfContext,
  meta: QuotePdfDocumentMeta,
): number {
  const topY = ctx.cursorY
  const leftX = CONTENT_LEFT
  const rightX = CONTENT_RIGHT

  // Strong title focus (letterhead -> QUOTATION -> prominent quote number)
  ctx.drawText("QUOTATION", leftX, topY, {
    size: TYPE.docTitle,
    bold: true,
    color: COLOR.muted,
  })

  const quoteY = topY - capHeight(TYPE.docTitle) - SP.sm
  ctx.drawText(meta.quoteNumber, leftX, quoteY, {
    size: TYPE.quoteNumber,
    bold: true,
    color: COLOR.ink,
  })

  const metaStartY = quoteY - descender(TYPE.quoteNumber) - SP.lg
  const labelX = rightX - 168
  let metaY = metaStartY
  for (const row of META_ROWS) {
    const value = meta[row.key]
    if (!value) continue
    ctx.drawText(row.label.toUpperCase(), labelX, metaY, {
      size: TYPE.metaLabel,
      color: COLOR.faint,
      align: "right",
      bold: true,
    })
    ctx.drawText(String(value), rightX, metaY, {
      size: TYPE.metaValue,
      align: "right",
      bold: true,
    })
    metaY -= lineStep(TYPE.metaValue)
  }

  const leftEnd = quoteY - descender(TYPE.quoteNumber)
  const rightEnd =
    metaY +
    (META_ROWS.some(r => meta[r.key]) ? lineStep(TYPE.metaValue) : 0) -
    descender(TYPE.metaValue)

  const endY = Math.min(leftEnd, rightEnd) - SP.lg
  ctx.drawRule(endY)
  return endY - SP.xl
}
