import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { buildCalculationResult } from "../../modules/site-visit-calculator/services/calculator-math.ts"
import {
  buildSiteVisitQuoteLineItems,
  draftSiteVisitPdfFilename,
  mapSiteVisitEstimateToQuotationData,
  sanitizePdfFilenamePart,
  validateSiteVisitResultForExport,
} from "../../modules/site-visit-calculator/services/map-site-visit-estimate-to-quotation.ts"

/** Bristol Airport-style example from the product brief. */
function bristolExample() {
  // Labour 3 hr × £95 = £285; mileage ceil(29.78 × 0.45) = ceil(13.401) = £14
  // raw £299 → round up to £380; VAT £76; grand £456
  return buildCalculationResult({
    officeAddress: "Little Woodlands, 61 Bath Road, Willsbridge, Bristol, BS30 6ES",
    siteAddress: "Bristol Airport, Bristol Road, Wrington, BS40 9UU",
    siteLat: 51.3827,
    siteLng: -2.7191,
    siteHours: 1,
    route: {
      oneWayDistanceMiles: 14.89,
      oneWayDurationMinutes: 34.5,
    },
    rates: { mileagePerMile: 0.45, hourlyRate: 95, vatRate: 0.2 },
  })
}

describe("mapSiteVisitEstimateToQuotationData", () => {
  it("matches the Bristol Airport commercial example totals", () => {
    const result = bristolExample()
    assert.equal(result.billableLabourHours, 3)
    assert.equal(result.labourCost, 285)
    assert.equal(result.returnDistanceMiles, 29.78)
    assert.equal(result.mileageCost, 14)
    assert.equal(result.rawSubtotal, 299)
    assert.equal(result.subtotal, 380)
    assert.equal(result.vat, 76)
    assert.equal(result.grandTotal, 456)
  })

  it("maps line items with transparent £95 rounding adjustment", () => {
    const result = bristolExample()
    const items = buildSiteVisitQuoteLineItems(result)
    assert.equal(items.length, 3)
    assert.match(items[0].description, /Site visit – labour/)
    assert.equal(items[0].amount, 285)
    assert.match(items[1].description, /Return travel mileage/)
    assert.equal(items[1].amount, 14)
    assert.match(items[2].description, /rounded site visit charge adjustment/i)
    assert.equal(items[2].amount, 81)

    const sum = items.reduce((s, i) => s + i.amount, 0)
    assert.equal(sum, 380)
  })

  it("builds draft QuotationPdfData without consuming a quote number", () => {
    const result = bristolExample()
    const data = mapSiteVisitEstimateToQuotationData(result, {
      draft: true,
      clientCompany: "Acme Scaffolding",
      contactName: "Jane Doe",
      preparedBy: "Harry",
      purchaseOrder: "PO-123",
    })

    assert.equal(data.quotationNumber, "DRAFT")
    assert.equal(data.client, "Acme Scaffolding")
    assert.equal(data.contact, "Jane Doe")
    assert.equal(data.site, result.siteAddress)
    assert.equal(data.purchaseOrder, "PO-123")
    assert.equal(data.subtotal, 380)
    assert.equal(data.vatRate, 20)
    assert.equal(data.vatAmount, 76)
    assert.equal(data.grandTotal, 456)
    assert.equal(data.filename, "Site-Visit-Quotation-Draft-Bristol-Airport.pdf")
    assert.ok(data.terms.length >= 4)
    assert.match(data.items[0].description, /Bristol Airport/)
  })

  it("uses a formal quotation number when provided", () => {
    const result = bristolExample()
    const data = mapSiteVisitEstimateToQuotationData(result, {
      draft: false,
      quotationNumber: "Q-2026-017",
      clientCompany: "Acme",
      preparedBy: "Harry",
    })
    assert.equal(data.quotationNumber, "Q-2026-017")
    assert.equal(data.filename, undefined)
  })

  it("validates incomplete calculations", () => {
    assert.match(validateSiteVisitResultForExport(null) ?? "", /Calculate/)
    const bad = bristolExample()
    bad.siteAddress = ""
    assert.match(validateSiteVisitResultForExport(bad) ?? "", /destination/)
  })

  it("sanitises draft PDF filenames", () => {
    assert.equal(sanitizePdfFilenamePart("Bristol Airport!"), "Bristol-Airport")
    assert.equal(
      draftSiteVisitPdfFilename("Bristol Airport, Bristol Road"),
      "Site-Visit-Quotation-Draft-Bristol-Airport.pdf",
    )
  })
})
