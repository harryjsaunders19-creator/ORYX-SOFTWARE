import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import fs from "node:fs/promises"
import path from "node:path"
import type { JobRow } from "../types/job-types"
import { BRAND_LOGO_DOCUMENT_PATH } from "@/shared/branding/branding"

const PAGE_W = 595.32
const PAGE_H = 841.92
const MARGIN_X = 48
const CONTENT_W = PAGE_W - MARGIN_X * 2
const CONTENT_RIGHT = MARGIN_X + CONTENT_W

const INK = rgb(0.08, 0.09, 0.1)
const LABEL = rgb(0.42, 0.44, 0.46)
const MUTED = rgb(0.38, 0.4, 0.42)
const RULE = rgb(0.82, 0.83, 0.84)
const RULE_STRONG = rgb(0.55, 0.57, 0.59)
const PANEL = rgb(0.965, 0.968, 0.972)
const ACCENT = rgb(0.12, 0.14, 0.16)

const TITLE_SIZE = 20
const SECTION_SIZE = 12
const BODY = 10.5
const LABEL_SIZE = 9
const FOOTER_SIZE = 8
const LINE = 13.2

/** Existing certificate content — wording preserved. */
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

const UNCONTROLLED_COPY =
  "This certificate is only valid when viewed at the latest revision in the Oryx Document Management System. Printed or downloaded copies may become uncontrolled if subsequent revisions are issued."

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

type Fonts = {
  regular: PDFFont
  bold: PDFFont
  italic: PDFFont
}

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color = INK,
) {
  page.drawText(text, { x, y, size, font, color })
}

function drawRule(page: PDFPage, y: number, color = RULE, fromX = MARGIN_X, toX = CONTENT_RIGHT) {
  page.drawLine({
    start: { x: fromX, y },
    end: { x: toX, y },
    thickness: 0.6,
    color,
  })
}

function drawSectionHeading(page: PDFPage, title: string, y: number, fonts: Fonts): number {
  // Accent tick + heading
  page.drawRectangle({
    x: MARGIN_X,
    y: y - 1,
    width: 2.2,
    height: 11,
    color: ACCENT,
  })
  drawText(page, title, MARGIN_X + 10, y, fonts.bold, SECTION_SIZE, INK)
  return y - 16
}

function drawParagraph(
  page: PDFPage,
  text: string,
  y: number,
  fonts: Fonts,
  opts?: { size?: number; color?: ReturnType<typeof rgb>; width?: number },
): number {
  const size = opts?.size ?? BODY
  const color = opts?.color ?? INK
  const width = opts?.width ?? CONTENT_W
  const lines = wrapText(text, width, fonts.regular, size)
  for (const line of lines) {
    drawText(page, line, MARGIN_X, y, fonts.regular, size, color)
    y -= LINE
  }
  return y
}

function drawMetaItem(
  page: PDFPage,
  label: string,
  value: string,
  x: number,
  y: number,
  fonts: Fonts,
  valueWidth: number,
): number {
  drawText(page, label.toUpperCase(), x, y, fonts.regular, LABEL_SIZE, LABEL)
  y -= 12
  const lines = wrapText(value, valueWidth, fonts.bold, BODY)
  for (const line of lines) {
    drawText(page, line, x, y, fonts.bold, BODY, INK)
    y -= LINE
  }
  return y
}

export async function buildCat2CheckSheetPdf(job: JobRow): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)

  const [regularBytes, boldBytes] = await Promise.all([
    fs.readFile(path.join(process.cwd(), "public", "fonts", "LiberationSans-Regular.ttf")),
    fs.readFile(path.join(process.cwd(), "public", "fonts", "LiberationSans-Bold.ttf")),
  ])
  const fonts: Fonts = {
    regular: await doc.embedFont(regularBytes),
    bold: await doc.embedFont(boldBytes),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
  }

  const page = doc.addPage([PAGE_W, PAGE_H])

  const works = job.typeOfWorks === "Other" && job.customTypeDescription
    ? `Other - ${job.customTypeDescription}`
    : (job.typeOfWorks || "Scaffold")
  const project = (job.siteName?.trim() || job.siteAddress?.trim() || job.address || "Not specified")
    .replace(/\.$/, "")
  const documentRef = cat2ExportFilename(job.drawingNumber)
  const revision = (job.revisionLetter ?? "").trim() || "—"
  const standards = splitStandards(job.designStandards)
  const completedAt = job.dateCompleted ? new Date(job.dateCompleted) : new Date()
  const issueDate = completedAt.toLocaleDateString("en-GB")
  const documents = [`${job.drawingNumber} — Scaffold design`]

  // ── Header ──────────────────────────────────────────────────────────────
  let logo: PDFImage | null = null
  let logoW = 0
  let logoH = 0
  try {
    const logoBytes = await fs.readFile(path.join(process.cwd(), BRAND_LOGO_DOCUMENT_PATH))
    logo = await doc.embedJpg(logoBytes)
    logoW = 108
    logoH = logoW * (logo.height / logo.width)
    page.drawImage(logo, {
      x: CONTENT_RIGHT - logoW,
      y: PAGE_H - 26 - logoH,
      width: logoW,
      height: logoH,
    })
  } catch {
    // non-fatal
  }

  const headerCenterY = logo
    ? PAGE_H - 26 - logoH / 2
    : PAGE_H - 58
  const title = "Temporary Works Design Certificate"
  const titleBaseline = headerCenterY - TITLE_SIZE * 0.32
  drawText(page, title, MARGIN_X, titleBaseline, fonts.bold, TITLE_SIZE, INK)

  // Document control row under title
  let y = Math.min(titleBaseline - 22, (logo ? PAGE_H - 26 - logoH : PAGE_H - 70) - 10)
  const controlGap = 18
  const controlItems: [string, string][] = [
    ["Document Reference", documentRef],
    ["Revision", revision],
    ["Issue Date", issueDate],
  ]
  let cx = MARGIN_X
  for (const [label, value] of controlItems) {
    drawText(page, label.toUpperCase(), cx, y, fonts.regular, 7.5, LABEL)
    const valueSize = 9
    drawText(page, value, cx, y - 12, fonts.bold, valueSize, INK)
    const colW = Math.max(
      fonts.regular.widthOfTextAtSize(label.toUpperCase(), 7.5),
      fonts.bold.widthOfTextAtSize(value, valueSize),
    ) + controlGap
    cx += Math.min(colW + 28, 210)
  }

  y -= 26
  drawRule(page, y, RULE_STRONG)
  y -= 22

  // ── Project information (two-column metadata) ───────────────────────────
  const colW = (CONTENT_W - 28) / 2
  const leftX = MARGIN_X
  const rightX = MARGIN_X + colW + 28
  const metaTop = y
  const leftBottom = drawMetaItem(page, "Project", project.toUpperCase(), leftX, metaTop, fonts, colW)
  drawMetaItem(page, "Type of Works", works.toUpperCase(), leftX, leftBottom - 8, fonts, colW)
  const rightBottom = drawMetaItem(page, "Design Org. Originator", "ORYX SCAFFOLD DESIGN LTD.", rightX, metaTop, fonts, colW)
  drawMetaItem(page, "Document Ref", documentRef, rightX, rightBottom - 8, fonts, colW)

  y = Math.min(leftBottom, rightBottom) - 40
  drawRule(page, y + 18)

  // ── Certification Statement ─────────────────────────────────────────────
  y = drawSectionHeading(page, "Certification Statement", y, fonts)
  y = drawParagraph(page, CERT_INTRO, y, fonts)
  y -= 14

  // ── Applicable Standards ────────────────────────────────────────────────
  y = drawSectionHeading(page, "Applicable Standards", y, fonts)
  y = drawParagraph(page, CERT_STANDARDS_LEAD, y, fonts)
  y -= 4
  const stdWidth = CONTENT_W - 14
  for (const standard of standards) {
    drawText(page, "–", MARGIN_X, y, fonts.regular, BODY, MUTED)
    const wrapped = wrapText(standard, stdWidth, fonts.regular, BODY)
    for (const line of wrapped) {
      drawText(page, line, MARGIN_X + 14, y, fonts.regular, BODY, INK)
      y -= LINE - 0.8
    }
  }
  y -= 12

  // ── Referenced Documents ────────────────────────────────────────────────
  y = drawSectionHeading(page, "Referenced Documents", y, fonts)
  y = drawParagraph(page, CERT_DOCS_LEAD, y, fonts)
  y -= 3
  for (const docLine of documents) {
    drawText(page, "–", MARGIN_X, y, fonts.regular, BODY, MUTED)
    drawText(page, docLine, MARGIN_X + 14, y, fonts.regular, BODY, INK)
    y -= LINE
  }
  y -= 12

  // ── Comments ────────────────────────────────────────────────────────────
  y = drawSectionHeading(page, "Comments", y, fonts)
  drawText(page, "Comments are as follows:", MARGIN_X, y, fonts.regular, BODY, INK)
  y -= 16

  const panelH = 44
  const panelBottom = y - panelH
  page.drawRectangle({
    x: MARGIN_X,
    y: panelBottom,
    width: CONTENT_W,
    height: panelH,
    color: PANEL,
  })
  page.drawRectangle({
    x: MARGIN_X,
    y: panelBottom,
    width: 2.5,
    height: panelH,
    color: ACCENT,
  })
  drawText(page, "SECTION", MARGIN_X + 14, y - 14, fonts.regular, 7.5, LABEL)
  drawText(page, "General", MARGIN_X + 14, y - 28, fonts.bold, BODY, INK)
  drawText(page, "COMMENT", MARGIN_X + 150, y - 14, fonts.regular, 7.5, LABEL)
  drawText(page, "Approved with no comments.", MARGIN_X + 150, y - 28, fonts.bold, BODY, INK)
  y = panelBottom - 14

  // Existing liability wording (unchanged)
  y = drawParagraph(page, LIABILITY, y, fonts, { color: MUTED, size: 10 })
  y -= 14

  // ── Approval ────────────────────────────────────────────────────────────
  y = drawSectionHeading(page, "Approval", y, fonts)
  drawText(page, "Checked by", MARGIN_X, y, fonts.regular, LABEL_SIZE, LABEL)
  y -= 14

  // Clean approval grid — subtle rules only
  const approvalTop = y + 4
  const approvalBottom = approvalTop - 88
  drawRule(page, approvalTop, RULE)
  drawRule(page, approvalBottom, RULE)

  // Column guides
  const col1 = MARGIN_X
  const col2 = MARGIN_X + 210
  const col3 = MARGIN_X + 380

  drawText(page, "NAME", col1, approvalTop - 14, fonts.regular, 7.5, LABEL)
  drawText(page, CHECKER.name, col1, approvalTop - 28, fonts.bold, 11, INK)

  drawText(page, "POSITION", col2, approvalTop - 14, fonts.regular, 7.5, LABEL)
  drawText(page, CHECKER.title, col2, approvalTop - 28, fonts.bold, 11, INK)

  drawText(page, "DATE", col3, approvalTop - 14, fonts.regular, 7.5, LABEL)
  drawText(page, issueDate, col3, approvalTop - 28, fonts.bold, 11, INK)

  drawText(page, "SIGNATURE", col1, approvalTop - 48, fonts.regular, 7.5, LABEL)

  const signatureAsset = await loadSignatureAsset()
  if (signatureAsset) {
    try {
      const image = signatureAsset.isPng
        ? await doc.embedPng(signatureAsset.bytes)
        : await doc.embedJpg(signatureAsset.bytes)
      const maxW = 160
      const maxH = 30
      const ratio = image.width / image.height
      let sigW = maxW
      let sigH = sigW / ratio
      if (sigH > maxH) {
        sigH = maxH
        sigW = sigH * ratio
      }
      page.drawImage(image, {
        x: col1,
        y: approvalBottom + 8,
        width: sigW,
        height: sigH,
      })
    } catch {
      // leave blank signature space
    }
  }

  // ── Footer ──────────────────────────────────────────────────────────────
  const footerTop = 62
  drawRule(page, footerTop, RULE_STRONG)

  drawText(page, "Oryx Scaffold Design Ltd", MARGIN_X, footerTop - 14, fonts.regular, FOOTER_SIZE, MUTED)
  drawText(page, documentRef, MARGIN_X, footerTop - 26, fonts.regular, FOOTER_SIZE, MUTED)
  drawText(page, `Revision ${revision}`, MARGIN_X + 280, footerTop - 14, fonts.regular, FOOTER_SIZE, MUTED)
  drawText(page, "Page 1 of 1", CONTENT_RIGHT - fonts.regular.widthOfTextAtSize("Page 1 of 1", FOOTER_SIZE), footerTop - 14, fonts.regular, FOOTER_SIZE, MUTED)

  const disclaimerLines = wrapText(UNCONTROLLED_COPY, CONTENT_W, fonts.italic, 7)
  let dy = footerTop - 40
  for (const line of disclaimerLines) {
    drawText(page, line, MARGIN_X, dy, fonts.italic, 7, LABEL)
    dy -= 9
  }

  return doc.save()
}
