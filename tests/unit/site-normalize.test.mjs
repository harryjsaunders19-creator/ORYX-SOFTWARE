import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  normalizeName,
  normalizePostcode,
  siteDedupKey,
  siteSimilarity,
  formatSiteAddress,
  parseLegacySiteAddress,
} from "../../modules/sites/lib/normalize.ts"

describe("site normalize", () => {
  it("normalises names and postcodes", () => {
    assert.equal(normalizeName("  Temple  Meads  Station "), "temple meads station")
    assert.equal(normalizePostcode("bs1 6qf"), "BS16QF")
  })

  it("builds stable dedup keys per client", () => {
    const a = siteDedupKey({
      clientId: "c1",
      name: "Temple Meads Station",
      postcode: "BS1 6QF",
      addressLine1: "Station Approach",
    })
    const b = siteDedupKey({
      clientId: "c1",
      name: "temple meads station",
      postcode: "bs16qf",
      addressLine1: "Station Approach",
    })
    const otherClient = siteDedupKey({
      clientId: "c2",
      name: "Temple Meads Station",
      postcode: "BS1 6QF",
      addressLine1: "Station Approach",
    })
    assert.equal(a, b)
    assert.notEqual(a, otherClient)
  })

  it("scores likely duplicates", () => {
    assert.ok(siteSimilarity(
      { name: "Temple Meads Station", postcode: "BS1 6QF", addressLine1: "Station Approach" },
      { name: "temple meads station", postcode: "BS16QF", addressLine1: "Station Approach" },
    ) >= 0.9)
  })

  it("formats and parses addresses", () => {
    assert.equal(formatSiteAddress({
      addressLine1: "Station Approach",
      city: "Bristol",
      postcode: "BS1 6QF",
      country: "United Kingdom",
    }), "Station Approach, Bristol, BS1 6QF")

    const parsed = parseLegacySiteAddress("Station Approach, Bristol, BS1 6QF")
    assert.match(parsed.postcode ?? "", /BS1\s*6QF/i)
    assert.equal(parsed.city, "Bristol")
  })
})
