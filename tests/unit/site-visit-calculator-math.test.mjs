import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  buildCalculationResult,
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

  it("includes return drive + site time in labour", () => {
    const result = buildCalculationResult({
      officeAddress: "Office",
      siteAddress: "Site",
      siteLat: null,
      siteLng: null,
      siteHours: 1,
      route: { oneWayDistanceMiles: 10, oneWayDurationMinutes: 30 },
      rates: { mileagePerMile: 0.45, hourlyRate: 95, vatRate: 0.2 },
    })
    // return drive = 60 min = 1 hr + 1 hr site = 2 hr × £95
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
