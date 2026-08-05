import {
  COLOR,
  CONTENT_LEFT,
  SP,
  TYPE,
  descender,
  lineStep,
} from "../layout"
import type { QuotePdfContext } from "../context"

/** Project description with paragraph spacing. */
export function drawProjectDescription(
  ctx: QuotePdfContext,
  description: string | null,
): number {
  const text = description?.trim()
  if (!text) return ctx.cursorY

  const width = ctx.contentWidth()
  const headingH = lineStep(TYPE.section) + SP.sm + 8
  const bodyH = ctx.measureWrappedHeight(text, TYPE.body, width, lineStep(TYPE.body, 1.6), SP.md)
  ctx.ensureSpace(headingH + bodyH + SP.lg)

  let y = ctx.cursorY
  ctx.drawText("Project Description", CONTENT_LEFT, y, {
    size: TYPE.section,
    bold: true,
    color: COLOR.ink,
  })
  y -= descender(TYPE.section) + SP.sm
  ctx.drawRule(y)
  y -= SP.lg

  y = ctx.drawWrapped(text, CONTENT_LEFT, y, width, {
    size: TYPE.body,
    color: COLOR.ink,
    step: lineStep(TYPE.body, 1.6),
    paragraphGap: SP.md,
  })

  return y - SP.xl
}
