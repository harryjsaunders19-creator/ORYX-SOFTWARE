import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import fs from "node:fs/promises"
import path from "node:path"
import type { JobRow } from "../types/job-types"
import { BRAND_LOGO_DOCUMENT_PATH } from "@/shared/branding/branding"

const PAGE_W = 595.32
const PAGE_H = 841.92
const MARGIN_X = 42
const CONTENT_W = PAGE_W - MARGIN_X * 2
const CONTENT_RIGHT = MARGIN_X + CONTENT_W

/** Oryx design cobalt — restrained accent (globals --color-tag-design). */
const ORYX_BLUE = rgb(0.118, 0.353, 0.588) // #1E5A96
const INK = rgb(0.1, 0.11, 0.12)
const LABEL = rgb(0.45, 0.47, 0.49)
const MUTED = rgb(0.38, 0.4, 0.42)
const RULE_GREY = rgb(0.78, 0.8, 0.82)
const PANEL = rgb(0.975, 0.977, 0.98)

const TITLE = 20
const SECTION = 10
const BODY = 10
const LINE = 12.8

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

function hRule(page: PDFPage, y: number, color = RULE_GREY, fromX = MARGIN_X, toX = CONTENT_RIGHT) {
  page.drawLine({
    start: { x: fromX, y },
    end: { x: toX, y },
    thickness: 0.6,
    color,
  })
}

function sectionHeading(page: PDFPage, title: string, y: number, fonts: Fonts): number {
  t(page, title.toUpperCase(), MARGIN_X, y, fonts.bold, SECTION, ORYX_BLUE)
  hRule(page, y - 5, RULE_GREY)
  return y - 18
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

function metaPair(
  page: PDFPage,
  label: string,
  value: string,
  x: number,
  y: number,
  fonts: Fonts,
  maxW: number,
): number {
  t(page, label.toUpperCase(), x, y, fonts.regular, 7.5, LABEL)
  y -= 11
  for (const line of wrapText(value, maxW, fonts.bold, 10)) {
    t(page, line, x, y, fonts.bold, 10, INK)
    y -= 12.5
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

  // ── Header: title + controlled mark + logo ───────────────────────────────
  let logoBottom = PAGE_H - 78
  try {
    const logoBytes = await fs.readFile(path.join(process.cwd(), BRAND_LOGO_DOCUMENT_PATH))
    const logo = await doc.embedJpg(logoBytes)
    const logoW = 100
    const logoH = logoW * (logo.height / logo.width)
    const logoX = CONTENT_RIGHT - logoW
    const logoY = PAGE_H - 22 - logoH
    page.drawImage(logo, { x: logoX, y: logoY, width: logoW, height: logoH })
    logoBottom = logoY

    // Title optically centred with logo
    const logoCenterY = logoY + logoH / 2
    const titleBaseline = logoCenterY - TITLE * 0.32
    t(page, "Temporary Works Design Certificate", MARGIN_X, titleBaseline, fonts.bold, TITLE, INK)
    t(page, "CONTROLLED ENGINEERING DOCUMENT", MARGIN_X, titleBaseline - 16, fonts.regular, 8, ORYX_BLUE)
  } catch {
    t(page, "Temporary Works Design Certificate", MARGIN_X, PAGE_H - 48, fonts.bold, TITLE, INK)
    t(page, "CONTROLLED ENGINEERING DOCUMENT", MARGIN_X, PAGE_H - 64, fonts.regular, 8, ORYX_BLUE)
  }

  // Document control strip between blue rules
  let y = Math.min(logoBottom, PAGE_H - 78) - 14
  hRule(page, y, ORYX_BLUE)
  y -= 14

  const controlCols = [
    { label: "DOCUMENT REFERENCE", value: documentRef, x: MARGIN_X, w: 280 },
    { label: "REVISION", value: revision, x: MARGIN_X + 300, w: 70 },
    { label: "ISSUE DATE", value: issueDate, x: MARGIN_X + 390, w: 100 },
  ]
  for (const col of controlCols) {
    t(page, col.label, col.x, y, fonts.regular, 7, LABEL)
    const val = col.value.length > 42 ? col.value.slice(0, 40) + "…" : col.value
    t(page, val, col.x, y - 12, fonts.bold, 9, INK)
  }
  y -= 22
  hRule(page, y, ORYX_BLUE)
  y -= 22

  // ── Project Information ─────────────────────────────────────────────────
  y = sectionHeading(page, "Project Information", y, fonts)
  const colW = (CONTENT_W - 28) / 2
  const leftX = MARGIN_X
  const rightX = MARGIN_X + colW + 28
  const metaTop = y
  const l1 = metaPair(page, "Project", project.toUpperCase(), leftX, metaTop, fonts, colW)
  const l2 = metaPair(page, "Type of Works", works.toUpperCase(), leftX, l1 - 6, fonts, colW)
  const r1 = metaPair(page, "Design Org. Originator", "ORYX SCAFFOLD DESIGN LTD.", rightX, metaTop, fonts, colW)
  const r2 = metaPair(page, "Document Reference", documentRef, rightX, r1 - 6, fonts, colW)
  y = Math.min(l2, r2) - 16

  // ── Certification Statement ─────────────────────────────────────────────
  y = sectionHeading(page, "Certification Statement", y, fonts)
  y = para(page, CERT_INTRO, y, fonts, { leading: 13.5 })
  y -= 14

  // ── Applicable Standards ────────────────────────────────────────────────
  y = sectionHeading(page, "Applicable Standards", y, fonts)
  y = para(page, CERT_STANDARDS_LEAD, y, fonts, { leading: 13.2 })
  y -= 6

  const hang = 14
  for (const standard of standards) {
    const lines = wrapText(standard, CONTENT_W - hang, fonts.regular, BODY)
    lines.forEach((line, i) => {
      if (i === 0) t(page, "–", MARGIN_X, y, fonts.regular, BODY, ORYX_BLUE)
      t(page, line, MARGIN_X + hang, y, fonts.regular, BODY, INK)
      y -= 12.2
    })
    y -= 2.5
  }
  y -= 10

  // ── Referenced Documents ────────────────────────────────────────────────
  y = sectionHeading(page, "Referenced Documents", y, fonts)
  y = para(page, CERT_DOCS_LEAD, y, fonts, { leading: 13.2 })
  y -= 5
  for (const docLine of documents) {
    t(page, "–", MARGIN_X, y, fonts.regular, BODY, ORYX_BLUE)
    t(page, docLine, MARGIN_X + hang, y, fonts.regular, BODY, INK)
    y -= 13
  }
  y -= 14

  // ── Comments | Approval (side-by-side, subtle panel) ────────────────────
  const footerReserve = 68
  const blockTop = y
  const blockBottom = footerReserve + 8
  const blockH = blockTop - blockBottom
  const splitX = MARGIN_X + CONTENT_W * 0.48

  page.drawRectangle({
    x: MARGIN_X,
    y: blockBottom,
    width: CONTENT_W,
    height: blockH,
    borderColor: RULE_GREY,
    borderWidth: 0.7,
  })
  page.drawLine({
    start: { x: splitX, y: blockTop },
    end: { x: splitX, y: blockBottom },
    thickness: 0.7,
    color: RULE_GREY,
  })

  // Left — Comments
  t(page, "COMMENTS", MARGIN_X + 12, blockTop - 16, fonts.bold, SECTION, ORYX_BLUE)
  t(page, "Comments are as follows:", MARGIN_X + 12, blockTop - 34, fonts.regular, 9, MUTED)

  const noteTop = blockTop - 48
  const noteH = 42
  page.drawRectangle({
    x: MARGIN_X + 12,
    y: noteTop - noteH,
    width: splitX - MARGIN_X - 24,
    height: noteH,
    color: PANEL,
    borderColor: RULE_GREY,
    borderWidth: 0.5,
  })
  t(page, "GENERAL", MARGIN_X + 20, noteTop - 14, fonts.regular, 7, LABEL)
  t(page, "Approved with no comments.", MARGIN_X + 20, noteTop - 30, fonts.bold, 11, INK)

  const liabilityWidth = splitX - MARGIN_X - 24
  let ly = noteTop - noteH - 16
  for (const line of wrapText(LIABILITY, liabilityWidth, fonts.regular, 8)) {
    t(page, line, MARGIN_X + 12, ly, fonts.regular, 8, MUTED)
    ly -= 10.5
  }

  // Right — Approval
  const ax = splitX + 14
  const aw = CONTENT_RIGHT - ax - 12
  t(page, "APPROVAL", ax, blockTop - 16, fonts.bold, SECTION, ORYX_BLUE)
  t(page, "Checked by", ax, blockTop - 34, fonts.regular, 8, LABEL)

  t(page, "NAME", ax, blockTop - 54, fonts.regular, 7, LABEL)
  t(page, CHECKER.name, ax, blockTop - 68, fonts.bold, 11, INK)

  t(page, "POSITION", ax + aw * 0.48, blockTop - 54, fonts.regular, 7, LABEL)
  t(page, CHECKER.title, ax + aw * 0.48, blockTop - 68, fonts.bold, 11, INK)

  t(page, "DATE", ax, blockTop - 90, fonts.regular, 7, LABEL)
  t(page, issueDate, ax, blockTop - 104, fonts.bold, 11, INK)

  t(page, "SIGNATURE", ax, blockTop - 126, fonts.regular, 7, LABEL)

  const signatureAsset = await loadSignatureAsset()
  if (signatureAsset) {
    try {
      const image = signatureAsset.isPng
        ? await doc.embedPng(signatureAsset.bytes)
        : await doc.embedJpg(signatureAsset.bytes)
      const maxW = Math.min(160, aw)
      const maxH = 36
      const ratio = image.width / image.height
      let sigW = maxW
      let sigH = sigW / ratio
      if (sigH > maxH) {
        sigH = maxH
        sigW = sigH * ratio
      }
      page.drawImage(image, {
        x: ax,
        y: blockBottom + 14,
        width: sigW,
        height: sigH,
      })
    } catch {
      // leave open
    }
  }

  // ── Footer ──────────────────────────────────────────────────────────────
  const footerY = 46
  hRule(page, footerY + 14, ORYX_BLUE)

  const f1 = "Oryx Scaffold Design Ltd"
  const f2 = documentRef.length > 36 ? documentRef.slice(0, 34) + "…" : documentRef
  const f3 = `Rev ${revision}`
  const f4 = "Page 1 of 1"
  t(page, f1, MARGIN_X, footerY, fonts.regular, 7.5, LABEL)
  t(page, f2, MARGIN_X + 145, footerY, fonts.regular, 7.5, LABEL)
  t(page, f3, MARGIN_X + 380, footerY, fonts.regular, 7.5, LABEL)
  t(page, f4, CONTENT_RIGHT - fonts.regular.widthOfTextAtSize(f4, 7.5), footerY, fonts.regular, 7.5, LABEL)

  let dy = footerY - 12
  for (const line of wrapText(UNCONTROLLED_COPY, CONTENT_W, fonts.italic, 6.5)) {
    t(page, line, MARGIN_X, dy, fonts.italic, 6.5, LABEL)
    dy -= 8
  }

  return doc.save()
}
