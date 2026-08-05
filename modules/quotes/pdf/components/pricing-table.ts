import type { QuotePdfLineItem } from "../types"
import { fmtMoney } from "../format"
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
  const poW = CONTENT_WIDTH * TABLE.colPo
  const vatW = CONTENT_WIDTH * TABLE.colVat
  const amountW = CONTENT_WIDTH * TABLE.colAmount

  let x = CONTENT_LEFT
  const cols: ColumnSpec[] = [
    { label: "Description", x, width: descW, align: "left" },
    { label: "Purchase Order", x: (x += descW), width: poW, align: "left" },
    { label: "VAT", x: (x += poW), width: vatW, align: "right" },
    { label: "Amount", x: (x += vatW), width: amountW, align: "right" },
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

  if (item.purchaseOrder) {
    const poCol = cols[1]!
    ctx.drawText(item.purchaseOrder, poCol.x + TABLE.rowPadX, textTop, {
      size: TYPE.table,
      align: "left",
    })
  }

  if (showVatAmounts && item.vatAmount != null) {
    const vatCol = cols[2]!
    ctx.drawText(fmtMoney(item.vatAmount), vatCol.x + vatCol.width - TABLE.rowPadX, textTop, {
      size: TYPE.table,
      align: "right",
    })
  }

  if (item.amount != null) {
    const amountCol = cols[3]!
    ctx.drawText(fmtMoney(item.amount), amountCol.x + amountCol.width - TABLE.rowPadX, textTop, {
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
  ctx.drawText("Quotation Items", CONTENT_LEFT, ctx.cursorY, {
    size: TYPE.section,
    bold: true,
    color: COLOR.ink,
  })
  let headingY = ctx.cursorY - descender(TYPE.section) - SP.sm
  ctx.drawRule(headingY)
  headingY -= SP.lg
  const tableTopForHeight = headingY
  let rowTop = drawTableHeaderRow(ctx, headingY)
  let paginationOccurred = false
  const commercialRowCount = items.filter(i => i.amount != null).length
  const narrativeRowCount = items.length - commercialRowCount

  // Data-driven density: if there are multiple line items, aim for the table
  // (including header) to occupy ~40–50% of the remaining page.
  const usableHeight = ctx.cursorY - MIN_CONTENT_Y
  const targetFraction = commercialRowCount >= 2 ? 0.45 : 0.30
  const targetTableHeight = usableHeight * targetFraction

  for (const item of items) {
    const rowH = rowHeight(ctx, item, descColW)

    if (rowTop - rowH < MIN_CONTENT_Y) {
      ctx.addPage()
      paginationOccurred = true
      if (continuationLabel) {
        ctx.drawText(continuationLabel, CONTENT_LEFT, ctx.cursorY, {
          size: TYPE.metaLabel,
          color: COLOR.faint,
        })
        ctx.cursorY -= SP.lg
      }
      rowTop = drawTableHeaderRow(ctx, ctx.cursorY)
    }

    drawDataRow(ctx, item, rowTop, rowH, showVatAmounts)
    rowTop -= rowH
  }

  // If the table stayed on a single page, add subtle filler rows so the table
  // becomes the visual centrepiece (template-inspired density).
  if (!paginationOccurred && commercialRowCount >= 2 && narrativeRowCount === 0) {
    let usedHeight = tableTopForHeight - rowTop
    while (usedHeight < targetTableHeight && rowTop - TABLE.minRowHeight >= MIN_CONTENT_Y) {
      const emptyH = TABLE.minRowHeight
      const bottom = rowTop - emptyH
      ctx.page.drawLine({
        start: { x: CONTENT_LEFT, y: bottom },
        end: { x: CONTENT_RIGHT, y: bottom },
        thickness: 0.4,
        color: COLOR.rule,
      })
      rowTop = bottom
      usedHeight = tableTopForHeight - rowTop
    }
  }

  // Reduce trailing whitespace so short quotations can keep Terms on the same page.
  ctx.cursorY = rowTop - SP.sm
  return { endY: ctx.cursorY }
}
