import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const {
  pickLinkedQuoteForInvoice,
  resolveHandoffQuoteValue,
} = require("../../modules/billing/resolve-handoff-quote-value.ts")

describe("resolveHandoffQuoteValue", () => {
  it("uses job commercial total when present", () => {
    const result = resolveHandoffQuoteValue(
      { quoteValue: 1200, variationFees: 100, additionalCharges: null, quoteReference: "JOB-REF" },
      [{ quoteNumber: "Q-1", quoteValue: 999, status: "ACCEPTED", updatedAt: "2026-01-01" }],
    )
    assert.equal(result.quoteValue, 1300)
    assert.equal(result.quoteReference, "JOB-REF")
    assert.equal(result.fromLinkedQuote, false)
  })

  it("falls back to accepted linked quote when job has no fee", () => {
    const result = resolveHandoffQuoteValue(
      { quoteValue: null, quoteReference: null },
      [
        { quoteNumber: "Q-OLD", quoteValue: 500, status: "SENT", updatedAt: "2026-01-01" },
        { quoteNumber: "Q-ACC", quoteValue: 1750, status: "ACCEPTED", updatedAt: "2026-01-02" },
      ],
    )
    assert.equal(result.quoteValue, 1750)
    assert.equal(result.quoteReference, "Q-ACC")
    assert.equal(result.fromLinkedQuote, true)
  })

  it("prefers most recently updated quote when none accepted", () => {
    const picked = pickLinkedQuoteForInvoice([
      { quoteNumber: "Q-A", quoteValue: 100, status: "SENT", updatedAt: "2026-01-01T10:00:00Z" },
      { quoteNumber: "Q-B", quoteValue: 200, status: "DRAFT", updatedAt: "2026-02-01T10:00:00Z" },
    ])
    assert.equal(picked?.quoteNumber, "Q-B")
  })

  it("returns null when neither job nor quote has a value", () => {
    const result = resolveHandoffQuoteValue({ quoteValue: null }, [])
    assert.equal(result.quoteValue, null)
    assert.equal(result.fromLinkedQuote, false)
  })
})
