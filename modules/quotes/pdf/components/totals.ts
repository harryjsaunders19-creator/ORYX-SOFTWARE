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

const BOX_WIDTH = 240

/** Totals summary box anchored to the bottom-right at `anchorY`. */
export function measureTotalsBoxHeight(totals: QuotePdfTotals): number {
  const innerPad = SP.lg
  const rowGap = SP.md
  const normalStep = lineStep(TYPE.totalValue) + rowGap
  const sep = SP.lg
  const grandStep = lineStep(TYPE.grandTotal) + SP.md

  const normalRows = totals.showVat ? 2 : 1 // Subtotal (+ VAT)
  return innerPad * 2 + normalRows * normalStep + sep + grandStep
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

  const innerPad = SP.lg
  const rowGap = SP.md
  const normalStep = lineStep(TYPE.totalValue) + rowGap
  const sepGap = SP.lg
  const grandStep = lineStep(TYPE.grandTotal) + SP.md

  const boxH =
    innerPad * 2 +
    (totals.showVat ? 2 : 1) * normalStep +
    sepGap +
    grandStep

  const boxRight = CONTENT_RIGHT
  const boxLeft = boxRight - BOX_WIDTH
  const boxTop = anchorY
  const boxBottom = boxTop - boxH

  ctx.page.drawRectangle({
    x: boxLeft,
    y: boxBottom,
    width: BOX_WIDTH,
    height: boxH,
    color: COLOR.white,
    borderColor: COLOR.panelBorder,
    borderWidth: 0.65,
  })

  let y = boxTop - innerPad
  const labelX = boxLeft + innerPad
  const valueX = boxRight - innerPad

  ctx.drawText("Subtotal", labelX, y, { size: labelSize, color: COLOR.muted })
  ctx.drawText(fmtMoney(totals.subtotal), valueX, y, { size: valueSize, align: "right" })
  y -= normalStep

  if (totals.showVat && totals.vat != null) {
    ctx.drawText("VAT", labelX, y + rowGap / 2, { size: labelSize, color: COLOR.muted })
    ctx.drawText(fmtMoney(totals.vat), valueX, y + rowGap / 2, { size: valueSize, align: "right" })
    y -= normalStep
  }

  const sepY = y + rowGap / 2 - SP.sm
  ctx.page.drawLine({
    start: { x: labelX, y: sepY },
    end: { x: valueX, y: sepY },
    thickness: 0.45,
    color: COLOR.rule,
  })

  y = sepY - SP.sm
  ctx.drawText("Grand Total", labelX, y, { size: labelSize, color: COLOR.muted })
  ctx.drawText(fmtMoney(totals.grandTotal), valueX, y, {
    size: grandSize,
    bold: true,
    align: "right",
  })

  return Math.min(boxBottom, anchorY) - SP.lg
}
