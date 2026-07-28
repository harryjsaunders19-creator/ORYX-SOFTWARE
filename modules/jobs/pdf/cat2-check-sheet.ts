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
  let y = PAGE_H - MARGIN

  const drawLine = (text: string, size = 10, bold = false, x = MARGIN) => {
    page.drawText(text, { x, y, size, font: bold ? fontBold : font, color: INK })
    y -= size + 5
  }

  drawLine("Oryx Scaffold Design Ltd.", 11, false)
  drawLine("TEMPORARY WORKS DESIGN & CHECK SHEET CAT II:", 13, true)
  y -= 4

  drawLine("Design Company: ORYX Scaffold Design Ltd", 10, false)
  y -= 3

  drawLine(`Project: ${job.siteAddress?.trim() || job.address}`, 10, false)
  y -= 3

  const works = job.typeOfWorks === "Other" && job.customTypeDescription
    ? `Other - ${job.customTypeDescription}`
    : job.typeOfWorks
  drawLine(`Description of Works: ${works || "Not specified"}`, 10, false)
  y -= 6

  drawLine("Design Standards / Codes of Practise used:", 10, false)
  const standards = splitStandards(job.designStandards)
  if (!standards.length) {
    drawLine("Not specified in job record.", 10, false)
  } else {
    for (const standard of standards) {
      const wrapped = wrapText(standard, PAGE_W - MARGIN * 2, font, 10)
      for (const line of wrapped) drawLine(line, 10, false)
    }
  }
  y -= 6

  drawLine("Documents Checked:", 10, false)
  drawLine("List of drawings & documents used to check the design:", 10, false)
  drawLine(job.drawingNumber, 10, false)
  y -= 6

  const certLines = wrapText(CERT_STATEMENT, PAGE_W - MARGIN * 2, font, 10)
  for (const line of certLines) drawLine(line, 10, false)
  y -= 6

  drawLine(`Name: ${CHECKER.name}`, 10, false)
  drawLine("Signature:", 10, false)

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

  y = signatureY - 28
  drawLine(`Position held: ${CHECKER.positionHeld}`, 10, false)
  drawLine("Name of Design Consultants: ORYX Scaffold Design Ltd", 10, false)
  drawLine(`Date: ${new Date().toLocaleDateString("en-GB")}`, 10, false)

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
