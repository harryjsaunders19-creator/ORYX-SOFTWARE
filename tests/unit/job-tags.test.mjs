import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  sanitizeJobTags,
  normalizeJobTag,
  matchingJobTags,
  JOB_TAG_MAX_LEN,
} from "../../lib/constants.ts"

describe("normalizeJobTag", () => {
  it("trims and collapses whitespace", () => {
    assert.equal(normalizeJobTag("  Site  Visit  "), "Site Visit")
  })

  it("rejects empty and oversized tags", () => {
    assert.equal(normalizeJobTag("   "), null)
    assert.equal(normalizeJobTag("x".repeat(JOB_TAG_MAX_LEN + 1)), null)
  })
})

describe("sanitizeJobTags", () => {
  it("accepts preset tags", () => {
    assert.deepEqual(sanitizeJobTags(["Temporary Roof", "Gantry"]), ["Temporary Roof", "Gantry"])
  })

  it("accepts custom tags", () => {
    assert.deepEqual(sanitizeJobTags(["Harbour works", "Night shift"]), ["Harbour works", "Night shift"])
  })

  it("dedupes case-insensitively and prefers preset spelling", () => {
    assert.deepEqual(
      sanitizeJobTags(["temporary roof", "Temporary Roof", "Harbour"]),
      ["Temporary Roof", "Harbour"],
    )
  })

  it("rejects non-arrays and invalid entries", () => {
    assert.equal(sanitizeJobTags("Gantry"), null)
    assert.equal(sanitizeJobTags([123]), null)
    assert.equal(sanitizeJobTags([""]), null)
    assert.equal(sanitizeJobTags(["x".repeat(JOB_TAG_MAX_LEN + 1)]), null)
  })
})

describe("matchingJobTags", () => {
  it("includes exact free-text query for custom tag search", () => {
    const hits = matchingJobTags("Harbour works")
    assert.ok(hits.includes("Harbour works"))
  })

  it("still matches preset tags by fuzzy needle", () => {
    assert.ok(matchingJobTags("gantry").includes("Gantry"))
  })
})
