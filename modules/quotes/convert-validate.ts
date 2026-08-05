/** Pure validation for quote → job conversion (no I/O). */

export type QuoteConvertCandidate = {
  status: string
  jobId: string | null
  parentJobId?: string | null
}

export type QuoteConvertValidationResult =
  | { ok: true }
  | { ok: false; status: number; body: Record<string, unknown> }

export function validateQuoteForConvert(
  quote: QuoteConvertCandidate | null | undefined,
): QuoteConvertValidationResult {
  if (!quote) {
    return { ok: false, status: 404, body: { error: "Quote not found" } }
  }
  if (quote.status !== "ACCEPTED") {
    return {
      ok: false,
      status: 422,
      body: { error: "Only accepted quotes can be converted to jobs" },
    }
  }
  if (quote.jobId || quote.parentJobId) {
    return {
      ok: false,
      status: 409,
      body: { error: "This quote has already been converted to a job" },
    }
  }
  return { ok: true }
}

export function quoteConvertHoldResponse(holdReason: string): {
  status: number
  body: Record<string, unknown>
} {
  return {
    status: 422,
    body: {
      error: "Client is on hold",
      onHold: true,
      holdReason,
    },
  }
}
