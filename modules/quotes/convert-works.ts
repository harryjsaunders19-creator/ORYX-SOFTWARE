import { OTHER_WORKS_TYPE } from "@/lib/constants"
import type { QuoteRow } from "./types/quote-types"

/** Map quote works fields to job create payload (convert flow). */
export function resolveWorksFromQuote(
  quote: Pick<QuoteRow, "typeOfWorks" | "customTypeDescription" | "description">,
): { typeOfWorks: string; customTypeDescription: string | null } {
  if (quote.typeOfWorks?.trim() && quote.typeOfWorks !== OTHER_WORKS_TYPE) {
    return { typeOfWorks: quote.typeOfWorks.trim(), customTypeDescription: null }
  }
  const custom = (quote.customTypeDescription ?? quote.description ?? "").trim()
  return {
    typeOfWorks: OTHER_WORKS_TYPE,
    customTypeDescription: (custom || "Converted from quote").slice(0, 500),
  }
}
