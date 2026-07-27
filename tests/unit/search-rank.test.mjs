import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { bestScore, highlightParts, scoreField, SEARCH_WEIGHTS } from "../../modules/search/rank.ts"

describe("search rank", () => {
  it("matches partial tokens in drawing numbers and names", () => {
    assert.ok(scoreField("257", "26/ORYX/06/257", SEARCH_WEIGHTS.number) > 0)
    assert.ok(scoreField("ash", "Ashley Construction", SEARCH_WEIGHTS.clientName) > 0)
    assert.ok(scoreField("oxf", "Oxford Street", SEARCH_WEIGHTS.address) > 0)
  })

  it("prefers exact number matches over weak contains", () => {
    assert.ok(
      scoreField("JOB-257", "JOB-257", SEARCH_WEIGHTS.number)
      > scoreField("257", "somewhere 257 else", SEARCH_WEIGHTS.other),
    )
  })

  it("picks best field score", () => {
    const score = bestScore("257", [
      { value: "26/ORYX/06/257", weight: SEARCH_WEIGHTS.number },
      { value: "Ashley", weight: SEARCH_WEIGHTS.clientName },
    ])
    assert.ok(score > 50)
  })

  it("highlights matched text", () => {
    const parts = highlightParts("Ashley Construction", "ash")
    assert.equal(parts.some(p => p.match && p.text.toLowerCase() === "ash"), true)
  })
})
