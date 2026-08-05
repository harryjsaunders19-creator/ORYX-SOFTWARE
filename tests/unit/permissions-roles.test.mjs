import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  hasFullAccess,
  isDesignerEligible,
  isDesignerEligibleRole,
  canCreateJob,
  canManageUsers,
  canManageSystem,
  canViewPerformance,
  canCreateQuote,
  canUseSiteVisitCalculator,
  canAccessModule,
  coerceRole,
  roleDisplayLabel,
  ROLES,
} from "../../shared/auth/permissions.ts"

describe("role and permission helpers", () => {
  it("defines Admin, Engineer, and Accounts", () => {
    assert.deepEqual([...ROLES], ["ADMIN", "ENGINEER", "ACCOUNTS"])
  })

  it("gives Admin and Accounts full access", () => {
    assert.equal(hasFullAccess("ADMIN"), true)
    assert.equal(hasFullAccess("ACCOUNTS"), true)
    assert.equal(hasFullAccess("ENGINEER"), false)
  })

  it("marks only Admin and Engineer as designer-eligible", () => {
    assert.equal(isDesignerEligibleRole("ADMIN"), true)
    assert.equal(isDesignerEligibleRole("ENGINEER"), true)
    assert.equal(isDesignerEligibleRole("ACCOUNTS"), false)
    assert.equal(isDesignerEligible({ role: "ACCOUNTS", active: 1 }), false)
    assert.equal(isDesignerEligible({ role: "ENGINEER", active: 0 }), false)
    assert.equal(isDesignerEligible({ role: "ENGINEER", active: 1 }), true)
  })

  it("allows Engineers to create jobs and quotes", () => {
    assert.equal(canCreateJob("ENGINEER"), true)
    assert.equal(canCreateJob({ role: "ENGINEER", moduleAccess: null }), true)
    assert.equal(canCreateQuote("ENGINEER"), true)
    assert.equal(canUseSiteVisitCalculator("ENGINEER"), true)
  })

  it("blocks Engineers from user and system management", () => {
    assert.equal(canManageUsers("ENGINEER"), false)
    assert.equal(canManageSystem("ENGINEER"), false)
    assert.equal(canViewPerformance("ENGINEER"), false)
    assert.equal(canAccessModule("ENGINEER", "users"), false)
    assert.equal(canAccessModule("ENGINEER", "backups"), false)
  })

  it("gives Accounts the same modules as Admin", () => {
    for (const key of ["users", "billing", "performance", "backups", "jobs", "quotes"]) {
      assert.equal(canAccessModule("ACCOUNTS", key), canAccessModule("ADMIN", key), key)
    }
    assert.equal(canManageUsers("ACCOUNTS"), true)
    assert.equal(canManageSystem("ACCOUNTS"), true)
    assert.equal(canCreateJob("ACCOUNTS"), true)
  })

  it("coerces and labels roles", () => {
    assert.equal(coerceRole("accounts"), "ACCOUNTS")
    assert.equal(coerceRole("nope"), "ENGINEER")
    assert.equal(roleDisplayLabel("ACCOUNTS"), "Accounts")
    assert.equal(roleDisplayLabel("ADMIN"), "Admin")
  })
})
