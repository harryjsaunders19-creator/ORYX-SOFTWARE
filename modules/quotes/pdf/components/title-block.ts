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

  ctx.drawText("Quotation", leftX, topY, {
    size: TYPE.docTitle,
    color: COLOR.muted,
  })

  const quoteBaseline = topY - capHeight(TYPE.docTitle) - SP.sm
  ctx.drawText(meta.quoteNumber, leftX, quoteBaseline, {
    size: TYPE.quoteNumber,
    bold: true,
  })

  let metaY = quoteBaseline - descender(TYPE.quoteNumber) - SP.lg
  const labelX = rightX - 150
  for (const row of META_ROWS) {
    const value = meta[row.key]
    if (!value) continue
    ctx.drawText(row.label, labelX, metaY, {
      size: TYPE.metaLabel,
      color: COLOR.faint,
      align: "right",
    })
    ctx.drawText(String(value), rightX, metaY, {
      size: TYPE.metaValue,
      align: "right",
    })
    metaY -= lineStep(TYPE.metaValue, 1.45)
  }

  const leftEnd = quoteBaseline - descender(TYPE.quoteNumber)
  const rightEnd = metaY + lineStep(TYPE.metaValue, 1.45) - descender(TYPE.metaValue)
  const endY = Math.min(leftEnd, rightEnd) - SP.lg

  ctx.drawRule(endY)
  return endY - SP.lg
}
