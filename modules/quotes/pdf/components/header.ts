import { QUOTE_COMPANY } from "../company"
import {
  COLOR,
  CONTENT_LEFT,
  CONTENT_RIGHT,
  LOGO,
  SP,
  TYPE,
  capHeight,
  descender,
} from "../layout"
import type { QuotePdfContext } from "../context"

/** Corporate letterhead — logo, company details, thin divider. */
export function drawQuoteHeader(ctx: QuotePdfContext): number {
  const topY = ctx.cursorY
  const logoBottom = topY - LOGO.height

  ctx.page.drawImage(ctx.logo, {
    x: CONTENT_LEFT,
    y: logoBottom,
    width: LOGO.width,
    height: LOGO.height,
  })

  const detailsX = CONTENT_LEFT + LOGO.width + SP.lg
  const detailsMaxW = CONTENT_RIGHT - detailsX

  let textY = topY - capHeight(TYPE.companyName)
  ctx.drawText(QUOTE_COMPANY.name, detailsX, textY, {
    size: TYPE.companyName,
    bold: true,
  })

  textY -= descender(TYPE.companyName) + SP.sm

  const detailLines: string[] = [
    ...QUOTE_COMPANY.addressLines,
    `Tel  ${QUOTE_COMPANY.phone}`,
    `Email  ${QUOTE_COMPANY.email}`,
    `Web  ${QUOTE_COMPANY.website}`,
  ]
  if (QUOTE_COMPANY.companyRegistration) {
    detailLines.push(`Company Reg.  ${QUOTE_COMPANY.companyRegistration}`)
  }

  for (const line of detailLines) {
    ctx.drawText(line, detailsX, textY, {
      size: TYPE.companyDetail,
      color: COLOR.muted,
    })
    textY -= lineStepDetail()
  }

  const logoEnd = logoBottom
  const textEnd = textY + lineStepDetail() - descender(TYPE.companyDetail)
  const sectionEnd = Math.min(logoEnd, textEnd)

  const ruleY = sectionEnd - SP.lg
  ctx.drawRule(ruleY)

  return ruleY - SP.xl
}

function lineStepDetail(): number {
  return Math.round(TYPE.companyDetail * 1.55)
}
