import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib"
import fs from "node:fs/promises"
import path from "node:path"
import type { JobRow } from "../types/job-types"
import { BRAND_LOGO_DOCUMENT_PATH } from "@/shared/branding/branding"

/** A4 — matches Independent Design House certificate page size. */
const PAGE_W = 595.32
const PAGE_H = 841.92
const MARGIN_X = 54
const CONTENT_W = PAGE_W - MARGIN_X * 2
const INK = rgb(0, 0, 0)
const MUTED = rgb(0.35, 0.35, 0.35)
const HAIRLINE = 0.5
const BODY = 11
const LINE = 14.5

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

const CAT_EQUIV =
  "This design certificate constitutes the equivalent of the following check:"

const LIABILITY =
  "Nothing in this certificate shall impose upon us any greater liability than the exercise of reasonable professional skill, care and diligence."

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

function drawFooter(page: PDFPage, font: PDFFont, pageNo: number, total: number) {
  const y = 36
  drawText(page, `Page | ${pageNo}`, MARGIN_X + 36, y, font, 10, MUTED)
  drawText(page, "Oryx Scaffold Design Ltd.", 190, y, font, 10, MUTED)
  drawText(page, "ORYX-CATII", 430, y, font, 10, MUTED)
  drawText(page, "Temporary Works Design Certificate", 190, 24, font, 9, MUTED)
  drawText(
    page,
    `-- ${pageNo} of ${total} --`,
    PAGE_W / 2 - font.widthOfTextAtSize(`-- ${pageNo} of ${total} --`, 8) / 2,
    12,
    font,
    8,
    MUTED,
  )
}

async function drawLogo(doc: PDFDocument, page: PDFPage) {
  try {
    const logoBytes = await fs.readFile(path.join(process.cwd(), BRAND_LOGO_DOCUMENT_PATH))
    const logo = await doc.embedJpg(logoBytes)
    const inset = 28
    const logoW = 86
    const logoH = logoW * (logo.height / logo.width)
    page.drawImage(logo, {
      x: PAGE_W - inset - logoW,
      y: PAGE_H - inset - logoH,
      width: logoW,
      height: logoH,
    })
  } catch {
    // non-fatal
  }
}

function drawTitle(page: PDFPage, fontBold: PDFFont) {
  drawText(page, "Temporary Works Design", MARGIN_X + 36, PAGE_H - 50, fontBold, 22)
  drawText(page, "Certificate", MARGIN_X + 36, PAGE_H - 78, fontBold, 22)
}

function drawMetaTable(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  top: number,
  rows: [string, string][],
): number {
  const labelW = 156
  const rowH = 24
  const boxH = rows.length * rowH
  const bottom = top - boxH

  page.drawRectangle({
    x: MARGIN_X,
    y: bottom,
    width: CONTENT_W,
    height: boxH,
    borderColor: INK,
    borderWidth: HAIRLINE,
  })

  // Vertical divider between label and value
  page.drawLine({
    start: { x: MARGIN_X + labelW, y: top },
    end: { x: MARGIN_X + labelW, y: bottom },
    thickness: HAIRLINE,
    color: INK,
  })

  rows.forEach(([label, value], i) => {
    const rowTop = top - i * rowH
    if (i > 0) {
      page.drawLine({
        start: { x: MARGIN_X, y: rowTop },
        end: { x: MARGIN_X + CONTENT_W, y: rowTop },
        thickness: HAIRLINE,
        color: INK,
      })
    }
    const textY = rowTop - 16
    drawText(page, label, MARGIN_X + 8, textY, font, BODY)
    drawText(page, value, MARGIN_X + labelW + 8, textY, fontBold, BODY)
  })

  return bottom
}

function drawCheckboxRow(
  page: PDFPage,
  font: PDFFont,
  y: number,
  label: string,
  checked: boolean,
) {
  const box = 11
  const boxX = MARGIN_X + 100
  page.drawRectangle({
    x: boxX,
    y: y - 1,
    width: box,
    height: box,
    borderColor: INK,
    borderWidth: HAIRLINE,
  })
  if (checked) {
    // Simple X mark
    page.drawLine({
      start: { x: boxX + 2, y: y + 1 },
      end: { x: boxX + box - 2, y: y + box - 3 },
      thickness: 1.1,
      color: INK,
    })
    page.drawLine({
      start: { x: boxX + box - 2, y: y + 1 },
      end: { x: boxX + 2, y: y + box - 3 },
      thickness: 1.1,
      color: INK,
    })
  }
  drawText(page, label, MARGIN_X + 56, y, font, BODY)
}

export async function buildCat2CheckSheetPdf(job: JobRow): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)

  const works = job.typeOfWorks === "Other" && job.customTypeDescription
    ? `Other - ${job.customTypeDescription}`
    : (job.typeOfWorks || "Scaffold")
  const project = (job.siteName?.trim() || job.siteAddress?.trim() || job.address || "Not specified")
    .replace(/\.$/, "")
  const documentRef = `${job.drawingNumber}-CHK1`
  const standards = splitStandards(job.designStandards)
  const completedAt = job.dateCompleted ? new Date(job.dateCompleted) : new Date()
  const dateStr = completedAt.toLocaleDateString("en-GB")
  const designerName = (job.designer || "").trim() || "Not assigned"
  const documents = [`${job.drawingNumber} — Scaffold design`]

  // ── Page 1 ──────────────────────────────────────────────────────────────
  const page1 = doc.addPage([PAGE_W, PAGE_H])
  await drawLogo(doc, page1)
  drawTitle(page1, fontBold)

  let y = PAGE_H - 120
  y = drawMetaTable(page1, font, fontBold, y, [
    ["Project:", project.toUpperCase()],
    ["Structure:", works.toUpperCase()],
    ["Section Of Works:", works.toUpperCase()],
    ["Design Org. Originator:", "ORYX SCAFFOLD DESIGN LTD."],
    ["Document Ref:", documentRef],
  ]) - 28

  // §1 Certification + standards + documents
  drawText(page1, "1.", MARGIN_X, y, fontBold, BODY)
  const introLines = wrapText(CERT_INTRO, CONTENT_W - 28, font, BODY)
  let ty = y
  for (const line of introLines) {
    drawText(page1, line, MARGIN_X + 22, ty, font, BODY)
    ty -= LINE
  }
  y = ty - 10

  const leadLines = wrapText(CERT_STANDARDS_LEAD, CONTENT_W - 22, font, BODY)
  for (const line of leadLines) {
    drawText(page1, line, MARGIN_X + 22, y, font, BODY)
    y -= LINE
  }
  y -= 6

  for (const standard of standards) {
    const wrapped = wrapText(standard, CONTENT_W - 48, font, BODY)
    wrapped.forEach((line, i) => {
      if (i === 0) drawText(page1, "•", MARGIN_X + 36, y, font, BODY)
      drawText(page1, line, MARGIN_X + 54, y, font, BODY)
      y -= LINE - 1.5
    })
  }

  y -= 8
  drawText(page1, CERT_DOCS_LEAD, MARGIN_X + 22, y, font, BODY)
  y -= LINE + 2
  for (const docLine of documents) {
    drawText(page1, "•", MARGIN_X + 36, y, font, BODY)
    drawText(page1, docLine, MARGIN_X + 54, y, font, BODY)
    y -= LINE
  }

  y -= 14
  drawText(page1, "2.", MARGIN_X, y, fontBold, BODY)
  const catLines = wrapText(CAT_EQUIV, CONTENT_W - 28, font, BODY)
  for (const line of catLines) {
    drawText(page1, line, MARGIN_X + 22, y, font, BODY)
    y -= LINE
  }
  y -= 10
  drawCheckboxRow(page1, font, y, "CAT I", false)
  y -= 22
  drawCheckboxRow(page1, font, y, "CAT II", true)
  y -= 22
  drawCheckboxRow(page1, font, y, "CAT III", false)

  drawFooter(page1, font, 1, 2)

  // ── Page 2 ──────────────────────────────────────────────────────────────
  const page2 = doc.addPage([PAGE_W, PAGE_H])
  await drawLogo(doc, page2)
  drawTitle(page2, fontBold)

  y = PAGE_H - 130
  drawText(page2, "3.", MARGIN_X, y, fontBold, BODY)
  drawText(page2, "Comments are as follows:", MARGIN_X + 22, y, font, BODY)
  y -= 28

  // Comments table
  const commentsTop = y
  const commentsH = 48
  const commentsBottom = commentsTop - commentsH
  const colSplit = MARGIN_X + 120
  page2.drawRectangle({
    x: MARGIN_X,
    y: commentsBottom,
    width: CONTENT_W,
    height: commentsH,
    borderColor: INK,
    borderWidth: HAIRLINE,
  })
  page2.drawLine({
    start: { x: colSplit, y: commentsTop },
    end: { x: colSplit, y: commentsBottom },
    thickness: HAIRLINE,
    color: INK,
  })
  page2.drawLine({
    start: { x: MARGIN_X, y: commentsTop - 20 },
    end: { x: MARGIN_X + CONTENT_W, y: commentsTop - 20 },
    thickness: HAIRLINE,
    color: INK,
  })
  drawText(page2, "Section", MARGIN_X + 10, commentsTop - 14, fontBold, BODY)
  drawText(page2, "Comment", colSplit + 10, commentsTop - 14, fontBold, BODY)
  drawText(page2, "General", MARGIN_X + 10, commentsTop - 36, font, BODY)
  drawText(page2, "Approved with no comments.", colSplit + 10, commentsTop - 36, font, BODY)

  y = commentsBottom - 28
  drawText(page2, "4.", MARGIN_X, y, fontBold, BODY)
  const liabilityLines = wrapText(LIABILITY, CONTENT_W - 28, font, BODY)
  for (const line of liabilityLines) {
    drawText(page2, line, MARGIN_X + 22, y, font, BODY)
    y -= LINE
  }

  y -= 22
  drawText(page2, "Prepared by:", MARGIN_X + 36, y, fontBold, BODY)
  y -= 28

  // Prepared-by block (designer)
  const prepTop = y + 10
  const prepBottom = prepTop - 78
  page2.drawRectangle({
    x: MARGIN_X,
    y: prepBottom,
    width: CONTENT_W,
    height: prepTop - prepBottom,
    borderColor: INK,
    borderWidth: HAIRLINE,
  })
  drawText(page2, "Signed:", MARGIN_X + 12, prepTop - 22, font, BODY)
  drawText(page2, "Date:", MARGIN_X + 270, prepTop - 22, font, BODY)
  drawText(page2, dateStr, MARGIN_X + 310, prepTop - 22, font, BODY)
  drawText(page2, "Designer", MARGIN_X + 12, prepTop - 48, font, BODY)
  drawText(page2, "Name:", MARGIN_X + 12, prepTop - 66, font, BODY)
  drawText(page2, designerName, MARGIN_X + 58, prepTop - 66, fontBold, 12)
  drawText(page2, "Title:", MARGIN_X + 270, prepTop - 66, font, BODY)
  drawText(page2, "Design Engineer", MARGIN_X + 310, prepTop - 66, font, BODY)

  y = prepBottom - 24
  drawText(page2, "Checked by:", MARGIN_X + 36, y, fontBold, BODY)
  y -= 28

  const checkTop = y + 10
  const checkBottom = checkTop - 92
  page2.drawRectangle({
    x: MARGIN_X,
    y: checkBottom,
    width: CONTENT_W,
    height: checkTop - checkBottom,
    borderColor: INK,
    borderWidth: HAIRLINE,
  })
  drawText(page2, "Signed:", MARGIN_X + 12, checkTop - 22, font, BODY)
  drawText(page2, "Date:", MARGIN_X + 270, checkTop - 22, font, BODY)
  drawText(page2, dateStr, MARGIN_X + 310, checkTop - 22, font, BODY)

  // Signature image — no outline, sits after Signed:
  const signatureAsset = await loadSignatureAsset()
  if (signatureAsset) {
    try {
      const image = signatureAsset.isPng
        ? await doc.embedPng(signatureAsset.bytes)
        : await doc.embedJpg(signatureAsset.bytes)
      const maxW = 150
      const maxH = 32
      const ratio = image.width / image.height
      let sigW = maxW
      let sigH = sigW / ratio
      if (sigH > maxH) {
        sigH = maxH
        sigW = sigH * ratio
      }
      page2.drawImage(image, {
        x: MARGIN_X + 70,
        y: checkTop - 28 - sigH * 0.15,
        width: sigW,
        height: sigH,
      })
    } catch {
      // leave blank
    }
  }

  drawText(page2, "Checker", MARGIN_X + 12, checkTop - 54, font, BODY)
  drawText(page2, "Name:", MARGIN_X + 12, checkTop - 74, font, BODY)
  drawText(page2, CHECKER.name, MARGIN_X + 58, checkTop - 74, fontBold, 12)
  drawText(page2, "Title:", MARGIN_X + 270, checkTop - 74, font, BODY)
  drawText(page2, CHECKER.title, MARGIN_X + 310, checkTop - 74, font, BODY)

  drawFooter(page2, font, 2, 2)

  return doc.save()
}

export function cat2ExportFilename(drawingNumber: string): string {
  const safeDrawing = drawingNumber.replace(/[\\/:*?"<>|]/g, "-").trim() || "drawing"
  return `${safeDrawing}-CATII Check Certificate.pdf`
}
