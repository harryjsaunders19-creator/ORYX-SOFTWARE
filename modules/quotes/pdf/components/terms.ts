import {
  COLOR,
  CONTENT_LEFT,
  CONTENT_WIDTH,
  MIN_CONTENT_Y,
  SP,
  TYPE,
  descender,
  lineStep,
} from "../layout"
import type { QuotePdfContext } from "../context"

const TERMS_WIDTH = Math.round(CONTENT_WIDTH * 0.58)

/** Numbered terms and conditions with comfortable spacing. */
export function drawTermsSection(
  ctx: QuotePdfContext,
  terms: string[],
  startY?: number,
): number {
  if (!terms.length) return startY ?? ctx.cursorY

  const fixedStart = startY != null
  const baseY = startY ?? ctx.cursorY
  let y = baseY

  const headingH = lineStep(TYPE.section) + SP.sm + 8
  if (!fixedStart) {
    // When startY isn't pinned (normal flow), ensure we can render at least the heading.
    ctx.ensureSpace(headingH + SP.lg)
    y = ctx.cursorY
  }

  ctx.drawText("Terms & Conditions", CONTENT_LEFT, y, {
    size: TYPE.section,
    bold: true,
  })
  y -= descender(TYPE.section) + SP.sm
  ctx.drawRule(y, CONTENT_LEFT, CONTENT_LEFT + TERMS_WIDTH)
  y -= SP.lg

  const itemGap = SP.md
  for (let i = 0; i < terms.length; i++) {
    const itemText = `${i + 1}.  ${terms[i]}`
    const itemHeight = ctx.measureWrappedHeight(itemText, TYPE.terms, TERMS_WIDTH - SP.sm) + itemGap
    if (y - itemHeight < MIN_CONTENT_Y) {
      ctx.addPage()
      y = ctx.cursorY
    }

    y = ctx.drawWrapped(itemText, CONTENT_LEFT, y, TERMS_WIDTH - SP.sm, {
      size: TYPE.terms,
      color: COLOR.muted,
    })
    y -= itemGap
  }

  return y - SP.lg
}

/** Minimum Y required to place terms and totals side by side. */
export function termsSectionMinHeight(ctx: QuotePdfContext, terms: string[]): number {
  if (!terms.length) return 0
  const itemGap = SP.md
  const headingH = lineStep(TYPE.section) + SP.sm + 8 + SP.lg
  const body = terms.reduce((sum, term, i) => {
    const itemText = `${i + 1}.  ${term}`
    return (
      sum +
      ctx.measureWrappedHeight(itemText, TYPE.terms, TERMS_WIDTH - SP.sm) +
      itemGap
    )
  }, 0)

  return headingH + body + SP.lg
}

export const TERMS_LAYOUT_WIDTH = TERMS_WIDTH
