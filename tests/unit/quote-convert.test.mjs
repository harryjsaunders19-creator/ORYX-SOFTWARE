import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { resolveWorksFromQuote } = require("../../modules/quotes/convert-works.ts")
const { canViewEmployeePhoto } = require("../../modules/employees/permissions.ts")
const {
  validateQuoteForConvert,
  quoteConvertHoldResponse,
} = require("../../modules/quotes/convert-validate.ts")

describe("resolveWorksFromQuote", () => {
  it("keeps a standard type of works unchanged", () => {
    const out = resolveWorksFromQuote({
      typeOfWorks: "Groundworks",
      customTypeDescription: null,
      description: "Dig and fill",
    })
    assert.equal(out.typeOfWorks, "Groundworks")
    assert.equal(out.customTypeDescription, null)
  })

  it("maps Other with missing description to a safe fallback", () => {
    const out = resolveWorksFromQuote({
      typeOfWorks: "Other",
      customTypeDescription: null,
      description: null,
    })
    assert.equal(out.typeOfWorks, "Other")
    assert.equal(out.customTypeDescription, "Converted from quote")
  })

  it("does not throw when type and descriptions are all empty", () => {
    const out = resolveWorksFromQuote({
      typeOfWorks: null,
      customTypeDescription: null,
      description: "",
    })
    assert.equal(out.typeOfWorks, "Other")
    assert.equal(out.customTypeDescription, "Converted from quote")
  })

  it("truncates long custom descriptions to 500 chars", () => {
    const long = "x".repeat(600)
    const out = resolveWorksFromQuote({
      typeOfWorks: "Other",
      customTypeDescription: long,
      description: null,
    })
    assert.equal(out.customTypeDescription?.length, 500)
  })
})

describe("validateQuoteForConvert", () => {
  it("rejects missing quotes", () => {
    const r = validateQuoteForConvert(null)
    assert.equal(r.ok, false)
    assert.equal(r.status, 404)
  })

  it("rejects non-accepted quotes", () => {
    const r = validateQuoteForConvert({ status: "DRAFT", jobId: null })
    assert.equal(r.ok, false)
    assert.equal(r.status, 422)
  })

  it("rejects already-converted quotes", () => {
    const r = validateQuoteForConvert({ status: "ACCEPTED", jobId: "job-1" })
    assert.equal(r.ok, false)
    assert.equal(r.status, 409)
  })

  it("rejects quotes linked via parent_job_id (work-items model)", () => {
    const r = validateQuoteForConvert({ status: "ACCEPTED", jobId: null, parentJobId: "parent-1" })
    assert.equal(r.ok, false)
    assert.equal(r.status, 409)
  })

  it("accepts convertible quotes", () => {
    const r = validateQuoteForConvert({ status: "ACCEPTED", jobId: null })
    assert.equal(r.ok, true)
  })
})

describe("quoteConvertHoldResponse", () => {
  it("returns hold payload for UI modal", () => {
    const r = quoteConvertHoldResponse("Unpaid invoices")
    assert.equal(r.status, 422)
    assert.equal(r.body.onHold, true)
    assert.equal(r.body.holdReason, "Unpaid invoices")
  })
})

describe("canViewEmployeePhoto", () => {
  it("allows active colleagues with profiles", () => {
    assert.equal(canViewEmployeePhoto({
      viewerActive: true,
      targetHasProfile: true,
      targetUserActive: true,
    }), true)
  })

  it("blocks inactive viewers", () => {
    assert.equal(canViewEmployeePhoto({
      viewerActive: false,
      targetHasProfile: true,
      targetUserActive: true,
    }), false)
  })

  it("blocks targets without employee profiles", () => {
    assert.equal(canViewEmployeePhoto({
      viewerActive: true,
      targetHasProfile: false,
      targetUserActive: true,
    }), false)
  })

  it("blocks inactive target users", () => {
    assert.equal(canViewEmployeePhoto({
      viewerActive: true,
      targetHasProfile: true,
      targetUserActive: false,
    }), false)
  })
})
