import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { isNavItemActive } = require("../../shared/layouts/nav-utils.ts")

describe("isNavItemActive", () => {
  it("matches dashboard root only", () => {
    assert.equal(isNavItemActive("/", "dashboard", "/"), true)
    assert.equal(isNavItemActive("/jobs", "dashboard", "/"), false)
  })

  it("uses prefix matching for section routes", () => {
    assert.equal(isNavItemActive("/jobs/abc", "jobs", "/jobs"), true)
    assert.equal(isNavItemActive("/clients/hold-list", "clients", "/clients"), true)
  })
})
