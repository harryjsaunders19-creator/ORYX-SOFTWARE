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

export const EMAIL_MIME = new Set([
  "message/rfc822",
  "application/vnd.ms-outlook",
  "application/mbox",
])

export const EMAIL_EXT = new Set([".eml", ".msg"])

export const DRAWING_EXT = new Set([".dwg", ".dxf"])

export const CALC_EXT = new Set([".xlsx", ".xls", ".csv"])

export const ALLOWED_MIME = new Set([
  ...IMAGE_MIME,
  ...PDF_MIME,
  ...EMAIL_MIME,
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
  "application/acad",
  "application/x-acad",
  "application/dxf",
  "image/vnd.dwg",
  "image/vnd.dxf",
  "text/plain",
  // Windows / Outlook alternate labels for saved emails
  "application/eml",
  "text/eml",
  "message/partial",
])

export const ALLOWED_EXT = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif",
  ".pdf",
  ".doc", ".docx",
  ".xls", ".xlsx",
  ".zip",
  ".dwg", ".dxf",
  ".msg", ".eml",
  ".txt",
])

export type DocumentKindFilter = "images" | "pdfs" | "emails" | "drawings" | "calculations" | "other"
export type DocumentScopeFilter = "all" | "current" | "previous"
export type DocumentPeriodFilter = "all" | "today" | "week" | "month"

export function fileExt(filename: string): string {
  const i = filename.lastIndexOf(".")
  return i >= 0 ? filename.slice(i).toLowerCase() : ""
}

/** Strip charset / boundary parameters: `message/rfc822; charset=utf-8` → `message/rfc822`. */
export function baseMimeType(reported?: string | null): string {
  if (!reported) return ""
  return reported.split(";")[0]!.trim().toLowerCase()
}

export function inferMimeType(filename: string, reported?: string | null): string {
  const ext = fileExt(filename)
  const base = baseMimeType(reported)

  // Always trust email extensions — browsers/Windows often lie about .eml MIME.
  if (ext === ".eml") return "message/rfc822"
  if (ext === ".msg") return "application/vnd.ms-outlook"

  if (base === "application/eml" || base === "text/eml" || base === "message/partial") {
    return "message/rfc822"
  }
  if (base && base !== "application/octet-stream" && base !== "application/force-download") {
    return base
  }

  switch (ext) {
    case ".jpg":
    case ".jpeg": return "image/jpeg"
    case ".png": return "image/png"
    case ".webp": return "image/webp"
    case ".heic": return "image/heic"
    case ".heif": return "image/heif"
    case ".pdf": return "application/pdf"
    case ".doc": return "application/msword"
    case ".docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    case ".xls": return "application/vnd.ms-excel"
    case ".xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    case ".zip": return "application/zip"
    case ".dwg": return "application/acad"
    case ".dxf": return "application/dxf"
    case ".txt": return "text/plain"
    default: return base || "application/octet-stream"
  }
}

export function isAllowedUpload(filename: string, mime: string): boolean {
  const ext = fileExt(filename)
  if (ALLOWED_EXT.has(ext)) return true
  return ALLOWED_MIME.has(baseMimeType(mime) || mime)
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
