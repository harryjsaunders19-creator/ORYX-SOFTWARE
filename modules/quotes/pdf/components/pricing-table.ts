import type { QuotePdfLineItem } from "../types"
import { fmtMoney, fmtQuantity } from "../format"
import {
  COLOR,
  CONTENT_LEFT,
  CONTENT_RIGHT,
  CONTENT_WIDTH,
  MIN_CONTENT_Y,
  SP,
  TABLE,
  TYPE,
  capHeight,
  descender,
  lineStep,
} from "../layout"
import type { QuotePdfContext } from "../context"

interface ColumnSpec {
  label: string
  x: number
  width: number
  align: "left" | "right"
}

function tableColumns(): ColumnSpec[] {
  const descW = CONTENT_WIDTH * TABLE.colDesc
  const qtyW = CONTENT_WIDTH * TABLE.colQty
  const rateW = CONTENT_WIDTH * TABLE.colRate
  const vatW = CONTENT_WIDTH * TABLE.colVat
  const totalW = CONTENT_WIDTH * TABLE.colTotal

  let x = CONTENT_LEFT
  const cols: ColumnSpec[] = [
    { label: "Description", x, width: descW, align: "left" },
    { label: "Quantity", x: (x += descW), width: qtyW, align: "right" },
    { label: "Unit Rate", x: (x += qtyW), width: rateW, align: "right" },
    { label: "VAT", x: (x += rateW), width: vatW, align: "right" },
    { label: "Line Total", x: (x += vatW), width: totalW, align: "right" },
  ]
  return cols
}

function drawTableHeaderRow(ctx: QuotePdfContext, topY: number): number {
  const cols = tableColumns()
  const bandBottom = topY - TABLE.headerHeight

  // Soft, print-friendly header band.
  ctx.page.drawRectangle({
    x: CONTENT_LEFT,
    y: bandBottom,
    width: CONTENT_WIDTH,
    height: TABLE.headerHeight,
    color: COLOR.white,
  })
  ctx.drawRule(bandBottom, CONTENT_LEFT, CONTENT_RIGHT, COLOR.rule)

  const baseline = topY - TABLE.headerHeight + Math.round((TABLE.headerHeight - capHeight(TYPE.tableHead)) / 2)
  for (const col of cols) {
    const textX = col.align === "right" ? col.x + col.width - TABLE.rowPadX : col.x + TABLE.rowPadX
    ctx.drawText(col.label.toUpperCase(), textX, baseline, {
      size: TYPE.tableHead,
      bold: true,
      color: COLOR.muted,
      align: col.align,
    })
  }

  return bandBottom
}

function rowHeight(ctx: QuotePdfContext, item: QuotePdfLineItem, descColW: number): number {
  const lines = ctx.wrapText(item.description, TYPE.table, descColW)
  const textH = lines.length * lineStep(TYPE.table)
  return Math.max(TABLE.minRowHeight, textH + TABLE.rowPadY * 2)
}

function drawDataRow(
  ctx: QuotePdfContext,
  item: QuotePdfLineItem,
  topY: number,
  rowH: number,
  showVatAmounts: boolean,
  alt: boolean,
): void {
  const cols = tableColumns()
  const descCol = cols[0]!
  const bottom = topY - rowH

  // No banding: avoids an "export to spreadsheet" aesthetic.

  const textTop = topY - TABLE.rowPadY
  let lineY = textTop
  for (const line of ctx.wrapText(item.description, TYPE.table, descCol.width - TABLE.rowPadX * 2)) {
    ctx.drawText(line, descCol.x + TABLE.rowPadX, lineY, { size: TYPE.table })
    lineY -= lineStep(TYPE.table)
  }

  const values: { col: ColumnSpec; text: string }[] = [
    { col: cols[1]!, text: fmtQuantity(item.quantity) },
    { col: cols[2]!, text: fmtMoney(item.unitRate) },
    {
      col: cols[3]!,
      text:
        showVatAmounts && item.vatAmount != null ? fmtMoney(item.vatAmount) : "",
    },
    { col: cols[4]!, text: fmtMoney(item.lineTotal) },
  ]

  for (const { col, text } of values) {
    if (!text) continue
    ctx.drawText(text, col.x + col.width - TABLE.rowPadX, textTop, {
      size: TYPE.table,
      align: "right",
    })
  }

  ctx.page.drawLine({
    start: { x: CONTENT_LEFT, y: bottom },
    end: { x: CONTENT_RIGHT, y: bottom },
    thickness: 0.4,
    color: COLOR.rule,
  })
}

export interface PricingTableResult {
  endY: number
}

/** Professional pricing table with repeating headers across pages. */
export function drawPricingTable(
  ctx: QuotePdfContext,
  items: QuotePdfLineItem[],
  showVatAmounts: boolean,
  continuationLabel?: string,
): PricingTableResult {
  if (!items.length) {
    return { endY: ctx.cursorY }
  }

  const cols = tableColumns()
  const descColW = cols[0]!.width - TABLE.rowPadX * 2

  const headingH = lineStep(TYPE.section) + SP.sm + 10
  // Keep a modest headroom buffer; table pagination already handles the rest.
  ctx.ensureSpace(headingH + TABLE.headerHeight + TABLE.minRowHeight)
  ctx.drawText("Commercial Breakdown", CONTENT_LEFT, ctx.cursorY, {
    size: TYPE.section,
    bold: true,
    color: COLOR.ink,
  })
  let headingY = ctx.cursorY - descender(TYPE.section) - SP.sm
  ctx.drawRule(headingY)
  headingY -= SP.lg
  let rowTop = drawTableHeaderRow(ctx, headingY)
  let bandIndex = 0

  for (const item of items) {
    const rowH = rowHeight(ctx, item, descColW)

    if (rowTop - rowH < MIN_CONTENT_Y) {
      ctx.addPage()
      if (continuationLabel) {
        ctx.drawText(continuationLabel, CONTENT_LEFT, ctx.cursorY, {
          size: TYPE.metaLabel,
          color: COLOR.faint,
        })
        ctx.cursorY -= SP.lg
      }
      rowTop = drawTableHeaderRow(ctx, ctx.cursorY)
      bandIndex = 0
    }

    drawDataRow(ctx, item, rowTop, rowH, showVatAmounts, bandIndex % 2 === 1)
    rowTop -= rowH
    bandIndex++
  }

  ctx.cursorY = rowTop - SP.lg
  return { endY: ctx.cursorY }
}
