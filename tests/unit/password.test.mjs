import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { generateTempPassword, validatePasswordStrength } = require("../../shared/auth/password.ts")

describe("generateTempPassword", () => {
  it("returns 12 characters", () => {
    assert.equal(generateTempPassword().length, 12)
  })

  it("uses only allowed characters", () => {
    const allowed = /^[ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789]+$/
    for (let i = 0; i < 20; i++) {
      assert.match(generateTempPassword(), allowed)
    }
  })

  it("produces different values across calls", () => {
    const a = generateTempPassword()
    const b = generateTempPassword()
    assert.notEqual(a, b)
  })
})

describe("validatePasswordStrength", () => {
  it("accepts a strong password", () => {
    assert.equal(validatePasswordStrength("SecurePass1"), null)
  })

  it("rejects short passwords", () => {
    assert.match(validatePasswordStrength("Ab1"), /at least 8/)
  })

  it("requires uppercase", () => {
    assert.match(validatePasswordStrength("lowercase1"), /uppercase/)
  })

  it("requires lowercase", () => {
    assert.match(validatePasswordStrength("UPPERCASE1"), /lowercase/)
  })

  it("requires a number", () => {
    assert.match(validatePasswordStrength("NoNumbers"), /number/)
  })
})
