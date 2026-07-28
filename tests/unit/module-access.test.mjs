import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const {
  canAccessModule,
  normalizeModuleAccess,
  parseModuleAccessJson,
  getModule,
} = require("../../shared/auth/permissions.ts")

describe("module access", () => {
  it("admins always pass known modules", () => {
    assert.equal(canAccessModule("ADMIN", "jobs", ["dashboard"]), true)
    assert.equal(canAccessModule("ADMIN", "billing", null), true)
  })

  it("engineers use role defaults when moduleAccess is null", () => {
    assert.equal(canAccessModule("ENGINEER", "jobs", null), true)
    assert.equal(canAccessModule("ENGINEER", "billing", null), false)
  })

  it("engineers honour an explicit allow-list", () => {
    assert.equal(canAccessModule("ENGINEER", "jobs", ["dashboard", "clients"]), false)
    assert.equal(canAccessModule("ENGINEER", "clients", ["dashboard", "clients"]), true)
  })

  it("strips admin-only keys from engineer allow-lists", () => {
    assert.deepEqual(
      normalizeModuleAccess(["jobs", "billing", "users", "jobs", "nope"]),
      ["jobs"],
    )
  })

  it("parses moduleAccessJson safely", () => {
    assert.deepEqual(parseModuleAccessJson('["jobs","quotes"]'), ["jobs", "quotes"])
    assert.equal(parseModuleAccessJson("not-json"), null)
    assert.equal(parseModuleAccessJson(null), null)
  })

  it("exposes registered modules for fail-closed API checks", () => {
    assert.ok(getModule("jobs"))
    assert.equal(getModule("not-a-real-module"), undefined)
  })
})
