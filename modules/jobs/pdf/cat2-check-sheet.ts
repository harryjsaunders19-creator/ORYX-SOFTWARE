import { PDFDocument, rgb, StandardFonts } from "pdf-lib"
import fs from "node:fs/promises"
import path from "node:path"
import type { JobRow } from "../types/job-types"

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 48
const INK = rgb(0, 0, 0)

const CERT_STATEMENT = "I certify that the Temporary Works Design has been checked with the independence specified for design category II and that the loads stated are deemed acceptable by inspection."

const CHECKER = {
  name: "Lee Saunders",
  // Update this to the exact title from the client reference sheet if needed.
  positionHeld: "Temporary Works Design Checker",
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
  let y = PAGE_H - MARGIN

  const drawLine = (text: string, size = 10, bold = false, x = MARGIN) => {
    page.drawText(text, { x, y, size, font: bold ? fontBold : font, color: INK })
    y -= size + 5
  }

  drawLine("CAT II TEMPORARY WORKS DESIGN CHECK SHEET", 14, true)
  y -= 4

  drawLine("Design Company:", 10, true)
  drawLine("ORYX Scaffold Design Ltd", 10, false, MARGIN + 12)
  y -= 3

  drawLine("Project:", 10, true)
  drawLine(job.siteAddress?.trim() || job.address, 10, false, MARGIN + 12)
  y -= 3

  const works = job.typeOfWorks === "Other" && job.customTypeDescription
    ? `Other - ${job.customTypeDescription}`
    : job.typeOfWorks
  drawLine("Description of Works:", 10, true)
  drawLine(works || "Not specified", 10, false, MARGIN + 12)
  y -= 6

  drawLine("Design Standards and Codes of Practice:", 10, true)
  const standards = splitStandards(job.designStandards)
  if (!standards.length) {
    drawLine("- Not specified in job record", 10, false, MARGIN + 12)
  } else {
    for (const standard of standards) {
      const wrapped = wrapText(`- ${standard}`, PAGE_W - (MARGIN + 24) - MARGIN, font, 10)
      for (const line of wrapped) drawLine(line, 10, false, MARGIN + 12)
    }
  }
  y -= 6

  drawLine("Documents Checked:", 10, true)
  drawLine(job.drawingNumber, 10, false, MARGIN + 12)
  y -= 8

  drawLine("Certification Statement:", 10, true)
  const certLines = wrapText(CERT_STATEMENT, PAGE_W - (MARGIN + 12) - MARGIN, font, 10)
  for (const line of certLines) drawLine(line, 10, false, MARGIN + 12)
  y -= 8

  drawLine("Checker Details:", 10, true)
  drawLine(`Name: ${CHECKER.name}`, 10, false, MARGIN + 12)
  drawLine(`Position Held: ${CHECKER.positionHeld}`, 10, false, MARGIN + 12)
  drawLine("Signature:", 10, false, MARGIN + 12)

  const signatureY = y - 8
  let signaturePlaced = false
  try {
    const bytes = await fs.readFile(CHECKER.signaturePath)
    const image = CHECKER.signaturePath.toLowerCase().endsWith(".png")
      ? await doc.embedPng(bytes)
      : await doc.embedJpg(bytes)
    page.drawImage(image, { x: MARGIN + 85, y: signatureY - 16, width: 140, height: 40 })
    signaturePlaced = true
  } catch {
    // Fall back to typed signature text when the fixed asset is not yet provisioned.
  }
  if (!signaturePlaced) {
    page.drawText(CHECKER.name, {
      x: MARGIN + 85,
      y: signatureY,
      size: 14,
      font: fontBold,
      color: rgb(0.2, 0.2, 0.2),
    })
  }

  const generatedAt = new Date().toISOString()
  page.drawText(`Generated: ${generatedAt}`, {
    x: MARGIN,
    y: MARGIN - 6,
    size: 8,
    font,
    color: rgb(0.35, 0.35, 0.35),
  })

  return doc.save()
}

export function cat2ExportFilename(drawingNumber: string): string {
  const safeDrawing = drawingNumber.replace(/[\\/:*?"<>|]/g, "-").trim() || "drawing"
  return `${safeDrawing}-CATII Check Certificate.pdf`
}
