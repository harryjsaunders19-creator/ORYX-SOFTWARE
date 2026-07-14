import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const {
  parsePositiveInt,
  parsePageParam,
  parseLimitParam,
} = require("../../shared/utils/pagination.ts")

describe("pagination parsers", () => {
  it("falls back when parseInt would be NaN", () => {
    assert.equal(parsePositiveInt("nope", 7), 7)
    assert.equal(parsePositiveInt("", 3), 3)
    assert.equal(parsePositiveInt(null, 2), 2)
    assert.equal(parsePageParam("abc"), 1)
    assert.equal(parseLimitParam("xyz", 25, 100), 25)
  })

  it("clamps page and limit", () => {
    assert.equal(parsePageParam("0"), 1)
    assert.equal(parsePageParam("-5"), 1)
    assert.equal(parsePageParam("4"), 4)
    assert.equal(parseLimitParam("999", 25, 100), 100)
    assert.equal(parseLimitParam("0", 25, 100), 1)
    assert.equal(parseLimitParam("40", 25, 100), 40)
  })
})
