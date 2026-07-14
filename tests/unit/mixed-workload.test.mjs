import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { SINGLE_JOB_ITEM_TYPES } from "../../lib/migrations/work-items-backfill.ts"

describe("Phase 3 mixed workload helpers", () => {
  it("treats site visits and surveys as single jobs", () => {
    assert.equal(SINGLE_JOB_ITEM_TYPES.has("SITE_VISIT"), true)
    assert.equal(SINGLE_JOB_ITEM_TYPES.has("SURVEY"), true)
    assert.equal(SINGLE_JOB_ITEM_TYPES.has("INSPECTION"), true)
    assert.equal(SINGLE_JOB_ITEM_TYPES.has("CATIII_DESIGN_CHECK"), true)
    assert.equal(SINGLE_JOB_ITEM_TYPES.has("DESIGN"), false)
    assert.equal(SINGLE_JOB_ITEM_TYPES.has("REVISION"), false)
  })
})
