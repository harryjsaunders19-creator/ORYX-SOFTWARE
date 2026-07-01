import { describe, it, afterEach } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { getAuthSecret } = require("../../shared/auth/session-cookie.ts")

describe("getAuthSecret", () => {
  const originalSecret = process.env.AUTH_SECRET
  const originalNodeEnv = process.env.NODE_ENV

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.AUTH_SECRET
    else process.env.AUTH_SECRET = originalSecret
    process.env.NODE_ENV = originalNodeEnv
  })

  it("returns AUTH_SECRET when set", () => {
    process.env.AUTH_SECRET = "  my-secret  "
    process.env.NODE_ENV = "production"
    assert.equal(getAuthSecret(), "my-secret")
  })

  it("throws in production when AUTH_SECRET is missing", () => {
    delete process.env.AUTH_SECRET
    process.env.NODE_ENV = "production"
    assert.throws(() => getAuthSecret(), /AUTH_SECRET must be set/)
  })

  it("falls back to dev default outside production", () => {
    delete process.env.AUTH_SECRET
    process.env.NODE_ENV = "development"
    assert.equal(getAuthSecret(), "oryx-dev-auth-secret-change-me")
  })
})
