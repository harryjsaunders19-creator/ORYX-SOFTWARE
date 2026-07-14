import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { buildInvoiceSummary } from "../../modules/jobs/services/parent-work-item-service.ts"

describe("buildInvoiceSummary", () => {
  it("sums quoted, billed, and ready totals", () => {
    const summary = buildInvoiceSummary([
      {
        quoteValue: 450,
        variationFees: null,
        additionalCharges: null,
        billedValue: 450,
        invoiceStatus: "INVOICED",
      },
      {
        quoteValue: 120,
        variationFees: 0,
        additionalCharges: null,
        billedValue: null,
        invoiceStatus: "READY",
      },
      {
        quoteValue: 75,
        variationFees: null,
        additionalCharges: null,
        billedValue: null,
        invoiceStatus: "NONE",
      },
    ])
    assert.equal(summary.quotedTotal, 645)
    assert.equal(summary.billedTotal, 450)
    assert.equal(summary.readyTotal, 120)
    assert.equal(summary.invoicedCount, 1)
    assert.equal(summary.itemCount, 3)
  })
})
