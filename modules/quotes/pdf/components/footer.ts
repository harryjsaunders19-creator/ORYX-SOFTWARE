import { QUOTE_COMPANY } from "../company"
import {
  COLOR,
  CONTENT_LEFT,
  CONTENT_RIGHT,
  FOOTER_Y,
  SP,
  TYPE,
} from "../layout"
import type { QuotePdfContext } from "../context"

function truncateToWidth(text: string, maxW: number, fontSize: number, font: ReturnType<QuotePdfContext["font"]>): string {
  if (font.widthOfTextAtSize(text, fontSize) <= maxW) return text
  let s = text
  while (s.length > 6 && font.widthOfTextAtSize(s + "…", fontSize) > maxW) {
    s = s.slice(0, -1)
  }
  return s + "…"
}

function optionalParts(): { website: string; reg?: string; vat?: string } {
  const reg = QUOTE_COMPANY.companyRegistration ? `Co. Reg. ${QUOTE_COMPANY.companyRegistration}` : undefined
  const vat = QUOTE_COMPANY.vatNumber ? `VAT No. ${QUOTE_COMPANY.vatNumber}` : undefined
  return {
    website: QUOTE_COMPANY.website,
    reg,
    vat,
  }
}

/** Subtle footer with company details and page numbers on every page. */
export function drawFooters(ctx: QuotePdfContext): void {
  const { website, reg, vat } = optionalParts()

  const address = QUOTE_COMPANY.addressLines.join(", ")
  const contactRight = `Tel ${QUOTE_COMPANY.phone}   ·   ${QUOTE_COMPANY.email}`
  const financeRightParts = [website, reg, vat].filter(Boolean) as string[]
  const financeRight = financeRightParts.join("   ·   ")

  ctx.forEachPage((page, index, total) => {
    const ruleY = FOOTER_Y + SP.md
    page.drawLine({
      start: { x: CONTENT_LEFT, y: ruleY },
      end: { x: CONTENT_RIGHT, y: ruleY },
      thickness: 0.35,
      color: COLOR.rule,
    })

    const font = ctx.fontRegular
    const size = TYPE.footer
    const step = Math.round(size * 1.35)

    const y1 = FOOTER_Y + step
    const y2 = y1 - step
    const y3 = y2 - step

    const pageLabel = `Page ${index + 1} of ${total}`

    // Line 1: company name + page number
    const pageW = font.widthOfTextAtSize(pageLabel, size)
    page.drawText(QUOTE_COMPANY.name, {
      x: CONTENT_LEFT,
      y: y1,
      size,
      font,
      color: COLOR.faint,
    })
    page.drawText(pageLabel, {
      x: CONTENT_RIGHT - pageW,
      y: y1,
      size,
      font,
      color: COLOR.faint,
    })

    // Line 2: address left, telephone/email right
    const splitX = CONTENT_LEFT + Math.round((CONTENT_RIGHT - CONTENT_LEFT) * 0.60)
    const maxLeftW = splitX - CONTENT_LEFT
    const left2 = truncateToWidth(address, maxLeftW, size, font)
    page.drawText(left2, { x: CONTENT_LEFT, y: y2, size, font, color: COLOR.faint })

    const maxRightW = CONTENT_RIGHT - splitX
    const right2 = truncateToWidth(contactRight, maxRightW, size, font)
    page.drawText(right2, { x: splitX, y: y2, size, font, color: COLOR.faint })

    // Line 3: website + registration + VAT (if available)
    const maxW3 = CONTENT_RIGHT - CONTENT_LEFT
    const right3 = truncateToWidth(financeRight, maxW3, size, font)
    page.drawText(right3, { x: CONTENT_LEFT, y: y3, size, font, color: COLOR.faint })
  })
}
