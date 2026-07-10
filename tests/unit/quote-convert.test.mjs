import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { resolveWorksFromQuote } = require("../../modules/quotes/convert-works.ts")
const { canViewEmployeePhoto } = require("../../modules/employees/permissions.ts")

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
