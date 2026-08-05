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
  const rows = totals.showVat ? 3 : 2
  return SP.md * 2 + rows * (lineStep(TYPE.totalLabel) + SP.md) + TYPE.grandTotal + SP.lg
}

/** Totals summary box anchored to the bottom-right. */
export function drawTotalsSummary(
  ctx: QuotePdfContext,
  totals: QuotePdfTotals,
  anchorY: number,
): number {
  const rows: { label: string; value: string; grand?: boolean }[] = [
    { label: "Subtotal", value: fmtMoney(totals.subtotal) },
  ]
  if (totals.showVat && totals.vat != null) {
    rows.push({ label: "VAT", value: fmtMoney(totals.vat) })
  }
  rows.push({
    label: "Grand Total",
    value: fmtMoney(totals.grandTotal),
    grand: true,
  })

  const labelSize = TYPE.totalLabel
  const valueSize = TYPE.totalValue
  const grandSize = TYPE.grandTotal
  const rowGap = SP.md
  const innerPad = SP.md
  const grandPadTop = SP.sm

  let boxH = innerPad * 2
  for (const row of rows) {
    boxH += row.grand
      ? grandPadTop + capHeight(grandSize) + descender(grandSize) + SP.sm
      : lineStep(labelSize)
    boxH += rowGap
  }
  boxH -= rowGap

  const boxRight = CONTENT_RIGHT
  const boxLeft = boxRight - BOX_WIDTH
  const boxTop = anchorY
  const boxBottom = boxTop - boxH

  ctx.page.drawRectangle({
    x: boxLeft,
    y: boxBottom,
    width: BOX_WIDTH,
    height: boxH,
    color: COLOR.totalsBg,
    borderColor: COLOR.panelBorder,
    borderWidth: 0.5,
  })

  let y = boxTop - innerPad
  const labelX = boxLeft + innerPad
  const valueX = boxRight - innerPad

  for (const row of rows) {
    if (row.grand) {
      y -= grandPadTop
      ctx.drawText(row.label, labelX, y, {
        size: labelSize,
        color: COLOR.muted,
      })
      ctx.drawText(row.value, valueX, y, {
        size: grandSize,
        bold: true,
        align: "right",
      })
      y -= descender(grandSize) + SP.sm
      continue
    }

    ctx.drawText(row.label, labelX, y, {
      size: labelSize,
      color: COLOR.muted,
    })
    ctx.drawText(row.value, valueX, y, {
      size: valueSize,
      align: "right",
    })
    y -= lineStep(labelSize) + rowGap
  }

  return Math.min(boxBottom, anchorY) - SP.lg
}
