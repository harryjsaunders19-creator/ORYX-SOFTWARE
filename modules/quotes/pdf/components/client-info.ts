import type { QuotePdfClientFields } from "../types"
import {
  COLOR,
  CONTENT_LEFT,
  CONTENT_RIGHT,
  SP,
  TYPE,
  descender,
  lineStep,
} from "../layout"
import type { QuotePdfContext } from "../context"

const FIELD_DEFS: { key: keyof QuotePdfClientFields; label: string }[] = [
  { key: "client", label: "Client" },
  { key: "contact", label: "Contact" },
  { key: "project", label: "Project" },
  { key: "site", label: "Site" },
  { key: "address", label: "Address" },
  { key: "reference", label: "Reference" },
]

/** Client information panel — only populated fields are rendered. */
export function drawClientInformation(
  ctx: QuotePdfContext,
  fields: QuotePdfClientFields,
): number {
  const rows = FIELD_DEFS
    .map(def => ({ ...def, value: fields[def.key]?.trim() }))
    .filter(row => row.value)

  if (!rows.length) {
    return ctx.cursorY
  }

  const panelX = CONTENT_LEFT
  const panelW = CONTENT_RIGHT - CONTENT_LEFT
  const labelW = 72
  const valueX = panelX + labelW + SP.md
  const valueW = panelW - labelW - SP.md - SP.lg

  const rowHeights = rows.map(row =>
    Math.max(
      lineStep(TYPE.body),
      ctx.measureWrappedHeight(row.value!, TYPE.body, valueW),
    ),
  )
  const innerPad = SP.md
  const panelH =
    innerPad * 2 +
    rowHeights.reduce((sum, h) => sum + h, 0) +
    (rows.length - 1) * SP.sm

  ctx.ensureSpace(panelH + SP.lg)
  const topY = ctx.cursorY

  ctx.page.drawRectangle({
    x: panelX,
    y: topY - panelH,
    width: panelW,
    height: panelH,
    color: COLOR.panel,
    borderColor: COLOR.panelBorder,
    borderWidth: 0.5,
  })

  let y = topY - innerPad - capBaseline(TYPE.body)
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    ctx.drawText(row.label, panelX + innerPad, y, {
      size: TYPE.metaLabel,
      color: COLOR.muted,
    })
    y = ctx.drawWrapped(row.value!, valueX, y, valueW, {
      size: TYPE.body,
      step: lineStep(TYPE.body),
    })
    if (i < rows.length - 1) {
      y -= SP.sm
      y += capBaseline(TYPE.body) - descender(TYPE.body)
    }
  }

  return topY - panelH - SP.xl
}

function capBaseline(size: number): number {
  return Math.round(size * 0.72)
}
