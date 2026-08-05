import {
  COLOR,
  CONTENT_LEFT,
  SP,
  TYPE,
  descender,
  lineStep,
} from "../layout"
import type { QuotePdfContext } from "../context"

function isBulletLine(line: string): boolean {
  const t = line.trim()
  return t.startsWith("•") || t.startsWith("-")
}

function parseBulletText(line: string): string {
  return line.trim().replace(/^([•-])\s+/, "").replace(/^([•-])/, "").trim()
}

/**
 * Scope of Works section (from quote.description) with paragraph spacing and basic
 * bullet support. Optionally follows with "Quotation Notes" (from quote.notes).
 */
export function drawScopeOfWorks(
  ctx: QuotePdfContext,
  scope: string | null,
  quotationNotes: string | null,
): number {
  const scopeText = scope?.trim()
  const notesText = quotationNotes?.trim()
  const hasScope = !!scopeText
  const hasNotes = !!notesText
  if (!hasScope && !hasNotes) return ctx.cursorY

  const width = ctx.contentWidth()
  const headingH = lineStep(TYPE.section) + SP.sm + 10

  let y = ctx.cursorY
  const drawHeading = (label: string) => {
    ctx.cursorY = y
    ctx.ensureSpace(headingH + SP.lg)
    y = ctx.cursorY
    ctx.drawText(label, CONTENT_LEFT, y, {
      size: TYPE.section,
      bold: true,
      color: COLOR.ink,
    })
    y -= descender(TYPE.section) + SP.sm
    ctx.drawRule(y)
    y -= SP.md
  }

  if (hasScope) {
    drawHeading("Scope of Works")

    const indent = 16
    const bulletX = CONTENT_LEFT + indent
    const bulletW = width - indent - SP.xs

    // Preserve paragraph breaks; render bullet items when lines are prefixed.
    const paragraphs = scopeText!.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
    const paragraphGap = SP.md - SP.xs // keep breathing room without wasting vertical space

    for (const paragraph of paragraphs) {
      const lines = paragraph.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
      for (const line of lines) {
        const isBullet = isBulletLine(line)
        const text = isBullet ? `• ${parseBulletText(line)}` : line
        const x = isBullet ? bulletX : CONTENT_LEFT
        const w = isBullet ? bulletW : width
        const h = ctx.measureWrappedHeight(text, TYPE.body, w)

        ctx.cursorY = y
        ctx.ensureSpace(h + SP.xs)
        y = ctx.cursorY

        y = ctx.drawWrapped(text, x, y, w, {
          size: TYPE.body,
          color: COLOR.ink,
        })
        y -= SP.xs
      }
      y -= paragraphGap
    }

    y -= SP.md
  }

  if (hasNotes) {
    drawHeading("Quotation Notes")
    y = ctx.drawWrapped(notesText!, CONTENT_LEFT, y, width, {
      size: TYPE.body,
      color: COLOR.ink,
      paragraphGap: SP.md,
    })
    return y - SP.md
  }

  return y
}
