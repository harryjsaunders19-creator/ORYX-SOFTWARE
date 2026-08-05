import type { QuotePdfTotals } from "../types"
import { fmtMoney } from "../format"
import {
  COLOR,
  CONTENT_RIGHT,
  SP,
  TYPE,
  capHeight,
  descender,
  lineStep,
} from "../layout"
import type { QuotePdfContext } from "../context"

const BOX_WIDTH = 220

/** Totals summary box anchored to the bottom-right at `anchorY`. */
export function measureTotalsBoxHeight(totals: QuotePdfTotals): number {
  const topPad = SP.sm
  const normalStep = lineStep(TYPE.totalValue) + SP.sm
  const grandStep = lineStep(TYPE.grandTotal) + SP.sm
  const normalRows = totals.showVat ? 2 : 1 // Subtotal (+ VAT)
  // Draw: top pad + (subtotal + vat?) + rule gap + grand total + bottom pad
  return topPad + normalRows * normalStep + SP.sm + grandStep
}

/** Totals summary box anchored to the bottom-right. */
export function drawTotalsSummary(
  ctx: QuotePdfContext,
  totals: QuotePdfTotals,
  anchorY: number,
): number {
  const labelSize = TYPE.totalLabel
  const valueSize = TYPE.totalValue
  const grandSize = TYPE.grandTotal

  const topPad = SP.sm
  const normalStep = lineStep(TYPE.totalValue) + SP.sm
  const grandStep = lineStep(TYPE.grandTotal) + SP.sm

  const boxRight = CONTENT_RIGHT
  const boxLeft = boxRight - BOX_WIDTH

  let y = anchorY - topPad
  const labelX = boxLeft
  const valueX = boxRight

  ctx.drawText("Subtotal", labelX, y, { size: labelSize, color: COLOR.muted })
  ctx.drawText(fmtMoney(totals.subtotal), valueX, y, { size: valueSize, align: "right" })
  y -= normalStep

  if (totals.showVat && totals.vat != null) {
    ctx.drawText("VAT", labelX, y, { size: labelSize, color: COLOR.muted })
    ctx.drawText(fmtMoney(totals.vat), valueX, y, { size: valueSize, align: "right" })
    y -= normalStep
  }

  // Divider between VAT and Grand Total
  const ruleY = y + SP.xs
  ctx.page.drawLine({
    start: { x: labelX, y: ruleY },
    end: { x: valueX, y: ruleY },
    thickness: 0.45,
    color: COLOR.rule,
  })

  y = ruleY - SP.sm
  ctx.drawText("Grand Total", labelX, y, { size: labelSize, color: COLOR.muted })
  ctx.drawText(fmtMoney(totals.grandTotal), valueX, y, {
    size: grandSize,
    bold: true,
    align: "right",
  })

  // Keep a modest gap below totals so Terms can remain on the same page when possible.
  return y - SP.sm
}
