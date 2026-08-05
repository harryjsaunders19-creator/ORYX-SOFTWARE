import type { QuotePdfClientFields } from "../types"
import {
  COLOR,
  CONTENT_LEFT,
  CONTENT_WIDTH,
  SP,
  TYPE,
  capHeight,
  descender,
  lineStep,
} from "../layout"
import type { QuotePdfContext } from "../context"

type Row = { label: string; value: string }

function rowsFor(
  fields: QuotePdfClientFields,
  keys: Array<{ key: keyof QuotePdfClientFields; label: string }>,
): Row[] {
  return keys
    .map(k => ({ label: k.label, value: (fields[k.key] ?? "").trim() }))
    .filter(r => !!r.value)
}

/** Two balanced information panels for client + project (only render existing fields). */
export function drawClientInformation(
  ctx: QuotePdfContext,
  fields: QuotePdfClientFields,
): number {
  const leftRows = rowsFor(fields, [
    { key: "client", label: "Client" },
    { key: "contact", label: "Contact" },
    { key: "address", label: "Address" },
    { key: "reference", label: "Reference" },
  ])

  const rightRows = rowsFor(fields, [
    { key: "project", label: "Project" },
    { key: "site", label: "Site" },
  ])

  if (!leftRows.length && !rightRows.length) return ctx.cursorY

  const panelGap = SP.lg
  const both = leftRows.length && rightRows.length
  const panelW = both ? (CONTENT_WIDTH - panelGap) / 2 : CONTENT_WIDTH

  const leftX = CONTENT_LEFT
  const rightX = both ? CONTENT_LEFT + panelW + panelGap : CONTENT_LEFT

  const innerPad = SP.md
  const headingH = lineStep(TYPE.section) + SP.xs + 6

  // Client/Project cards provide context via their headings,
  // so values render without repeated field labels.
  const valueW = panelW - innerPad * 2

  const measurePanelH = (rows: Row[]): number => {
    const rowHeights = rows.map(r => Math.max(lineStep(TYPE.body), ctx.measureWrappedHeight(r.value, TYPE.body, valueW)))
    return (
      innerPad * 2 +
      headingH +
      rowHeights.reduce((sum, h) => sum + h, 0) +
      (rows.length - 1) * SP.sm
    )
  }

  const leftH = leftRows.length ? measurePanelH(leftRows) : 0
  const rightH = rightRows.length ? measurePanelH(rightRows) : 0
  const sectionH = Math.max(leftH, rightH)

  ctx.ensureSpace(sectionH + SP.lg)
  const topY = ctx.cursorY

  const drawPanelAtTop = (x: number, rows: Row[], heading: string, panelH: number) => {
    ctx.page.drawRectangle({
      x,
      y: topY - panelH,
      width: panelW,
      height: panelH,
      color: COLOR.white,
      borderColor: COLOR.panelBorder,
      borderWidth: 0.5,
    })

    const valueX = x + innerPad
    let y = topY - innerPad - capHeight(TYPE.section)

    ctx.drawText(heading.toUpperCase(), x + innerPad, y, {
      size: TYPE.section,
      bold: true,
      color: COLOR.muted,
    })
    y -= descender(TYPE.section) + SP.xs
    ctx.drawRule(y, x + innerPad, x + panelW - innerPad)
    y -= SP.xs

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!
      y = ctx.drawWrapped(row.value, valueX, y, valueW, {
        size: TYPE.body,
        step: lineStep(TYPE.body),
        bold: i === 0,
        color: COLOR.ink,
      })
      if (i < rows.length - 1) y -= SP.xs
    }
  }

  if (both) {
    drawPanelAtTop(leftX, leftRows, "Client", leftH)
    drawPanelAtTop(rightX, rightRows, "Project", rightH)
  } else if (leftRows.length) {
    drawPanelAtTop(leftX, leftRows, "Client", leftH)
  } else {
    drawPanelAtTop(rightX, rightRows, "Project", rightH)
  }

  ctx.cursorY = topY - sectionH - SP.lg
  return ctx.cursorY
}
