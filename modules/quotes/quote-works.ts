import { OTHER_WORKS_TYPE, isValidWorksType } from "@/lib/constants"
import { todayIsoDate } from "@/shared/utils/utils"

/** Human-readable works label for PDFs, lists, and the legacy description column. */
export function quoteWorksDisplayLabel(
  typeOfWorks: string | null | undefined,
  customTypeDescription: string | null | undefined,
  fallbackDescription?: string,
): string {
  const works = typeOfWorks?.trim() ?? ""
  if (works) {
    return works === OTHER_WORKS_TYPE
      ? (customTypeDescription?.trim() ?? "")
      : works
  }
  return fallbackDescription?.trim() ?? ""
}

/** Seed the controlled type-of-works fields when editing legacy free-text quotes. */
export function inferQuoteWorksFromDescription(description: string): {
  typeOfWorks: string
  customTypeDescription: string
} {
  const d = description.trim()
  if (isValidWorksType(d)) return { typeOfWorks: d, customTypeDescription: "" }
  if (d) return { typeOfWorks: OTHER_WORKS_TYPE, customTypeDescription: d }
  return { typeOfWorks: "", customTypeDescription: "" }
}

const OPEN_QUOTE_STATUSES = new Set(["DRAFT", "SENT"])

export function shouldAutoExpireQuote(
  status: string,
  expiryDate: string | null | undefined,
  asOf: string = todayIsoDate(),
): boolean {
  if (!expiryDate || !OPEN_QUOTE_STATUSES.has(status)) return false
  return expiryDate.slice(0, 10) < asOf
}

export function parseQuoteWorksBody(body: Record<string, unknown>): {
  typeOfWorks: string
  customTypeDescription: string | null
  description: string
} | { error: string; field: string } {
  const typeOfWorks = String(body.typeOfWorks ?? "").trim()
  if (!typeOfWorks) {
    return { error: "Type of works is required", field: "typeOfWorks" }
  }
  if (!isValidWorksType(typeOfWorks)) {
    return { error: "Type of works must be one of the approved values", field: "typeOfWorks" }
  }
  const customTypeDescription = body.customTypeDescription
    ? String(body.customTypeDescription).trim()
    : null
  if (typeOfWorks === OTHER_WORKS_TYPE && !customTypeDescription) {
    return { error: "Please specify the type of works", field: "customTypeDescription" }
  }
  const description = quoteWorksDisplayLabel(typeOfWorks, customTypeDescription)
  if (!description) {
    return { error: "Type of works description is required", field: "typeOfWorks" }
  }
  return {
    typeOfWorks,
    customTypeDescription: typeOfWorks === OTHER_WORKS_TYPE ? customTypeDescription : null,
    description,
  }
}
