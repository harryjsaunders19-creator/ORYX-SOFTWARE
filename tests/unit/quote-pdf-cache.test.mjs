import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const {
  getCachedQuotePdf,
  setCachedQuotePdf,
  invalidateQuotePdf,
} = require("../../modules/quotes/pdf/cache.ts")

describe("quote PDF cache", () => {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46])

  it("stores and retrieves cached PDF bytes", () => {
    setCachedQuotePdf("q1", "2026-01-01T00:00:00Z", bytes, "Q-001.pdf")
    const hit = getCachedQuotePdf("q1", "2026-01-01T00:00:00Z")
    assert.ok(hit)
    assert.equal(hit.filename, "Q-001.pdf")
    assert.deepEqual(hit.pdfBytes, bytes)
  })

  it("misses when updatedAt differs", () => {
    setCachedQuotePdf("q2", "v1", bytes, "Q-002.pdf")
    assert.equal(getCachedQuotePdf("q2", "v2"), null)
  })

  it("invalidateQuotePdf clears all versions for a quote", () => {
    setCachedQuotePdf("q3", "v1", bytes, "a.pdf")
    setCachedQuotePdf("q3", "v2", bytes, "b.pdf")
    invalidateQuotePdf("q3")
    assert.equal(getCachedQuotePdf("q3", "v1"), null)
    assert.equal(getCachedQuotePdf("q3", "v2"), null)
  })
})
