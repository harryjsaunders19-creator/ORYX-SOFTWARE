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

const CHECKER = {
  name: "Lee Saunders",
  positionHeld: "Principle Engineer",
  signaturePath: process.env.CAT2_CHECK_SIGNATURE_PATH || path.join(process.cwd(), "private-assets", "cat2-signature.png"),
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
  return (text ?? "")
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean)
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

  const drawText = (text: string, x: number, lineY: number, size = 10, bold = false) => {
    page.drawText(text, { x, y: lineY, size, font: bold ? fontBold : font, color: INK })
  }

  const drawLabeledValue = (label: string, value: string, lineY: number) => {
    drawText(label, MARGIN + 8, lineY, 10, true)
    drawText(value, MARGIN + 150, lineY, 10, false)
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
  page.drawRectangle({ x: MARGIN, y: headerBottom, width: CONTENT_W, height: headerTop - headerBottom, borderColor: INK, borderWidth: 1 })
  drawLabeledValue("Design Company:", "Oryx Scaffold Design Ltd.", y - 8)
  drawLabeledValue("Project:", project, y - 28)
  drawLabeledValue("Description of Works:", works || "Not specified", y - 48)
  y = headerBottom - 16

  // Design standards block
  const standards = splitStandards(job.designStandards)
  const standardsLines = standards.length
    ? standards.flatMap((standard) => wrapText(standard, CONTENT_W - 18, font, 10))
    : ["Not specified in job record."]
  const standardsHeight = Math.max(56, 24 + (standardsLines.length * 13))
  const standardsBottom = y - standardsHeight
  page.drawRectangle({ x: MARGIN, y: standardsBottom, width: CONTENT_W, height: standardsHeight, borderColor: INK, borderWidth: 1 })
  drawText("Design Standards / Codes of Practise used:", MARGIN + 8, y - 16, 10, true)
  let standardsY = y - 34
  for (const line of standardsLines) {
    drawText(line, MARGIN + 8, standardsY, 10, false)
    standardsY -= 13
  }
  y = standardsBottom - 14

  // Documents checked block
  const documentsBottom = y - 42
  page.drawRectangle({ x: MARGIN, y: documentsBottom, width: CONTENT_W, height: 42, borderColor: INK, borderWidth: 1 })
  drawText("Documents Checked:", MARGIN + 8, y - 16, 10, true)
  drawText(job.drawingNumber, MARGIN + 150, y - 16, 10, false)
  y = documentsBottom - 16

  // Certification statement block
  const certLines = wrapText(CERT_STATEMENT, CONTENT_W - 16, font, 10)
  const certHeight = 24 + (certLines.length * 13)
  const certBottom = y - certHeight
  page.drawRectangle({ x: MARGIN, y: certBottom, width: CONTENT_W, height: certHeight, borderColor: INK, borderWidth: 1 })
  let certY = y - 16
  for (const line of certLines) {
    drawText(line, MARGIN + 8, certY, 10, false)
    certY -= 13
  }
  y = certBottom - 14

  // Sign-off block
  const signOffBottom = y - 110
  page.drawRectangle({ x: MARGIN, y: signOffBottom, width: CONTENT_W, height: 110, borderColor: INK, borderWidth: 1 })
  drawLabeledValue("Name:", CHECKER.name, y - 16)
  drawText("Signature:", MARGIN + 8, y - 36, 10, true)

  const signatureY = y - 44
  try {
    const bytes = await fs.readFile(CHECKER.signaturePath)
    const image = CHECKER.signaturePath.toLowerCase().endsWith(".png")
      ? await doc.embedPng(bytes)
      : await doc.embedJpg(bytes)
    page.drawImage(image, { x: MARGIN + 150, y: signatureY - 8, width: 160, height: 46 })
  } catch {
    // If the fixed signature asset isn't provisioned yet, keep the signature
    // area blank (so the PDF still matches the template structure).
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
