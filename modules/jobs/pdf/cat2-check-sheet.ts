import { PDFDocument, rgb, StandardFonts } from "pdf-lib"
import fs from "node:fs/promises"
import path from "node:path"
import type { JobRow } from "../types/job-types"
import { BRAND_LOGO_DOCUMENT_PATH } from "@/shared/branding/branding"

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 48
const INK = rgb(0, 0, 0)

const CERT_STATEMENT = "I certify that the Temporary Works Design has been checked with the independence specified for design category II and that the loads stated are deemed acceptable by inspection."
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
      // Ignore placeholders/empty files (e.g. 1-byte marker file).
      if (bytes.byteLength < 256) continue
      return { bytes, isPng: filePath.toLowerCase().endsWith(".png") }
    } catch {
      // Try next candidate
    }
  }
  return null
}

export async function buildCat2CheckSheetPdf(job: JobRow): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([PAGE_W, PAGE_H])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)

  // Top-right ORYX wordmark (fixed asset bundled with the app).
  try {
    const logoBytes = await fs.readFile(path.join(process.cwd(), BRAND_LOGO_DOCUMENT_PATH))
    const logo = await doc.embedJpg(logoBytes)
    const logoW = 92.8
    const logoH = 56.9
    const logoX = PAGE_W - MARGIN - logoW
    const logoY = PAGE_H - MARGIN - logoH
    page.drawImage(logo, { x: logoX, y: logoY, width: logoW, height: logoH })
  } catch {
    // Non-fatal: allow export even if the logo asset isn't present in dev.
  }

  let y = PAGE_H - MARGIN
  const CONTENT_W = PAGE_W - (MARGIN * 2)
  const BORDER = 1.1
  const TITLE_BG = rgb(0.95, 0.95, 0.95)

  const drawText = (text: string, x: number, lineY: number, size = 10, bold = false) => {
    page.drawText(text, { x, y: lineY, size, font: bold ? fontBold : font, color: INK })
  }

  const drawLabeledValue = (label: string, value: string, lineY: number) => {
    drawText(label, MARGIN + 8, lineY, 10, true)
    drawText(value, MARGIN + 150, lineY, 10, false)
  }

  const drawSectionHeader = (text: string, topY: number) => {
    page.drawRectangle({ x: MARGIN, y: topY - 18, width: CONTENT_W, height: 18, color: TITLE_BG, borderColor: INK, borderWidth: BORDER })
    drawText(text, MARGIN + 8, topY - 13, 10, true)
  }

  drawText("Oryx Scaffold Design Ltd.", MARGIN, y, 11, false)
  y -= 18
  drawText("TEMPORARY WORKS DESIGN & CHECK SHEET CAT II:", MARGIN, y, 13, true)
  y -= 20

  const works = job.typeOfWorks === "Other" && job.customTypeDescription
    ? `Other - ${job.customTypeDescription}`
    : job.typeOfWorks
  const projectRaw = job.siteAddress?.trim() || job.address
  const project = projectRaw.endsWith(".") ? projectRaw : `${projectRaw}.`

  // Header information block
  const headerTop = y + 8
  const headerBottom = y - 78
  page.drawRectangle({ x: MARGIN, y: headerBottom, width: CONTENT_W, height: headerTop - headerBottom, borderColor: INK, borderWidth: BORDER })
  page.drawLine({ start: { x: MARGIN, y: y - 18 }, end: { x: MARGIN + CONTENT_W, y: y - 18 }, thickness: BORDER, color: INK })
  page.drawLine({ start: { x: MARGIN, y: y - 38 }, end: { x: MARGIN + CONTENT_W, y: y - 38 }, thickness: BORDER, color: INK })
  drawLabeledValue("Design Company:", "Oryx Scaffold Design Ltd.", y - 8)
  drawLabeledValue("Project:", project, y - 28)
  drawLabeledValue("Description of Works:", works || "Not specified", y - 48)
  y = headerBottom - 16

  // Design standards block
  const standards = splitStandards(job.designStandards)
  const standardsLines = standards.length
    ? standards.flatMap((standard) => wrapText(standard, CONTENT_W - 18, font, 10))
    : DEFAULT_STANDARDS
  const standardsHeight = Math.max(70, 26 + (standardsLines.length * 13))
  const standardsBottom = y - standardsHeight
  page.drawRectangle({ x: MARGIN, y: standardsBottom, width: CONTENT_W, height: standardsHeight, borderColor: INK, borderWidth: BORDER })
  drawSectionHeader("Design Standards / Codes of Practise used:", y)
  let standardsY = y - 30
  for (const line of standardsLines) {
    drawText(line, MARGIN + 8, standardsY, 10, false)
    standardsY -= 13
  }
  y = standardsBottom - 14

  // Documents checked block
  const documentsBottom = y - 42
  page.drawRectangle({ x: MARGIN, y: documentsBottom, width: CONTENT_W, height: 42, borderColor: INK, borderWidth: BORDER })
  drawSectionHeader("Documents Checked:", y)
  drawText(job.drawingNumber, MARGIN + 8, y - 34, 10, false)
  y = documentsBottom - 16

  // Certification statement block
  const certLines = wrapText(CERT_STATEMENT, CONTENT_W - 16, font, 10)
  const certHeight = 26 + (certLines.length * 13)
  const certBottom = y - certHeight
  page.drawRectangle({ x: MARGIN, y: certBottom, width: CONTENT_W, height: certHeight, borderColor: INK, borderWidth: BORDER })
  drawSectionHeader("Certification:", y)
  let certY = y - 30
  for (const line of certLines) {
    drawText(line, MARGIN + 8, certY, 10, false)
    certY -= 13
  }
  y = certBottom - 14

  // Sign-off block
  const signOffBottom = y - 124
  page.drawRectangle({ x: MARGIN, y: signOffBottom, width: CONTENT_W, height: 124, borderColor: INK, borderWidth: BORDER })
  drawSectionHeader("Checked By:", y)
  drawLabeledValue("Name:", CHECKER.name, y - 30)
  drawText("Signature:", MARGIN + 8, y - 50, 10, true)
  page.drawRectangle({ x: MARGIN + 150, y: y - 66, width: 170, height: 40, borderColor: INK, borderWidth: 0.8 })

  const signatureY = y - 44
  const signatureAsset = await loadSignatureAsset()
  if (signatureAsset) {
    try {
      const image = signatureAsset.isPng
        ? await doc.embedPng(signatureAsset.bytes)
        : await doc.embedJpg(signatureAsset.bytes)
      page.drawImage(image, { x: MARGIN + 154, y: signatureY - 6, width: 162, height: 34 })
    } catch {
      // Keep blank signature box if image parse fails.
    }
  }

  drawLabeledValue("Position held:", CHECKER.positionHeld, y - 70)
  drawLabeledValue("Name of Design Consultants:", "Oryx Scaffold Designs Ltd", y - 90)
  y = signOffBottom - 16

  const completedAt = job.dateCompleted ? new Date(job.dateCompleted) : new Date()
  drawText(`Date: ${completedAt.toLocaleDateString("en-GB")}`, MARGIN, y, 10, false)

  page.drawText("-- 1 of 1 --", {
    x: PAGE_W / 2 - 24,
    y: 22,
    size: 8,
    font,
    color: rgb(0.45, 0.45, 0.45),
  })

  return doc.save()
}

export function cat2ExportFilename(drawingNumber: string): string {
  const safeDrawing = drawingNumber.replace(/[\\/:*?"<>|]/g, "-").trim() || "drawing"
  return `${safeDrawing}-CATII Check Certificate.pdf`
}
