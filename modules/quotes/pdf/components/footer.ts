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

function footerLineParts(): string[] {
  const parts = [
    QUOTE_COMPANY.addressLines.join(", "),
    `Tel ${QUOTE_COMPANY.phone}`,
    QUOTE_COMPANY.email,
    QUOTE_COMPANY.website,
  ]
  if (QUOTE_COMPANY.companyRegistration) {
    parts.push(`Co. Reg. ${QUOTE_COMPANY.companyRegistration}`)
  }
  return parts
}

/** Subtle footer with company details and page numbers on every page. */
export function drawFooters(ctx: QuotePdfContext): void {
  const parts = footerLineParts()
  const footerText = parts.join("   ·   ")

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
    const pageLabel = `Page ${index + 1} of ${total}`
    const pageW = font.widthOfTextAtSize(pageLabel, size)

    let text = footerText
    const maxW = CONTENT_RIGHT - CONTENT_LEFT - pageW - SP.lg
    if (font.widthOfTextAtSize(text, size) > maxW) {
      while (text.length > 10 && font.widthOfTextAtSize(text + "…", size) > maxW) {
        text = text.slice(0, -1)
      }
      text += "…"
    }

    page.drawText(text, {
      x: CONTENT_LEFT,
      y: FOOTER_Y,
      size,
      font,
      color: COLOR.faint,
    })

    page.drawText(pageLabel, {
      x: CONTENT_RIGHT - pageW,
      y: FOOTER_Y,
      size,
      font,
      color: COLOR.faint,
    })
  })
}
