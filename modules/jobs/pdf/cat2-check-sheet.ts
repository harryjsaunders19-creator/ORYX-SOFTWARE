import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib"
import fs from "node:fs/promises"
import path from "node:path"
import type { JobRow } from "../types/job-types"
import { BRAND_LOGO_DOCUMENT_PATH } from "@/shared/branding/branding"

const PAGE_W = 595.32
const PAGE_H = 841.92
const MARGIN_X = 48
const CONTENT_W = PAGE_W - MARGIN_X * 2
const CONTENT_RIGHT = MARGIN_X + CONTENT_W
const INK = rgb(0, 0, 0)
const MUTED = rgb(0.38, 0.38, 0.38)
const RULE = rgb(0.72, 0.72, 0.72)
const HAIRLINE = 0.5
const BODY = 10.5
const LINE = 13.5
const PAD = 8
const SECTION_INDENT = 20
const BULLET_X = MARGIN_X + 32
const BULLET_TEXT_X = MARGIN_X + 48
const META_LABEL_W = 148
const CHECK_DATE_LABEL_X = MARGIN_X + 318
const CHECK_DATE_VALUE_X = MARGIN_X + 356

const DEFAULT_STANDARDS = [
  "TG4:25 Anchoring systems for scaffolding.",
  "BS EN:12811-1:2003 Temporary works equipment. Scaffolds. Performance requirements and general design.",
  "BS EN:12811-2: Temporary works equipment. Information on materials.",
  "BS EN 1991-1-4:2005+A1:2010: Eurocode 1. Actions on structures. General actions. Wind actions.",
  "BS 5975:2019: Code of practice for temporary works procedures and the permissible stress design of falsework.",
  "Working at Height Regulations 2005.",
  "The Construction (Design and Management) Regulations 2015.",
  "NASC Document TG20:21 Good Practice Guidance for Tube and Fitting Scaffolding",
]

const CHECKER = {
  name: "Lee Saunders",
  title: "Principle Engineer",
}

const CERT_INTRO =
  "We certify that we have used reasonable professional skill and care in preparing and/or checking the temporary works design for the above section of the project."

const CERT_STANDARDS_LEAD =
  "The designs have been prepared and/or checked in accordance with the following codes and standards:"

const CERT_DOCS_LEAD = "The following documents describe and detail the design:"

const LIABILITY =
  "Nothing in this certificate shall impose upon us any greater liability than the exercise of reasonable professional skill, care and diligence."

export function cat2ExportFilename(drawingNumber: string): string {
  const safeDrawing = drawingNumber.replace(/[\\/:*?"<>|]/g, "-").trim() || "drawing"
  return `${safeDrawing}-CATII Check Certificate.pdf`
}

function wrapText(text: string, width: number, font: PDFFont, size: number): string[] {
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
      if (font.widthOfTextAtSize(trial, size) > width && current) {
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

function splitStandards(text: string | null | undefined): string[] {
  const parsed = (text ?? "")
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean)
  return parsed.length ? parsed : DEFAULT_STANDARDS
}

async function loadSignatureAsset(): Promise<{ bytes: Uint8Array; isPng: boolean } | null> {
  const candidates = [
    process.env.CAT2_CHECK_SIGNATURE_PATH,
    path.join(process.cwd(), "private-assets", "Lee Signature.png"),
    path.join(process.cwd(), "private-assets", "cat2-signature.png"),
  ].filter(Boolean) as string[]

  for (const filePath of candidates) {
    try {
      const bytes = await fs.readFile(filePath)
      if (bytes.byteLength < 256) continue
      return { bytes, isPng: filePath.toLowerCase().endsWith(".png") }
    } catch {
      // try next
    }
  }
  return null
}

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size = BODY,
  color = INK,
) {
  page.drawText(text, { x, y, size, font, color })
}

function drawHRule(page: PDFPage, y: number, fromX = MARGIN_X, toX = CONTENT_RIGHT, color = INK) {
  page.drawLine({
    start: { x: fromX, y },
    end: { x: toX, y },
    thickness: HAIRLINE,
    color,
  })
}

function drawBox(page: PDFPage, bottom: number, height: number) {
  page.drawRectangle({
    x: MARGIN_X,
    y: bottom,
    width: CONTENT_W,
    height,
    borderColor: INK,
    borderWidth: HAIRLINE,
  })
}

/** Optical centre of Helvetica text relative to baseline. */
function textOpticalCenterOffset(size: number): number {
  return size * 0.35
}

type LogoBox = {
  x: number
  y: number
  width: number
  height: number
  centerY: number
  left: number
  bottom: number
}

async function drawLogo(doc: PDFDocument, page: PDFPage): Promise<LogoBox> {
  const fallback: LogoBox = {
    x: PAGE_W - 146,
    y: PAGE_H - 90,
    width: 118,
    height: 72,
    centerY: PAGE_H - 54,
    left: PAGE_W - 158,
    bottom: PAGE_H - 100,
  }
  try {
    const logoBytes = await fs.readFile(path.join(process.cwd(), BRAND_LOGO_DOCUMENT_PATH))
    const logo = await doc.embedJpg(logoBytes)
    const insetX = 28
    const insetY = 20
    const width = 118
    const height = width * (logo.height / logo.width)
    const x = PAGE_W - insetX - width
    const y = PAGE_H - insetY - height
    page.drawImage(logo, { x, y, width, height })
    return {
      x,
      y,
      width,
      height,
      centerY: y + height / 2,
      left: x - 14,
      bottom: y - 12,
    }
  } catch {
    return fallback
  }
}

function drawMetaTable(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  top: number,
  rows: [string, string][],
): number {
  const valueW = CONTENT_W - META_LABEL_W - PAD * 2
  const rowPadY = 6
  let cursor = top

  const measured = rows.map(([label, value]) => {
    const valueLines = wrapText(value, valueW, fontBold, BODY)
    const h = Math.max(22, valueLines.length * LINE + rowPadY * 2)
    return { label, valueLines, h }
  })

  const boxH = measured.reduce((sum, r) => sum + r.h, 0)
  const bottom = top - boxH
  drawBox(page, bottom, boxH)

  page.drawLine({
    start: { x: MARGIN_X + META_LABEL_W, y: top },
    end: { x: MARGIN_X + META_LABEL_W, y: bottom },
    thickness: HAIRLINE,
    color: INK,
  })

  for (const row of measured) {
    const rowTop = cursor
    const rowBottom = rowTop - row.h
    if (rowTop !== top) drawHRule(page, rowTop)

    // Vertically centre single-line rows; top-align multi-line
    const firstBaseline = row.valueLines.length === 1
      ? rowTop - row.h / 2 - textOpticalCenterOffset(BODY) + BODY * 0.12
      : rowTop - rowPadY - BODY + 2

    drawText(page, row.label, MARGIN_X + PAD, firstBaseline, font, BODY)
    let vy = firstBaseline
    for (const line of row.valueLines) {
      drawText(page, line, MARGIN_X + META_LABEL_W + PAD, vy, fontBold, BODY)
      vy -= LINE
    }
    cursor = rowBottom
  }

  return bottom
}

function drawFooter(page: PDFPage, font: PDFFont) {
  drawHRule(page, 40, MARGIN_X, CONTENT_RIGHT, RULE)
  drawText(page, "Oryx Scaffold Design Ltd.", MARGIN_X, 26, font, 9, MUTED)
  const centre = "Temporary Works Design Certificate"
  drawText(
    page,
    centre,
    PAGE_W / 2 - font.widthOfTextAtSize(centre, 9) / 2,
    26,
    font,
    9,
    MUTED,
  )
  const pageMark = "-- 1 of 1 --"
  drawText(
    page,
    pageMark,
    CONTENT_RIGHT - font.widthOfTextAtSize(pageMark, 8),
    26,
    font,
    8,
    MUTED,
  )
}

export async function buildCat2CheckSheetPdf(job: JobRow): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([PAGE_W, PAGE_H])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)

  const works = job.typeOfWorks === "Other" && job.customTypeDescription
    ? `Other - ${job.customTypeDescription}`
    : (job.typeOfWorks || "Scaffold")
  const project = (job.siteName?.trim() || job.siteAddress?.trim() || job.address || "Not specified")
    .replace(/\.$/, "")
  const filename = cat2ExportFilename(job.drawingNumber)
  const standards = splitStandards(job.designStandards)
  const completedAt = job.dateCompleted ? new Date(job.dateCompleted) : new Date()
  const dateStr = completedAt.toLocaleDateString("en-GB")
  const documents = [`${job.drawingNumber} — Scaffold design`]

  const logo = await drawLogo(doc, page)

  // Title baseline aligned to the optical centre of the logo
  const title = "Temporary Works Design Certificate"
  const titleSize = 15
  const titleBaseline = logo.centerY - textOpticalCenterOffset(titleSize)
  drawText(page, title, MARGIN_X, titleBaseline, fontBold, titleSize)

  const underlineY = Math.min(titleBaseline - 9, logo.y - 6)
  const underlineEnd = Math.min(
    MARGIN_X + fontBold.widthOfTextAtSize(title, titleSize) + 6,
    logo.left,
  )
  page.drawLine({
    start: { x: MARGIN_X, y: underlineY },
    end: { x: underlineEnd, y: underlineY },
    thickness: 1,
    color: INK,
  })

  // Meta table starts a consistent gap below header band (logo + title)
  let y = Math.min(underlineY, logo.y) - 14
  y = drawMetaTable(page, font, fontBold, y, [
    ["Project:", project.toUpperCase()],
    ["Type of Works:", works.toUpperCase()],
    ["Design Org. Originator:", "ORYX SCAFFOLD DESIGN LTD."],
    ["Document Ref:", filename],
  ]) - 18

  // §1 Certification + standards + documents
  drawText(page, "1.", MARGIN_X, y, fontBold, BODY)
  for (const line of wrapText(CERT_INTRO, CONTENT_W - SECTION_INDENT - 4, font, BODY)) {
    drawText(page, line, MARGIN_X + SECTION_INDENT, y, font, BODY)
    y -= LINE
  }
  y -= 7

  for (const line of wrapText(CERT_STANDARDS_LEAD, CONTENT_W - SECTION_INDENT, font, BODY)) {
    drawText(page, line, MARGIN_X + SECTION_INDENT, y, font, BODY)
    y -= LINE
  }
  y -= 3

  for (const standard of standards) {
    const wrapped = wrapText(standard, CONTENT_W - (BULLET_TEXT_X - MARGIN_X), font, BODY)
    wrapped.forEach((line, i) => {
      if (i === 0) drawText(page, "•", BULLET_X, y, font, BODY)
      drawText(page, line, BULLET_TEXT_X, y, font, BODY)
      y -= LINE - 1.1
    })
  }

  y -= 5
  drawText(page, CERT_DOCS_LEAD, MARGIN_X + SECTION_INDENT, y, font, BODY)
  y -= LINE
  for (const docLine of documents) {
    drawText(page, "•", BULLET_X, y, font, BODY)
    drawText(page, docLine, BULLET_TEXT_X, y, font, BODY)
    y -= LINE
  }

  // §2 Comments
  y -= 12
  drawText(page, "2.", MARGIN_X, y, fontBold, BODY)
  drawText(page, "Comments are as follows:", MARGIN_X + SECTION_INDENT, y, font, BODY)
  y -= 16

  const commentsTop = y
  const headerH = 18
  const bodyH = 22
  const commentsH = headerH + bodyH
  const commentsBottom = commentsTop - commentsH
  const colSplit = MARGIN_X + 110
  drawBox(page, commentsBottom, commentsH)
  page.drawLine({
    start: { x: colSplit, y: commentsTop },
    end: { x: colSplit, y: commentsBottom },
    thickness: HAIRLINE,
    color: INK,
  })
  drawHRule(page, commentsTop - headerH)
  const commentsHeaderY = commentsTop - headerH / 2 - textOpticalCenterOffset(BODY) + 1
  const commentsBodyY = commentsTop - headerH - bodyH / 2 - textOpticalCenterOffset(BODY) + 1
  drawText(page, "Section", MARGIN_X + PAD, commentsHeaderY, fontBold, BODY)
  drawText(page, "Comment", colSplit + PAD, commentsHeaderY, fontBold, BODY)
  drawText(page, "General", MARGIN_X + PAD, commentsBodyY, font, BODY)
  drawText(page, "Approved with no comments.", colSplit + PAD, commentsBodyY, font, BODY)

  // §3 Liability
  y = commentsBottom - 16
  drawText(page, "3.", MARGIN_X, y, fontBold, BODY)
  for (const line of wrapText(LIABILITY, CONTENT_W - SECTION_INDENT - 4, font, BODY)) {
    drawText(page, line, MARGIN_X + SECTION_INDENT, y, font, BODY)
    y -= LINE
  }

  // Checked by
  y -= 14
  drawText(page, "Checked by:", MARGIN_X, y, fontBold, BODY)
  y -= 12

  const checkTop = y
  const checkH = 94
  const checkBottom = checkTop - checkH
  drawBox(page, checkBottom, checkH)

  const signedRowY = checkTop - 16
  drawText(page, "Signed:", MARGIN_X + PAD, signedRowY, font, BODY)
  drawText(page, "Date:", CHECK_DATE_LABEL_X, signedRowY, font, BODY)
  drawText(page, dateStr, CHECK_DATE_VALUE_X, signedRowY, font, BODY)

  const signatureAsset = await loadSignatureAsset()
  if (signatureAsset) {
    try {
      const image = signatureAsset.isPng
        ? await doc.embedPng(signatureAsset.bytes)
        : await doc.embedJpg(signatureAsset.bytes)
      const maxW = 148
      const maxH = 28
      const ratio = image.width / image.height
      let sigW = maxW
      let sigH = sigW / ratio
      if (sigH > maxH) {
        sigH = maxH
        sigW = sigH * ratio
      }
      // Signature band directly under Signed:, left-aligned with pad, clear of Date column
      const sigX = MARGIN_X + PAD
      const sigY = signedRowY - 6 - sigH
      const maxSigRight = CHECK_DATE_LABEL_X - 12
      if (sigX + sigW > maxSigRight) {
        sigW = maxSigRight - sigX
        sigH = sigW / ratio
      }
      page.drawImage(image, { x: sigX, y: sigY, width: sigW, height: sigH })
    } catch {
      // leave blank
    }
  }

  const nameRowY = checkTop - 76
  drawText(page, "Checker", MARGIN_X + PAD, checkTop - 58, font, BODY)
  drawText(page, "Name:", MARGIN_X + PAD, nameRowY, font, BODY)
  drawText(page, CHECKER.name, MARGIN_X + 52, nameRowY, fontBold, 11)
  drawText(page, "Title:", CHECK_DATE_LABEL_X, nameRowY, font, BODY)
  drawText(page, CHECKER.title, CHECK_DATE_VALUE_X, nameRowY, font, BODY)

  drawFooter(page, font)

  return doc.save()
}
