import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import fs from "node:fs/promises"
import path from "node:path"
import type { JobRow } from "../types/job-types"
import { BRAND_LOGO_DOCUMENT_PATH } from "@/shared/branding/branding"

const PAGE_W = 595.32
const PAGE_H = 841.92
const MARGIN_X = 54
const CONTENT_W = PAGE_W - MARGIN_X * 2
const CONTENT_RIGHT = MARGIN_X + CONTENT_W

const INK = rgb(0.07, 0.08, 0.09)
const LABEL = rgb(0.48, 0.5, 0.52)
const MUTED = rgb(0.4, 0.42, 0.44)
const RULE = rgb(0.8, 0.81, 0.82)
const PANEL = rgb(0.972, 0.974, 0.976)

const TITLE = 22
const SECTION = 11.5
const BODY = 10.5
const META_VALUE = 11.5
const FOOTER = 7.5
const MEASURE = CONTENT_W * 0.86

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

function rule(page: PDFPage, y: number, color = RULE) {
  page.drawLine({
    start: { x: MARGIN_X, y },
    end: { x: CONTENT_RIGHT, y },
    thickness: 0.45,
    color,
  })
}

function field(
  page: PDFPage,
  label: string,
  value: string,
  x: number,
  y: number,
  fonts: Fonts,
  maxW: number,
): number {
  t(page, label.toUpperCase(), x, y, fonts.regular, 7.5, LABEL)
  y -= 14
  for (const line of wrapText(value, maxW, fonts.bold, META_VALUE)) {
    t(page, line, x, y, fonts.bold, META_VALUE, INK)
    y -= 15
  }
  return y
}

function section(page: PDFPage, title: string, y: number, fonts: Fonts): number {
  t(page, title, MARGIN_X, y, fonts.bold, SECTION, INK)
  return y - 20
}

function paragraph(
  page: PDFPage,
  text: string,
  y: number,
  fonts: Fonts,
  opts: { width?: number; size?: number; leading?: number; color?: ReturnType<typeof rgb> } = {},
): number {
  const size = opts.size ?? BODY
  const leading = opts.leading ?? 16
  const width = opts.width ?? MEASURE
  const color = opts.color ?? INK
  for (const line of wrapText(text, width, fonts.regular, size)) {
    t(page, line, MARGIN_X, y, fonts.regular, size, color)
    y -= leading
  }
  return y
}

async function drawLogo(doc: PDFDocument, page: PDFPage) {
  try {
    const logoBytes = await fs.readFile(path.join(process.cwd(), BRAND_LOGO_DOCUMENT_PATH))
    const logo = await doc.embedJpg(logoBytes)
    const logoW = 88
    const logoH = logoW * (logo.height / logo.width)
    page.drawImage(logo, {
      x: CONTENT_RIGHT - logoW,
      y: PAGE_H - 30 - logoH,
      width: logoW,
      height: logoH,
    })
  } catch {
    // non-fatal
  }
}

function drawFooter(
  page: PDFPage,
  fonts: Fonts,
  documentRef: string,
  revision: string,
  pageNo: number,
  pageCount: number,
) {
  const footerY = 52
  rule(page, footerY + 16, RULE)

  const left = "Oryx Scaffold Design Ltd"
  const mid = `${documentRef}  ·  Rev ${revision}`
  const right = `Page ${pageNo} of ${pageCount}`

  t(page, left, MARGIN_X, footerY, fonts.regular, FOOTER, LABEL)
  t(page, mid, PAGE_W / 2 - fonts.regular.widthOfTextAtSize(mid, FOOTER) / 2, footerY, fonts.regular, FOOTER, LABEL)
  t(page, right, CONTENT_RIGHT - fonts.regular.widthOfTextAtSize(right, FOOTER), footerY, fonts.regular, FOOTER, LABEL)

  let dy = footerY - 14
  for (const line of wrapText(UNCONTROLLED_COPY, CONTENT_W, fonts.italic, 6.5)) {
    t(page, line, MARGIN_X, dy, fonts.italic, 6.5, LABEL)
    dy -= 8.5
  }
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
  const pageCount = 2

  // ── Page 1: identity, project, certification, standards, documents ─────
  const page1 = doc.addPage([PAGE_W, PAGE_H])
  await drawLogo(doc, page1)

  t(page1, "Temporary Works Design Certificate", MARGIN_X, PAGE_H - 56, fonts.bold, TITLE, INK)

  let y = PAGE_H - 88
  const bits: [string, string][] = [
    ["Document Reference", documentRef],
    ["Revision", revision],
    ["Issue Date", issueDate],
  ]
  let mx = MARGIN_X
  for (const [label, value] of bits) {
    t(page1, `${label}  `, mx, y, fonts.regular, 8, LABEL)
    const lw = fonts.regular.widthOfTextAtSize(`${label}  `, 8)
    t(page1, value, mx + lw, y, fonts.regular, 8, MUTED)
    mx += lw + fonts.regular.widthOfTextAtSize(value, 8) + 32
  }

  y -= 20
  rule(page1, y)
  y -= 32

  // Title-block metadata — full-width long fields first
  y = field(page1, "Project", project.toUpperCase(), MARGIN_X, y, fonts, CONTENT_W)
  y -= 14
  y = field(page1, "Document Reference", documentRef, MARGIN_X, y, fonts, CONTENT_W)
  y -= 14

  const half = (CONTENT_W - 40) / 2
  const rowY = y
  const leftEnd = field(page1, "Type of Works", works.toUpperCase(), MARGIN_X, rowY, fonts, half)
  const rightEnd = field(
    page1,
    "Design Org. Originator",
    "ORYX SCAFFOLD DESIGN LTD.",
    MARGIN_X + half + 40,
    rowY,
    fonts,
    half,
  )
  y = Math.min(leftEnd, rightEnd) - 36

  y = section(page1, "Certification Statement", y, fonts)
  y = paragraph(page1, CERT_INTRO, y, fonts, { leading: 16.5 })
  y -= 32

  y = section(page1, "Applicable Standards", y, fonts)
  y = paragraph(page1, CERT_STANDARDS_LEAD, y, fonts, { leading: 16 })
  y -= 14

  const hang = 18
  for (const standard of standards) {
    const lines = wrapText(standard, CONTENT_W - hang, fonts.regular, BODY)
    lines.forEach((line, i) => {
      if (i === 0) t(page1, "–", MARGIN_X, y, fonts.regular, BODY, LABEL)
      t(page1, line, MARGIN_X + hang, y, fonts.regular, BODY, INK)
      y -= 15
    })
    y -= 6
  }
  y -= 20

  y = section(page1, "Referenced Documents", y, fonts)
  y = paragraph(page1, CERT_DOCS_LEAD, y, fonts, { leading: 16 })
  y -= 12
  for (const docLine of documents) {
    t(page1, "–", MARGIN_X, y, fonts.regular, BODY, LABEL)
    t(page1, docLine, MARGIN_X + hang, y, fonts.regular, BODY, INK)
    y -= 16
  }

  drawFooter(page1, fonts, documentRef, revision, 1, pageCount)

  // ── Page 2: comments, liability, approval ───────────────────────────────
  const page2 = doc.addPage([PAGE_W, PAGE_H])
  await drawLogo(doc, page2)

  t(page2, "Temporary Works Design Certificate", MARGIN_X, PAGE_H - 56, fonts.bold, TITLE, INK)
  y = PAGE_H - 84
  rule(page2, y)
  y -= 36

  y = section(page2, "Comments", y, fonts)
  t(page2, "Comments are as follows:", MARGIN_X, y, fonts.regular, BODY, MUTED)
  y -= 24

  const panelH = 72
  const panelBottom = y - panelH
  page2.drawRectangle({
    x: MARGIN_X,
    y: panelBottom,
    width: CONTENT_W,
    height: panelH,
    color: PANEL,
  })
  t(page2, "General", MARGIN_X + 22, y - 22, fonts.regular, 8, LABEL)
  t(page2, "Approved with no comments.", MARGIN_X + 22, y - 46, fonts.bold, 14, INK)
  y = panelBottom - 28

  y = paragraph(page2, LIABILITY, y, fonts, { size: 10, leading: 15.5, color: MUTED })
  y -= 40

  y = section(page2, "Approval", y, fonts)
  t(page2, "Checked by", MARGIN_X, y, fonts.regular, 8, LABEL)
  y -= 28

  const c1 = MARGIN_X
  const c2 = MARGIN_X + 200
  const c3 = MARGIN_X + 390

  t(page2, "NAME", c1, y, fonts.regular, 7.5, LABEL)
  t(page2, "POSITION", c2, y, fonts.regular, 7.5, LABEL)
  t(page2, "DATE", c3, y, fonts.regular, 7.5, LABEL)
  y -= 18
  t(page2, CHECKER.name, c1, y, fonts.bold, 13, INK)
  t(page2, CHECKER.title, c2, y, fonts.bold, 13, INK)
  t(page2, issueDate, c3, y, fonts.bold, 13, INK)

  y -= 40
  t(page2, "SIGNATURE", c1, y, fonts.regular, 7.5, LABEL)
  y -= 12

  const sigBottom = y - 56
  const signatureAsset = await loadSignatureAsset()
  if (signatureAsset) {
    try {
      const image = signatureAsset.isPng
        ? await doc.embedPng(signatureAsset.bytes)
        : await doc.embedJpg(signatureAsset.bytes)
      const maxW = 200
      const maxH = 42
      const ratio = image.width / image.height
      let sigW = maxW
      let sigH = sigW / ratio
      if (sigH > maxH) {
        sigH = maxH
        sigW = sigH * ratio
      }
      page2.drawImage(image, {
        x: c1,
        y: sigBottom + 8,
        width: sigW,
        height: sigH,
      })
    } catch {
      // open signature space
    }
  }
  rule(page2, sigBottom, rgb(0.88, 0.89, 0.9))

  drawFooter(page2, fonts, documentRef, revision, 2, pageCount)

  return doc.save()
}
