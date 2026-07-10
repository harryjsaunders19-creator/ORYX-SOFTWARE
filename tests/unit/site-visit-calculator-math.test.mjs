import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  buildCalculationResult,
  computeBillableLabourHours,
  computeFeeTotals,
  qualifiesForDayRate,
  roundUpToBillingInterval,
  validateSiteHours,
  milesFromMetres,
  minutesFromSeconds,
} from "../../modules/site-visit-calculator/services/calculator-math.ts"

describe("site visit calculator math", () => {
  it("doubles one-way distance and time for return journey", () => {
    const result = buildCalculationResult({
      officeAddress: "Office",
      siteAddress: "Site",
      siteLat: 51.45,
      siteLng: -2.58,
      siteHours: 1,
      route: { oneWayDistanceMiles: 22, oneWayDurationMinutes: 40 },
    })
    assert.equal(result.returnDistanceMiles, 44)
    assert.equal(result.returnDurationMinutes, 80)
  })

  it("calculates mileage at HMRC rate (whole pounds)", () => {
    const result = buildCalculationResult({
      officeAddress: "Office",
      siteAddress: "Site",
      siteLat: null,
      siteLng: null,
      siteHours: 1,
      route: { oneWayDistanceMiles: 10, oneWayDurationMinutes: 20 },
      rates: { mileagePerMile: 0.45, hourlyRate: 95, vatRate: 0.2 },
    })
    assert.equal(result.mileageCost, 9)
  })

  it("rounds each one-way drive leg up to half-hour steps", () => {
    const billing45 = computeBillableLabourHours(45, 1)
    assert.equal(billing45.oneWayBillableHours, 1)
    assert.equal(billing45.returnBillableDriveHours, 2)
    assert.equal(billing45.billableLabourHours, 3)

    const billing75 = computeBillableLabourHours(75, 1)
    assert.equal(billing75.oneWayBillableHours, 1.5)
    assert.equal(billing75.returnBillableDriveHours, 3)
    assert.equal(billing75.billableLabourHours, 4)
  })

  it("charges minimum 1 hour on site", () => {
    const billing = computeBillableLabourHours(0, 0.5)
    assert.equal(billing.billableSiteHours, 1)
    assert.equal(billing.billableLabourHours, 1)
  })

  it("rounds ex-VAT total up to nearest £95", () => {
    assert.equal(roundUpToBillingInterval(94), 95)
    assert.equal(roundUpToBillingInterval(95), 95)
    assert.equal(roundUpToBillingInterval(96), 190)
    assert.equal(roundUpToBillingInterval(294), 380)
  })

  it("bills 2.5 hr actual trip as 3 hr labour rounded to £380 ex VAT", () => {
    const result = buildCalculationResult({
      officeAddress: "Office",
      siteAddress: "Site",
      siteLat: null,
      siteLng: null,
      siteHours: 0.5,
      route: { oneWayDistanceMiles: 10, oneWayDurationMinutes: 60 },
      rates: { mileagePerMile: 0.45, hourlyRate: 95, vatRate: 0.2 },
    })
    assert.equal(result.billableLabourHours, 3)
    assert.equal(result.labourCost, 285)
    assert.equal(result.rawSubtotal, 294)
    assert.equal(result.subtotal, 380)
    assert.equal(result.vat, 76)
    assert.equal(result.grandTotal, 456)
  })

  it("includes rounded drive + site time in labour", () => {
    const result = buildCalculationResult({
      officeAddress: "Office",
      siteAddress: "Site",
      siteLat: null,
      siteLng: null,
      siteHours: 1,
      route: { oneWayDistanceMiles: 10, oneWayDurationMinutes: 30 },
      rates: { mileagePerMile: 0.45, hourlyRate: 95, vatRate: 0.2 },
    })
    assert.equal(result.billableLabourHours, 2)
    assert.equal(result.labourCost, 190)
    assert.equal(result.subtotal, 285)
    assert.equal(result.grandTotal, 342)
  })

  it("applies day rate when one-way drive exceeds 3.5 hours", () => {
    assert.equal(qualifiesForDayRate(210), false)
    assert.equal(qualifiesForDayRate(211), true)

    const result = buildCalculationResult({
      officeAddress: "Office",
      siteAddress: "Site",
      siteLat: null,
      siteLng: null,
      siteHours: 2,
      route: { oneWayDistanceMiles: 200, oneWayDurationMinutes: 220 },
      rates: { mileagePerMile: 0.45, hourlyRate: 95, vatRate: 0.2 },
    })
    assert.equal(result.isDayRate, true)
    assert.equal(result.labourCost, 950)
    assert.equal(result.mileageCost, 180)
    assert.equal(result.rawSubtotal, 1130)
    assert.equal(result.subtotal, 1140)
    assert.equal(result.vat, 228)
    assert.equal(result.grandTotal, 1368)
  })

  it("applies 20% VAT to rounded subtotal as whole pounds", () => {
    const totals = computeFeeTotals(0, 95, 0.2)
    assert.equal(totals.subtotal, 95)
    assert.equal(totals.vat, 19)
    assert.equal(totals.grandTotal, 114)

    const result = buildCalculationResult({
      officeAddress: "Office",
      siteAddress: "Site",
      siteLat: null,
      siteLng: null,
      siteHours: 1,
      route: { oneWayDistanceMiles: 0, oneWayDurationMinutes: 0 },
      rates: { mileagePerMile: 0.45, hourlyRate: 95, vatRate: 0.2 },
    })
    assert.equal(result.billableLabourHours, 1)
    assert.equal(result.subtotal, 95)
    assert.equal(result.vat, 19)
    assert.equal(result.grandTotal, 114)
  })

  it("validates half-hour increments", () => {
    assert.equal(validateSiteHours(1), null)
    assert.equal(validateSiteHours(2.5), null)
    assert.ok(validateSiteHours(1.25))
    assert.ok(validateSiteHours(0.25))
  })

  it("converts metres and seconds", () => {
    assert.equal(milesFromMetres(1609.344), 1)
    assert.equal(minutesFromSeconds(3600), 60)
  })
})
