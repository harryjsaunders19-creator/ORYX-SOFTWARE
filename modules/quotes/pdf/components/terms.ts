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

  const headingH = lineStep(TYPE.section) + SP.sm + 8
  const estimatedBody = terms.reduce(
    (sum, term, i) =>
      sum +
      ctx.measureWrappedHeight(
        `${i + 1}.  ${term}`,
        TYPE.terms,
        TERMS_WIDTH - SP.sm,
        lineStep(TYPE.terms, 1.55),
      ) +
      SP.md,
    0,
  )

  const baseY = startY ?? ctx.cursorY
  if (baseY - (headingH + estimatedBody + SP.lg) < MIN_CONTENT_Y) {
    ctx.addPage()
  }

  let y = startY ?? ctx.cursorY
  ctx.drawText("Terms & Conditions", CONTENT_LEFT, y, {
    size: TYPE.section,
    bold: true,
  })
  y -= descender(TYPE.section) + SP.sm
  ctx.drawRule(y, CONTENT_LEFT, CONTENT_LEFT + TERMS_WIDTH)
  y -= SP.lg

  for (let i = 0; i < terms.length; i++) {
    y = ctx.drawWrapped(`${i + 1}.  ${terms[i]}`, CONTENT_LEFT, y, TERMS_WIDTH - SP.sm, {
      size: TYPE.terms,
      color: COLOR.muted,
      step: lineStep(TYPE.terms, 1.55),
    })
    y -= SP.md
  }

  return y - SP.lg
}

/** Minimum Y required to place terms and totals side by side. */
export function termsSectionMinHeight(ctx: QuotePdfContext, terms: string[]): number {
  if (!terms.length) return 0
  const headingH = lineStep(TYPE.section) + SP.sm + 8 + SP.lg
  const body = terms.reduce(
    (sum, term, i) =>
      sum +
      ctx.measureWrappedHeight(
        `${i + 1}.  ${term}`,
        TYPE.terms,
        TERMS_WIDTH - SP.sm,
        lineStep(TYPE.terms, 1.55),
      ) +
      SP.md,
    0,
  )
  return headingH + body + SP.lg
}

export const TERMS_LAYOUT_WIDTH = TERMS_WIDTH
