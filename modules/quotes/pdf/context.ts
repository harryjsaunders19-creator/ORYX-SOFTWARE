import {
  PDFDocument,
  type PDFImage,
  type PDFPage,
  type PDFFont,
  type RGB,
} from "pdf-lib"
import {
  COLOR,
  CONTENT_LEFT,
  CONTENT_RIGHT,
  CONTENT_WIDTH,
  FOOTER_RESERVE,
  MARGIN,
  MIN_CONTENT_Y,
  PAGE,
  SP,
  lineStep,
} from "./layout"

export type TextAlign = "left" | "right"

export interface DrawTextOptions {
  size: number
  bold?: boolean
  color?: RGB
  align?: TextAlign
}

export interface DrawWrappedOptions extends DrawTextOptions {
  step?: number
  paragraphGap?: number
}

export class QuotePdfContext {
  readonly doc: PDFDocument
  readonly fontRegular: PDFFont
  readonly fontBold: PDFFont
  readonly logo: PDFImage

  private pages: PDFPage[] = []
  cursorY = PAGE.height - MARGIN.top

  constructor(
    doc: PDFDocument,
    fontRegular: PDFFont,
    fontBold: PDFFont,
    logo: PDFImage,
  ) {
    this.doc = doc
    this.fontRegular = fontRegular
    this.fontBold = fontBold
    this.logo = logo
    const first = doc.addPage([PAGE.width, PAGE.height])
    this.pages.push(first)
  }

  get page(): PDFPage {
    return this.pages[this.pages.length - 1]!
  }

  get pageCount(): number {
    return this.pages.length
  }

  get pageIndex(): number {
    return this.pages.length - 1
  }

  font(bold = false): PDFFont {
    return bold ? this.fontBold : this.fontRegular
  }

  addPage(): void {
    const next = this.doc.addPage([PAGE.width, PAGE.height])
    this.pages.push(next)
    this.cursorY = PAGE.height - MARGIN.top
  }

  ensureSpace(height: number, reserveFooter = true): void {
    const floor = reserveFooter ? MIN_CONTENT_Y : MARGIN.bottom
    if (this.cursorY - height < floor) {
      this.addPage()
    }
  }

  drawRule(y: number, x1 = CONTENT_LEFT, x2 = CONTENT_RIGHT, color = COLOR.rule): void {
    this.page.drawLine({
      start: { x: x1, y },
      end: { x: x2, y },
      thickness: 0.5,
      color,
    })
  }

  drawText(text: string, x: number, baselineY: number, opts: DrawTextOptions): void {
    const font = this.font(opts.bold)
    const drawX =
      opts.align === "right"
        ? x - font.widthOfTextAtSize(text, opts.size)
        : x
    this.page.drawText(text, {
      x: drawX,
      y: baselineY,
      size: opts.size,
      font,
      color: opts.color ?? COLOR.ink,
    })
  }

  drawLine(
    text: string,
    x: number,
    baselineY: number,
    opts: DrawTextOptions & { step?: number },
  ): number {
    const step = opts.step ?? lineStep(opts.size)
    this.drawText(text, x, baselineY, opts)
    return baselineY - step
  }

  wrapText(text: string, size: number, maxWidth: number, bold = false): string[] {
    const font = this.font(bold)
    const lines: string[] = []
    for (const paragraph of text.split(/\n/)) {
      const words = paragraph.split(/\s+/).filter(Boolean)
      if (!words.length) {
        lines.push("")
        continue
      }
      let current = ""
      for (const word of words) {
        const trial = current ? `${current} ${word}` : word
        if (font.widthOfTextAtSize(trial, size) > maxWidth && current) {
          lines.push(current)
          current = word
        } else {
          current = trial
        }
      }
      if (current) lines.push(current)
    }
    return lines
  }

  drawWrapped(
    text: string,
    x: number,
    startY: number,
    maxWidth: number,
    opts: DrawWrappedOptions,
  ): number {
    const step = opts.step ?? lineStep(opts.size)
    const paragraphGap = opts.paragraphGap ?? SP.sm
    let y = startY
    const paragraphs = text.split(/\n/)
    for (let p = 0; p < paragraphs.length; p++) {
      const lines = this.wrapText(paragraphs[p] ?? "", opts.size, maxWidth, opts.bold)
      for (const line of lines) {
        if (line) this.drawText(line, x, y, opts)
        y -= step
      }
      if (p < paragraphs.length - 1) y -= paragraphGap
    }
    return y
  }

  measureWrappedHeight(
    text: string,
    size: number,
    maxWidth: number,
    step?: number,
    paragraphGap?: number,
  ): number {
    const lineHeight = step ?? lineStep(size)
    const gap = paragraphGap ?? SP.sm
    let height = 0
    const paragraphs = text.split(/\n/)
    for (let p = 0; p < paragraphs.length; p++) {
      const lines = this.wrapText(paragraphs[p] ?? "", size, maxWidth)
      height += Math.max(lines.length, 1) * lineHeight
      if (p < paragraphs.length - 1) height += gap
    }
    return height
  }

  forEachPage(fn: (page: PDFPage, index: number, total: number) => void): void {
    const total = this.pages.length
    this.pages.forEach((page, index) => fn(page, index, total))
  }

  footerReserve(): number {
    return FOOTER_RESERVE
  }

  contentWidth(): number {
    return CONTENT_WIDTH
  }
}
