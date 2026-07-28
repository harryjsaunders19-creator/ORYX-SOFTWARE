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

  const drawLine = (text: string, size = 10, bold = false, x = MARGIN) => {
    page.drawText(text, { x, y, size, font: bold ? fontBold : font, color: INK })
    y -= size + 5
  }

  drawLine("Oryx Scaffold Design Ltd.", 11, false)
  drawLine("TEMPORARY WORKS DESIGN & CHECK SHEET CAT II:", 13, true)
  y -= 4

  drawLine("Design Company: Oryx Scaffold Design Ltd.", 10, false)
  y -= 3

  const projectRaw = job.siteAddress?.trim() || job.address
  const project = projectRaw.endsWith(".") ? projectRaw : `${projectRaw}.`
  drawLine(`Project: ${project}`, 10, false)
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
  drawLine(job.drawingNumber, 10, false)
  y -= 6

  const certLines = wrapText(CERT_STATEMENT, PAGE_W - MARGIN * 2, font, 10)
  for (const line of certLines) drawLine(line, 10, false)
  y -= 6

  drawLine(`Name: ${CHECKER.name}`, 10, false)
  drawLine("Signature:", 10, false)

  const signatureY = y - 8
  try {
    const bytes = await fs.readFile(CHECKER.signaturePath)
    const image = CHECKER.signaturePath.toLowerCase().endsWith(".png")
      ? await doc.embedPng(bytes)
      : await doc.embedJpg(bytes)
    page.drawImage(image, { x: MARGIN + 85, y: signatureY - 16, width: 140, height: 40 })
  } catch {
    // If the fixed signature asset isn't provisioned yet, keep the signature
    // area blank (so the PDF still matches the template structure).
  }

  y = signatureY - 28
  drawLine(`Position held: ${CHECKER.positionHeld}`, 10, false)
  drawLine("Name of Design Consultants: Oryx Scaffold Designs Ltd", 10, false)

  const completedAt = job.dateCompleted ? new Date(job.dateCompleted) : new Date()
  drawLine(`Date: ${completedAt.toLocaleDateString("en-GB")}`, 10, false)

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
