import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const {
  escapePostgrestFilterValue,
  postgrestOrIlike,
} = require("../../shared/supabase/postgrest-filter.ts")

describe("escapePostgrestFilterValue", () => {
  it("escapes backslash, percent, and underscore", () => {
    assert.equal(escapePostgrestFilterValue("a\\b%c_d"), "a\\\\b\\%c\\_d")
  })

  it("replaces PostgREST filter metacharacters with spaces", () => {
    assert.equal(escapePostgrestFilterValue("foo,bar(baz).qux"), "foo bar baz  qux")
  })

  it("leaves ordinary search terms unchanged", () => {
    assert.equal(escapePostgrestFilterValue("Acme Ltd"), "Acme Ltd")
  })
})

describe("postgrestOrIlike", () => {
  it("builds escaped or-clauses", () => {
    assert.equal(
      postgrestOrIlike(["name", "email"], "a,b"),
      "name.ilike.%a b%,email.ilike.%a b%",
    )
  })

  it("returns null for blank terms", () => {
    assert.equal(postgrestOrIlike(["name"], "   "), null)
  })
})
