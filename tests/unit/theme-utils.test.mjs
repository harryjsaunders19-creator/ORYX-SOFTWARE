import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { resolveTheme, isThemePreference } = require("../../shared/theme/theme-utils.ts")

describe("resolveTheme", () => {
  it("returns light and dark explicitly", () => {
    assert.equal(resolveTheme("light", true), "light")
    assert.equal(resolveTheme("dark", false), "dark")
  })

  it("follows system preference when set to system", () => {
    assert.equal(resolveTheme("system", true), "dark")
    assert.equal(resolveTheme("system", false), "light")
  })
})

describe("isThemePreference", () => {
  it("accepts valid values only", () => {
    assert.equal(isThemePreference("light"), true)
    assert.equal(isThemePreference("dark"), true)
    assert.equal(isThemePreference("system"), true)
    assert.equal(isThemePreference("invalid"), false)
    assert.equal(isThemePreference(null), false)
  })
})
