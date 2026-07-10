import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  buildCalculationResult,
  computeBillableLabourHours,
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

  it("calculates mileage at HMRC rate", () => {
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

  it("bills 2.5 hr actual trip as 3 hr labour (0.5 hr site, 1 hr each way)", () => {
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
    // 30 min each way → 0.5 hr per leg → 1 hr return drive + 1 hr site = 2 hr × £95
    assert.equal(result.billableLabourHours, 2)
    assert.equal(result.labourCost, 190)
  })

  it("applies 20% VAT to subtotal", () => {
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
