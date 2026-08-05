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

// Render terms alongside the right-aligned totals box.
const TERMS_WIDTH = Math.round(CONTENT_WIDTH * 0.58)

/** Numbered terms and conditions with comfortable spacing. */
export function drawTermsSection(
  ctx: QuotePdfContext,
  terms: string[],
  startY?: number,
  opts?: { allowSplit?: boolean },
): number {
  if (!terms.length) return startY ?? ctx.cursorY

  const allowSplit = opts?.allowSplit ?? false
  let y = startY ?? ctx.cursorY

  const drawHeading = () => {
    ctx.drawText("Terms & Conditions", CONTENT_LEFT, y, {
      size: TYPE.section,
      bold: true,
    })
    y -= descender(TYPE.section) + SP.sm
    ctx.drawRule(y, CONTENT_LEFT, CONTENT_LEFT + TERMS_WIDTH)
    y -= SP.lg
  }

  drawHeading()

  const itemGap = SP.md
  for (let i = 0; i < terms.length; i++) {
    const itemText = `${i + 1}.  ${terms[i]}`
    const itemHeight = ctx.measureWrappedHeight(itemText, TYPE.terms, TERMS_WIDTH - SP.sm) + itemGap

    if (allowSplit && y - itemHeight < MIN_CONTENT_Y) {
      ctx.addPage()
      y = ctx.cursorY
      drawHeading()
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
  // Must mirror drawHeading() cursor movement:
  // - y -= descender(TYPE.section) + SP.sm
  // - y -= SP.lg
  const headingH = descender(TYPE.section) + SP.sm + SP.lg
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
