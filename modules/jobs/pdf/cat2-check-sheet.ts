import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib"
import fs from "node:fs/promises"
import path from "node:path"
import type { JobRow } from "../types/job-types"
import { BRAND_LOGO_DOCUMENT_PATH } from "@/shared/branding/branding"

const PAGE_W = 595.32
const PAGE_H = 841.92
const MARGIN_X = 48
const CONTENT_W = PAGE_W - MARGIN_X * 2
const INK = rgb(0, 0, 0)
const MUTED = rgb(0.38, 0.38, 0.38)
const HAIRLINE = 0.45
const BODY = 10.5
const LINE = 13.5

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

function drawFooter(page: PDFPage, font: PDFFont) {
  page.drawLine({
    start: { x: MARGIN_X, y: 42 },
    end: { x: MARGIN_X + CONTENT_W, y: 42 },
    thickness: HAIRLINE,
    color: rgb(0.75, 0.75, 0.75),
  })
  drawText(page, "Oryx Scaffold Design Ltd.", MARGIN_X, 28, font, 9, MUTED)
  drawText(page, "Temporary Works Design Certificate", MARGIN_X + 170, 28, font, 9, MUTED)
  drawText(
    page,
    "-- 1 of 1 --",
    PAGE_W / 2 - font.widthOfTextAtSize("-- 1 of 1 --", 8) / 2,
    14,
    font,
    8,
    MUTED,
  )
}

async function drawLogo(doc: PDFDocument, page: PDFPage): Promise<{ bottom: number; left: number }> {
  const fallback = { bottom: PAGE_H - 70, left: PAGE_W - 150 }
  try {
    const logoBytes = await fs.readFile(path.join(process.cwd(), BRAND_LOGO_DOCUMENT_PATH))
    const logo = await doc.embedJpg(logoBytes)
    const insetX = 28
    const insetY = 18
    const logoW = 118
    const logoH = logoW * (logo.height / logo.width)
    const x = PAGE_W - insetX - logoW
    const y = PAGE_H - insetY - logoH
    page.drawImage(logo, { x, y, width: logoW, height: logoH })
    return { bottom: y - 10, left: x - 12 }
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
  const labelW = 148
  const valueW = CONTENT_W - labelW - 16
  const rowPad = 7
  const bottoms: number[] = []
  let cursor = top

  // Measure each row for wrapped values
  const measured = rows.map(([label, value]) => {
    const valueLines = wrapText(value, valueW, fontBold, BODY)
    const h = Math.max(22, valueLines.length * LINE + rowPad * 2)
    return { label, valueLines, h }
  })

  const boxH = measured.reduce((sum, r) => sum + r.h, 0)
  const bottom = top - boxH

  page.drawRectangle({
    x: MARGIN_X,
    y: bottom,
    width: CONTENT_W,
    height: boxH,
    borderColor: INK,
    borderWidth: HAIRLINE,
  })
  page.drawLine({
    start: { x: MARGIN_X + labelW, y: top },
    end: { x: MARGIN_X + labelW, y: bottom },
    thickness: HAIRLINE,
    color: INK,
  })

  for (const row of measured) {
    const rowTop = cursor
    const rowBottom = rowTop - row.h
    if (rowTop !== top) {
      page.drawLine({
        start: { x: MARGIN_X, y: rowTop },
        end: { x: MARGIN_X + CONTENT_W, y: rowTop },
        thickness: HAIRLINE,
        color: INK,
      })
    }
    drawText(page, row.label, MARGIN_X + 8, rowTop - 15, font, BODY)
    let vy = rowTop - 15
    for (const line of row.valueLines) {
      drawText(page, line, MARGIN_X + labelW + 8, vy, fontBold, BODY)
      vy -= LINE
    }
    bottoms.push(rowBottom)
    cursor = rowBottom
  }

  return bottom
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

  const logoBox = await drawLogo(doc, page)

  // Single-line title kept clear of the logo on the right
  const title = "Temporary Works Design Certificate"
  const titleSize = 15
  const titleY = PAGE_H - 46
  drawText(page, title, MARGIN_X, titleY, fontBold, titleSize)
  const underlineEnd = Math.min(MARGIN_X + fontBold.widthOfTextAtSize(title, titleSize) + 8, logoBox.left)
  page.drawLine({
    start: { x: MARGIN_X, y: titleY - 8 },
    end: { x: underlineEnd, y: titleY - 8 },
    thickness: 1,
    color: INK,
  })

  // Meta table starts below both title underline and logo
  let y = Math.min(titleY - 22, logoBox.bottom)
  y = drawMetaTable(page, font, fontBold, y, [
    ["Project:", project.toUpperCase()],
    ["Type of Works:", works.toUpperCase()],
    ["Design Org. Originator:", "ORYX SCAFFOLD DESIGN LTD."],
    ["Document Ref:", filename],
  ]) - 20

  // §1 Certification + standards + documents
  drawText(page, "1.", MARGIN_X, y, fontBold, BODY)
  for (const line of wrapText(CERT_INTRO, CONTENT_W - 24, font, BODY)) {
    drawText(page, line, MARGIN_X + 20, y, font, BODY)
    y -= LINE
  }
  y -= 8

  for (const line of wrapText(CERT_STANDARDS_LEAD, CONTENT_W - 20, font, BODY)) {
    drawText(page, line, MARGIN_X + 20, y, font, BODY)
    y -= LINE
  }
  y -= 4

  for (const standard of standards) {
    const wrapped = wrapText(standard, CONTENT_W - 44, font, BODY)
    wrapped.forEach((line, i) => {
      if (i === 0) drawText(page, "•", MARGIN_X + 32, y, font, BODY)
      drawText(page, line, MARGIN_X + 48, y, font, BODY)
      y -= LINE - 1.2
    })
  }

  y -= 6
  drawText(page, CERT_DOCS_LEAD, MARGIN_X + 20, y, font, BODY)
  y -= LINE + 1
  for (const docLine of documents) {
    drawText(page, "•", MARGIN_X + 32, y, font, BODY)
    drawText(page, docLine, MARGIN_X + 48, y, font, BODY)
    y -= LINE
  }

  // §2 Comments
  y -= 14
  drawText(page, "2.", MARGIN_X, y, fontBold, BODY)
  drawText(page, "Comments are as follows:", MARGIN_X + 20, y, font, BODY)
  y -= 20

  const commentsTop = y
  const commentsH = 42
  const commentsBottom = commentsTop - commentsH
  const colSplit = MARGIN_X + 110
  page.drawRectangle({
    x: MARGIN_X,
    y: commentsBottom,
    width: CONTENT_W,
    height: commentsH,
    borderColor: INK,
    borderWidth: HAIRLINE,
  })
  page.drawLine({
    start: { x: colSplit, y: commentsTop },
    end: { x: colSplit, y: commentsBottom },
    thickness: HAIRLINE,
    color: INK,
  })
  page.drawLine({
    start: { x: MARGIN_X, y: commentsTop - 18 },
    end: { x: MARGIN_X + CONTENT_W, y: commentsTop - 18 },
    thickness: HAIRLINE,
    color: INK,
  })
  drawText(page, "Section", MARGIN_X + 8, commentsTop - 13, fontBold, BODY)
  drawText(page, "Comment", colSplit + 8, commentsTop - 13, fontBold, BODY)
  drawText(page, "General", MARGIN_X + 8, commentsTop - 33, font, BODY)
  drawText(page, "Approved with no comments.", colSplit + 8, commentsTop - 33, font, BODY)

  // §3 Liability
  y = commentsBottom - 18
  drawText(page, "3.", MARGIN_X, y, fontBold, BODY)
  for (const line of wrapText(LIABILITY, CONTENT_W - 24, font, BODY)) {
    drawText(page, line, MARGIN_X + 20, y, font, BODY)
    y -= LINE
  }

  // Checked by only — signature sits on its own band under Signed/Date
  y -= 16
  drawText(page, "Checked by:", MARGIN_X, y, fontBold, BODY)
  y -= 14

  const checkTop = y
  const checkBottom = checkTop - 96
  page.drawRectangle({
    x: MARGIN_X,
    y: checkBottom,
    width: CONTENT_W,
    height: checkTop - checkBottom,
    borderColor: INK,
    borderWidth: HAIRLINE,
  })

  drawText(page, "Signed:", MARGIN_X + 10, checkTop - 18, font, BODY)
  drawText(page, "Date:", MARGIN_X + 320, checkTop - 18, font, BODY)
  drawText(page, dateStr, MARGIN_X + 358, checkTop - 18, font, BODY)

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
      // Place under the Signed label, clear of Date and Name rows
      page.drawImage(image, {
        x: MARGIN_X + 10,
        y: checkTop - 22 - sigH - 4,
        width: sigW,
        height: sigH,
      })
    } catch {
      // leave blank
    }
  }

  drawText(page, "Checker", MARGIN_X + 10, checkTop - 62, font, BODY)
  drawText(page, "Name:", MARGIN_X + 10, checkTop - 82, font, BODY)
  drawText(page, CHECKER.name, MARGIN_X + 54, checkTop - 82, fontBold, 11)
  drawText(page, "Title:", MARGIN_X + 320, checkTop - 82, font, BODY)
  drawText(page, CHECKER.title, MARGIN_X + 358, checkTop - 82, font, BODY)

  drawFooter(page, font)

  return doc.save()
}
