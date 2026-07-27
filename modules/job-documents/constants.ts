/** Controlled document categories for job attachments. */
export const JOB_DOCUMENT_CATEGORIES = [
  "Client Email",
  "Site Photos",
  "Drawings",
  "Design",
  "Calculations",
  "Site Survey",
  "Inspection",
  "RAMS",
  "Purchase Order",
  "Invoice",
  "General",
] as const

export type JobDocumentCategory = (typeof JOB_DOCUMENT_CATEGORIES)[number]

export function isValidDocumentCategory(value: string): value is JobDocumentCategory {
  return (JOB_DOCUMENT_CATEGORIES as readonly string[]).includes(value)
}

export const MAX_JOB_DOC_BYTES = 50 * 1024 * 1024
export const JOB_DOC_LIST_PAGE_SIZE = 24
export const JOB_DOC_UPLOAD_CONCURRENCY = 3

export const IMAGE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/heic",
  "image/heif",
])

export const PDF_MIME = new Set(["application/pdf"])

/** Kept for classifying any legacy email files already stored. */
export const EMAIL_MIME = new Set([
  "message/rfc822",
  "application/vnd.ms-outlook",
  "application/mbox",
])

export const EMAIL_EXT = new Set([".eml", ".msg"])

export const DRAWING_EXT = new Set([".dwg", ".dxf"])

export const CALC_EXT = new Set([".xlsx", ".xls", ".csv"])

/** New uploads: images and PDFs only (print emails to PDF). */
export const ALLOWED_MIME = new Set([
  ...IMAGE_MIME,
  ...PDF_MIME,
])

export const ALLOWED_EXT = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif",
  ".pdf",
])

export type DocumentKindFilter = "images" | "pdfs" | "emails" | "drawings" | "calculations" | "other"
export type DocumentScopeFilter = "all" | "current" | "previous"
export type DocumentPeriodFilter = "all" | "today" | "week" | "month"

export function fileExt(filename: string): string {
  const i = filename.lastIndexOf(".")
  return i >= 0 ? filename.slice(i).toLowerCase() : ""
}

/** Strip charset / boundary parameters: `application/pdf; charset=binary` → `application/pdf`. */
export function baseMimeType(reported?: string | null): string {
  if (!reported) return ""
  return reported.split(";")[0]!.trim().toLowerCase()
}

export function inferMimeType(filename: string, reported?: string | null): string {
  const ext = fileExt(filename)
  const base = baseMimeType(reported)

  if (ext === ".pdf") return "application/pdf"
  if ([".jpg", ".jpeg"].includes(ext)) return "image/jpeg"
  if (ext === ".png") return "image/png"
  if (ext === ".webp") return "image/webp"
  if (ext === ".heic") return "image/heic"
  if (ext === ".heif") return "image/heif"

  // Legacy email files (read/download only — not accepted for new uploads)
  if (ext === ".eml") return "message/rfc822"
  if (ext === ".msg") return "application/vnd.ms-outlook"

  if (base && base !== "application/octet-stream" && base !== "application/force-download") {
    return base
  }

  return base || "application/octet-stream"
}

export function isAllowedUpload(filename: string, mime: string): boolean {
  const ext = fileExt(filename)
  if (ALLOWED_EXT.has(ext)) return true
  const base = baseMimeType(mime) || mime
  return ALLOWED_MIME.has(base)
}

export function documentKind(mime: string, ext: string): DocumentKindFilter {
  if (IMAGE_MIME.has(mime) || [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"].includes(ext)) {
    return "images"
  }
  if (PDF_MIME.has(mime) || ext === ".pdf") return "pdfs"
  if (EMAIL_MIME.has(mime) || EMAIL_EXT.has(ext)) return "emails"
  if (DRAWING_EXT.has(ext) || mime.includes("dwg") || mime.includes("dxf") || mime.includes("acad")) {
    return "drawings"
  }
  if (CALC_EXT.has(ext) || mime.includes("excel") || mime.includes("spreadsheet")) {
    return "calculations"
  }
  return "other"
}

export function isEmailFile(filename: string, mime: string): boolean {
  return EMAIL_EXT.has(fileExt(filename)) || EMAIL_MIME.has(baseMimeType(mime) || mime)
}

export function storageScope(revisionLetter: string | null | undefined): string {
  if (!revisionLetter) return "original"
  return `rev-${revisionLetter}`
}
