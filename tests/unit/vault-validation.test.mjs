import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const {
  parseCreateBody,
  parseUpdateBody,
  parseSortOrder,
} = require("../../modules/password-vault/api/validation.ts")

describe("parseCreateBody", () => {
  it("requires service name and password", () => {
    assert.equal(parseCreateBody({}).error, "Service name is required")
    assert.equal(parseCreateBody({ serviceName: "Adobe" }).error, "Password is required")
  })

  it("accepts a valid payload", () => {
    const result = parseCreateBody({
      serviceName: " Canva ",
      loginUrl: "https://canva.com",
      username: "team@oryx.design",
      password: "secret",
      category: "Design",
      notes: "Shared seat",
    })
    assert.ok("data" in result)
    assert.equal(result.data.serviceName, "Canva")
    assert.equal(result.data.password, "secret")
    assert.equal(result.data.category, "Design")
  })
})

describe("parseUpdateBody", () => {
  it("rejects empty service name updates", () => {
    assert.equal(parseUpdateBody({ serviceName: "  " }).error, "Service name is required")
  })

  it("rejects empty password updates", () => {
    assert.equal(parseUpdateBody({ password: "" }).error, "Password cannot be empty")
  })

  it("accepts partial updates", () => {
    const result = parseUpdateBody({ notes: "Renewal in March" })
    assert.ok("data" in result)
    assert.equal(result.data.notes, "Renewal in March")
  })
})

describe("parseSortOrder", () => {
  it("defaults to asc", () => {
    assert.equal(parseSortOrder(null), "asc")
    assert.equal(parseSortOrder("asc"), "asc")
  })

  it("accepts desc", () => {
    assert.equal(parseSortOrder("desc"), "desc")
  })
})
