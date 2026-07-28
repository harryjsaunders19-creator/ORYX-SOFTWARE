import { PDFDocument, rgb, StandardFonts } from "pdf-lib"
import fs from "node:fs/promises"
import path from "node:path"
import type { JobRow } from "../types/job-types"
import { BRAND_LOGO_DOCUMENT_PATH } from "@/shared/branding/branding"

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 42
const INK = rgb(0, 0, 0)
const MUTED = rgb(0.42, 0.42, 0.42)
const HAIRLINE = 0.4

const CERT_STATEMENT =
  "I certify that the Temporary Works Design has been checked with the independence specified for design category II and that the loads stated are deemed acceptable by inspection."

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
  positionHeld: "Principle Engineer",
  consultants: "Oryx Scaffold Designs Ltd",
}

function wrapText(text: string, width: number, font: import("pdf-lib").PDFFont, size: number): string[] {
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
      // try next candidate
    }
  }
  return null
}

export async function buildCat2CheckSheetPdf(job: JobRow): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([PAGE_W, PAGE_H])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)

  const CONTENT_W = PAGE_W - MARGIN * 2
  const LABEL_W = 148
  const VALUE_X = MARGIN + LABEL_W
  const PAD = 10
  const BODY = 9.5
  const LINE = 13

  // Logo flush to the top-right page corner (outside body margin).
  try {
    const logoBytes = await fs.readFile(path.join(process.cwd(), BRAND_LOGO_DOCUMENT_PATH))
    const logo = await doc.embedJpg(logoBytes)
    const logoInset = 18
    const logoW = 78
    const logoH = logoW * (logo.height / logo.width)
    page.drawImage(logo, {
      x: PAGE_W - logoInset - logoW,
      y: PAGE_H - logoInset - logoH,
      width: logoW,
      height: logoH,
    })
  } catch {
    // Non-fatal if logo asset is missing in local/dev.
  }

  let y = PAGE_H - 28

  const drawText = (text: string, x: number, lineY: number, size = BODY, bold = false, color = INK) => {
    page.drawText(text, { x, y: lineY, size, font: bold ? fontBold : font, color })
  }

  const drawBox = (bottom: number, height: number) => {
    page.drawRectangle({
      x: MARGIN,
      y: bottom,
      width: CONTENT_W,
      height,
      borderColor: INK,
      borderWidth: HAIRLINE,
    })
  }

  const drawHRule = (atY: number) => {
    page.drawLine({
      start: { x: MARGIN, y: atY },
      end: { x: MARGIN + CONTENT_W, y: atY },
      thickness: HAIRLINE,
      color: INK,
    })
  }

  const drawSectionTitle = (title: string, topY: number) => {
    const h = 16
    // Fill only — outer section box already provides the border.
    page.drawRectangle({
      x: MARGIN + HAIRLINE / 2,
      y: topY - h,
      width: CONTENT_W - HAIRLINE,
      height: h,
      color: rgb(0.97, 0.97, 0.97),
    })
    page.drawLine({
      start: { x: MARGIN, y: topY - h },
      end: { x: MARGIN + CONTENT_W, y: topY - h },
      thickness: HAIRLINE,
      color: INK,
    })
    drawText(title, MARGIN + PAD, topY - 11.5, 9, true)
    return h
  }

  const drawLabeledRow = (label: string, value: string, rowY: number, valueWidth = CONTENT_W - LABEL_W - PAD * 2) => {
    drawText(label, MARGIN + PAD, rowY, BODY, true)
    const wrapped = wrapText(value, valueWidth, font, BODY)
    let vy = rowY
    for (const line of wrapped) {
      drawText(line, VALUE_X, vy, BODY, false)
      vy -= LINE
    }
    return Math.max(1, wrapped.length)
  }

  // Title (leave room for logo on the right)
  drawText("Oryx Scaffold Design Ltd.", MARGIN, y, 10.5, false)
  y -= 16
  drawText("TEMPORARY WORKS DESIGN & CHECK SHEET CAT II:", MARGIN, y, 12, true)
  y -= 18

  const works = job.typeOfWorks === "Other" && job.customTypeDescription
    ? `Other - ${job.customTypeDescription}`
    : (job.typeOfWorks || "Not specified")
  const projectRaw = job.siteAddress?.trim() || job.address
  const project = projectRaw.endsWith(".") ? projectRaw : `${projectRaw}.`

  // Project info panel
  const infoTop = y
  const infoRows = [
    ["Design Company:", "Oryx Scaffold Design Ltd."],
    ["Project:", project],
    ["Description of Works:", works],
  ] as const
  let infoCursor = infoTop - 14
  const infoRowHeights: number[] = []
  for (const [label, value] of infoRows) {
    const lines = drawLabeledRow(label, value, infoCursor)
    infoRowHeights.push(lines)
    infoCursor -= lines * LINE + 4
  }
  const infoBottom = infoCursor + 6
  drawBox(infoBottom, infoTop - infoBottom)
  // Internal dividers between the three rows
  let dividerY = infoTop - (infoRowHeights[0]! * LINE + 8)
  drawHRule(dividerY)
  dividerY -= infoRowHeights[1]! * LINE + 8
  drawHRule(dividerY)
  y = infoBottom - 12

  // Standards panel
  const standards = splitStandards(job.designStandards)
  const standardsLines = standards.flatMap(s => wrapText(s, CONTENT_W - PAD * 2, font, BODY))
  const titleH = 16
  const standardsBodyH = 10 + standardsLines.length * LINE
  const standardsH = titleH + standardsBodyH
  const standardsBottom = y - standardsH
  drawBox(standardsBottom, standardsH)
  drawSectionTitle("Design Standards / Codes of Practise used:", y)
  let sy = y - titleH - 12
  for (const line of standardsLines) {
    drawText(line, MARGIN + PAD, sy, BODY, false)
    sy -= LINE
  }
  y = standardsBottom - 12

  // Documents checked
  const docsH = titleH + 22
  const docsBottom = y - docsH
  drawBox(docsBottom, docsH)
  drawSectionTitle("Documents Checked:", y)
  drawText(job.drawingNumber, MARGIN + PAD, y - titleH - 14, BODY, false)
  y = docsBottom - 12

  // Certification
  const certLines = wrapText(CERT_STATEMENT, CONTENT_W - PAD * 2, font, BODY)
  const certH = titleH + 10 + certLines.length * LINE
  const certBottom = y - certH
  drawBox(certBottom, certH)
  drawSectionTitle("Certification:", y)
  let cy = y - titleH - 12
  for (const line of certLines) {
    drawText(line, MARGIN + PAD, cy, BODY, false)
    cy -= LINE
  }
  y = certBottom - 12

  // Checked-by / signature panel
  const signTop = y
  const signH = titleH + 118
  const signBottom = signTop - signH
  drawBox(signBottom, signH)
  drawSectionTitle("Checked By:", signTop)

  const nameY = signTop - titleH - 14
  drawLabeledRow("Name:", CHECKER.name, nameY)

  // Signature row — image sits on the value column, no outline box
  const sigLabelY = nameY - 26
  drawText("Signature:", MARGIN + PAD, sigLabelY, BODY, true)

  const signatureAsset = await loadSignatureAsset()
  if (signatureAsset) {
    try {
      const image = signatureAsset.isPng
        ? await doc.embedPng(signatureAsset.bytes)
        : await doc.embedJpg(signatureAsset.bytes)
      const maxW = 170
      const maxH = 34
      const ratio = image.width / image.height
      let sigW = maxW
      let sigH = sigW / ratio
      if (sigH > maxH) {
        sigH = maxH
        sigW = sigH * ratio
      }
      // Center the glyph on the Signature label baseline (no border).
      const sigX = VALUE_X
      const sigY = sigLabelY - sigH * 0.42
      page.drawImage(image, { x: sigX, y: sigY, width: sigW, height: sigH })
    } catch {
      // Leave blank if parse fails.
    }
  }

  const posY = sigLabelY - 40
  drawLabeledRow("Position held:", CHECKER.positionHeld, posY)
  const consY = posY - 18
  drawLabeledRow("Name of Design Consultants:", CHECKER.consultants, consY)

  const completedAt = job.dateCompleted ? new Date(job.dateCompleted) : new Date()
  const dateY = consY - 18
  drawLabeledRow("Date:", completedAt.toLocaleDateString("en-GB"), dateY)

  page.drawText("-- 1 of 1 --", {
    x: PAGE_W / 2 - font.widthOfTextAtSize("-- 1 of 1 --", 8) / 2,
    y: 18,
    size: 8,
    font,
    color: MUTED,
  })

  return doc.save()
}

export function cat2ExportFilename(drawingNumber: string): string {
  const safeDrawing = drawingNumber.replace(/[\\/:*?"<>|]/g, "-").trim() || "drawing"
  return `${safeDrawing}-CATII Check Certificate.pdf`
}
