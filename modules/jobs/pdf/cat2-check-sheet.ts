import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import fs from "node:fs/promises"
import path from "node:path"
import type { JobRow } from "../types/job-types"
import { BRAND_LOGO_DOCUMENT_PATH } from "@/shared/branding/branding"
import { worksTypeDisplayLabel } from "@/lib/constants"
import { baseDrawingNumber } from "@/lib/revision-chain"

const PAGE_W = 595.32
const PAGE_H = 841.92
const MARGIN_X = 44
const CONTENT_W = PAGE_W - MARGIN_X * 2
const CONTENT_RIGHT = MARGIN_X + CONTENT_W

/** ISO-style neutral palette */
const CHARCOAL = rgb(0.184, 0.184, 0.184) // #2F2F2F
const GREY = rgb(0.4, 0.4, 0.4) // #666666
const RULE = rgb(0.851, 0.851, 0.851) // #D9D9D9
const PANEL = rgb(0.961, 0.961, 0.961) // #F5F5F5
const INK = CHARCOAL
const LABEL = GREY

const TITLE = 20
const SECTION = 10
const BODY = 10
const LINE = 13

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
  title: "Principal Engineer",
}

const CERT_INTRO =
  "We certify that we have used reasonable professional skill and care in preparing and/or checking the temporary works design for the above section of the project."

const CERT_STANDARDS_LEAD =
  "The designs have been prepared and/or checked in accordance with the following codes and standards:"

const CERT_DOCS_LEAD = "The following documents describe and detail the design:"

const LIABILITY =
  "Nothing in this certificate shall impose upon us any greater liability than the exercise of reasonable professional skill, care and diligence."

const UNCONTROLLED_COPY =
  "This certificate is only valid when viewed at the latest revision in the ORYX Document Management System. Printed or downloaded copies may become uncontrolled if subsequent revisions are issued."

export function cat2ExportFilename(drawingNumber: string): string {
  const safeDrawing = drawingNumber.replace(/[\\/:*?"<>|]/g, "-").trim() || "drawing"
  return `${safeDrawing}-CATII Check Certificate.pdf`
}

/**
 * Document reference for the control band — base drawing number only.
 * Revision belongs in the dedicated REVISION field, never in this string
 * (drawing numbers for revisions already include " Rev X", which used to
 * duplicate when we also appended revisionLetter).
 */
export function cat2DocumentReference(drawingNumber: string, _revisionLetter?: string | null): string {
  const base = baseDrawingNumber(drawingNumber).trim() || drawingNumber.trim() || "drawing"
  const safeDrawing = base.replace(/[\\/:*?"<>|]/g, "-").trim() || "drawing"
  return `${safeDrawing}-CATII Check Certificate`
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

type Fonts = { regular: PDFFont; bold: PDFFont; italic: PDFFont }

function t(
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

function hRule(page: PDFPage, y: number, color = RULE, fromX = MARGIN_X, toX = CONTENT_RIGHT) {
  page.drawLine({
    start: { x: fromX, y },
    end: { x: toX, y },
    thickness: 0.55,
    color,
  })
}

function sectionHeading(page: PDFPage, title: string, y: number, fonts: Fonts): number {
  t(page, title.toUpperCase(), MARGIN_X, y, fonts.bold, SECTION, CHARCOAL)
  hRule(page, y - 6, RULE)
  return y - 20
}

function para(
  page: PDFPage,
  text: string,
  y: number,
  fonts: Fonts,
  opts: { width?: number; size?: number; leading?: number; color?: ReturnType<typeof rgb> } = {},
): number {
  const size = opts.size ?? BODY
  const leading = opts.leading ?? LINE
  const width = opts.width ?? CONTENT_W
  const color = opts.color ?? INK
  for (const line of wrapText(text, width, fonts.regular, size)) {
    t(page, line, MARGIN_X, y, fonts.regular, size, color)
    y -= leading
  }
  return y
}

function metaField(
  page: PDFPage,
  label: string,
  value: string,
  x: number,
  y: number,
  fonts: Fonts,
  maxW: number,
  valueSize = 10.5,
): number {
  t(page, label.toUpperCase(), x, y, fonts.regular, 7.5, LABEL)
  y -= 12
  for (const line of wrapText(value, maxW, fonts.bold, valueSize)) {
    t(page, line, x, y, fonts.bold, valueSize, INK)
    y -= valueSize + 3
  }
  return y
}

/** Fit text to width by reducing size slightly — never truncate. */
function fitText(
  text: string,
  font: PDFFont,
  maxWidth: number,
  preferred: number,
  minSize: number,
): { size: number; lines: string[] } {
  let size = preferred
  while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) {
    size -= 0.25
  }
  if (font.widthOfTextAtSize(text, size) <= maxWidth) {
    return { size, lines: [text] }
  }
  return { size: minSize, lines: wrapText(text, maxWidth, font, minSize) }
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

  const works = worksTypeDisplayLabel(job.typeOfWorks, job.customTypeDescription) || job.typeOfWorks || "Scaffold"
  const project = (job.siteName?.trim() || job.siteAddress?.trim() || job.address || "Not specified")
    .replace(/\.$/, "")
  const revision = (job.revisionLetter ?? "").trim() || "—"
  const documentRef = cat2DocumentReference(job.drawingNumber, job.revisionLetter)
  const standards = splitStandards(job.designStandards)
  const completedAt = job.dateCompleted ? new Date(job.dateCompleted) : new Date()
  const issueDate = completedAt.toLocaleDateString("en-GB")
  const documents = [`${job.drawingNumber} — Scaffold design`]

  // ── Header ──────────────────────────────────────────────────────────────
  let logoBottom = PAGE_H - 78
  try {
    const logoBytes = await fs.readFile(path.join(process.cwd(), BRAND_LOGO_DOCUMENT_PATH))
    const logo = await doc.embedJpg(logoBytes)
    const logoW = 96
    const logoH = logoW * (logo.height / logo.width)
    const logoX = CONTENT_RIGHT - logoW
    const logoY = PAGE_H - 24 - logoH
    page.drawImage(logo, { x: logoX, y: logoY, width: logoW, height: logoH })
    logoBottom = logoY

    const logoCenterY = logoY + logoH / 2
    const titleBaseline = logoCenterY - TITLE * 0.32
    t(page, "Temporary Works Design Certificate", MARGIN_X, titleBaseline, fonts.bold, TITLE, CHARCOAL)
    t(page, "CONTROLLED ENGINEERING DOCUMENT", MARGIN_X, titleBaseline - 15, fonts.regular, 8, GREY)
  } catch {
    t(page, "Temporary Works Design Certificate", MARGIN_X, PAGE_H - 48, fonts.bold, TITLE, CHARCOAL)
    t(page, "CONTROLLED ENGINEERING DOCUMENT", MARGIN_X, PAGE_H - 63, fonts.regular, 8, GREY)
  }

  // Document control band — full reference, no truncation / no .pdf
  let y = Math.min(logoBottom, PAGE_H - 78) - 16
  hRule(page, y, RULE)
  y -= 16

  const controlTop = y
  const revX = MARGIN_X + CONTENT_W * 0.7
  const dateX = MARGIN_X + CONTENT_W * 0.85
  const refMaxW = revX - MARGIN_X - 16

  t(page, "DOCUMENT REFERENCE", MARGIN_X, controlTop, fonts.regular, 7, LABEL)
  const refFit = fitText(documentRef, fonts.bold, refMaxW, 9.5, 7)
  let refY = controlTop - 12
  for (const line of refFit.lines) {
    t(page, line, MARGIN_X, refY, fonts.bold, refFit.size, INK)
    refY -= refFit.size + 2
  }

  t(page, "REVISION", revX, controlTop, fonts.regular, 7, LABEL)
  t(page, revision, revX, controlTop - 12, fonts.bold, 9.5, INK)
  t(page, "ISSUE DATE", dateX, controlTop, fonts.regular, 7, LABEL)
  t(page, issueDate, dateX, controlTop - 12, fonts.bold, 9.5, INK)

  y = Math.min(refY, controlTop - 26) - 10
  hRule(page, y, RULE)
  y -= 26

  // ── Project Information (no document reference duplicate) ───────────────
  y = sectionHeading(page, "Project Information", y, fonts)
  y = metaField(page, "Project", project.toUpperCase(), MARGIN_X, y, fonts, CONTENT_W, 11)
  y -= 10

  const half = (CONTENT_W - 36) / 2
  const rowY = y
  const leftEnd = metaField(page, "Type of Works", works.toUpperCase(), MARGIN_X, rowY, fonts, half)
  const rightEnd = metaField(
    page,
    "Design Org. Originator",
    "ORYX SCAFFOLD DESIGN LTD.",
    MARGIN_X + half + 36,
    rowY,
    fonts,
    half,
  )
  y = Math.min(leftEnd, rightEnd) - 18

  // ── Certification Statement ─────────────────────────────────────────────
  y = sectionHeading(page, "Certification Statement", y, fonts)
  y = para(page, CERT_INTRO, y, fonts, { width: CONTENT_W * 0.92, leading: 14 })
  y -= 16

  // ── Applicable Standards ────────────────────────────────────────────────
  y = sectionHeading(page, "Applicable Standards", y, fonts)
  y = para(page, CERT_STANDARDS_LEAD, y, fonts, { width: CONTENT_W * 0.92, leading: 13.5 })
  y -= 8

  const hang = 14
  for (const standard of standards) {
    const lines = wrapText(standard, CONTENT_W - hang, fonts.regular, BODY)
    lines.forEach((line, i) => {
      if (i === 0) t(page, "–", MARGIN_X, y, fonts.regular, BODY, GREY)
      t(page, line, MARGIN_X + hang, y, fonts.regular, BODY, INK)
      y -= 12.5
    })
    y -= 3
  }
  y -= 12

  // ── Referenced Documents ────────────────────────────────────────────────
  y = sectionHeading(page, "Referenced Documents", y, fonts)
  y = para(page, CERT_DOCS_LEAD, y, fonts, { leading: 13.5 })
  y -= 6
  for (const docLine of documents) {
    t(page, "–", MARGIN_X, y, fonts.regular, BODY, GREY)
    t(page, docLine, MARGIN_X + hang, y, fonts.regular, BODY, INK)
    y -= 13.5
  }
  y -= 16

  // ── Comments | Approval ─────────────────────────────────────────────────
  const footerReserve = 72
  const blockTop = y
  const blockBottom = footerReserve + 10
  const blockH = blockTop - blockBottom
  const splitX = MARGIN_X + CONTENT_W * 0.46

  page.drawRectangle({
    x: MARGIN_X,
    y: blockBottom,
    width: CONTENT_W,
    height: blockH,
    borderColor: RULE,
    borderWidth: 0.6,
  })
  page.drawLine({
    start: { x: splitX, y: blockTop },
    end: { x: splitX, y: blockBottom },
    thickness: 0.6,
    color: RULE,
  })

  // Comments
  t(page, "COMMENTS", MARGIN_X + 14, blockTop - 18, fonts.bold, SECTION, CHARCOAL)
  t(page, "Comments are as follows:", MARGIN_X + 14, blockTop - 36, fonts.regular, 9, GREY)

  const noteTop = blockTop - 52
  const noteH = 48
  page.drawRectangle({
    x: MARGIN_X + 14,
    y: noteTop - noteH,
    width: splitX - MARGIN_X - 28,
    height: noteH,
    color: PANEL,
  })
  t(page, "GENERAL", MARGIN_X + 22, noteTop - 16, fonts.regular, 7, LABEL)
  t(page, "Approved with no comments.", MARGIN_X + 22, noteTop - 34, fonts.bold, 11, INK)

  const liabilityWidth = splitX - MARGIN_X - 28
  let ly = noteTop - noteH - 18
  for (const line of wrapText(LIABILITY, liabilityWidth, fonts.regular, 8)) {
    t(page, line, MARGIN_X + 14, ly, fonts.regular, 8, GREY)
    ly -= 11
  }

  // Approval — generous sign-off space
  const ax = splitX + 16
  const aw = CONTENT_RIGHT - ax - 14
  t(page, "APPROVAL", ax, blockTop - 18, fonts.bold, SECTION, CHARCOAL)
  t(page, "Checked by", ax, blockTop - 38, fonts.regular, 8, LABEL)

  t(page, "NAME", ax, blockTop - 60, fonts.regular, 7, LABEL)
  t(page, CHECKER.name, ax, blockTop - 76, fonts.bold, 11, INK)

  t(page, "POSITION", ax + aw * 0.5, blockTop - 60, fonts.regular, 7, LABEL)
  t(page, CHECKER.title, ax + aw * 0.5, blockTop - 76, fonts.bold, 11, INK)

  t(page, "DATE", ax, blockTop - 100, fonts.regular, 7, LABEL)
  t(page, issueDate, ax, blockTop - 116, fonts.bold, 11, INK)

  t(page, "SIGNATURE", ax, blockTop - 142, fonts.regular, 7, LABEL)

  const signatureAsset = await loadSignatureAsset()
  if (signatureAsset) {
    try {
      const image = signatureAsset.isPng
        ? await doc.embedPng(signatureAsset.bytes)
        : await doc.embedJpg(signatureAsset.bytes)
      const maxW = Math.min(170, aw)
      const maxH = 40
      const ratio = image.width / image.height
      let sigW = maxW
      let sigH = sigW / ratio
      if (sigH > maxH) {
        sigH = maxH
        sigW = sigH * ratio
      }
      page.drawImage(image, {
        x: ax,
        y: blockBottom + 18,
        width: sigW,
        height: sigH,
      })
    } catch {
      // leave open signature space
    }
  }

  // Soft signature baseline
  hRule(page, blockBottom + 14, RULE, ax, CONTENT_RIGHT - 14)

  // ── Footer: company · document reference · revision · page ──────────────
  const footerY = 50
  hRule(page, footerY + 14, RULE)

  const company = "ORYX Scaffold Design Ltd"
  const revLabel = `Rev ${revision}`
  const pageLabel = "Page 1 of 1"
  const footerSize = 7.5
  const companyW = fonts.regular.widthOfTextAtSize(company, footerSize)
  const revW = fonts.regular.widthOfTextAtSize(revLabel, footerSize)
  const pageW = fonts.regular.widthOfTextAtSize(pageLabel, footerSize)
  const gap = 12
  const footerRefMaxW = CONTENT_W - companyW - revW - pageW - gap * 3
  const footerRef = fitText(documentRef, fonts.regular, Math.max(120, footerRefMaxW), footerSize, 6)

  t(page, company, MARGIN_X, footerY, fonts.regular, footerSize, GREY)

  let refDrawY = footerY
  if (footerRef.lines.length > 1) {
    refDrawY = footerY + ((footerRef.lines.length - 1) * (footerRef.size + 1)) / 2
  }
  const refX = MARGIN_X + companyW + gap
  for (const line of footerRef.lines) {
    t(page, line, refX, refDrawY, fonts.regular, footerRef.size, GREY)
    refDrawY -= footerRef.size + 1
  }

  t(page, revLabel, CONTENT_RIGHT - pageW - gap - revW, footerY, fonts.regular, footerSize, GREY)
  t(page, pageLabel, CONTENT_RIGHT - pageW, footerY, fonts.regular, footerSize, GREY)

  let dy = footerY - 14
  for (const line of wrapText(UNCONTROLLED_COPY, CONTENT_W, fonts.italic, 6.5)) {
    t(page, line, MARGIN_X, dy, fonts.italic, 6.5, GREY)
    dy -= 8
  }

  return doc.save()
}
