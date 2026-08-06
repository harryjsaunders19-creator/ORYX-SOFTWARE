import assert from "node:assert/strict"
import { describe, it, beforeEach, afterEach } from "node:test"

describe("isTestUserProvisioningAllowed", () => {
  const keys = [
    "NODE_ENV",
    "E2E",
    "ALLOW_BOOTSTRAP_TEST_ACCOUNTS",
    "VERCEL_ENV",
    "ORYX_PRODUCTION_SUPABASE_PROJECT_REF",
    "NEXT_PUBLIC_SUPABASE_URL",
  ]
  /** @type {Record<string, string | undefined>} */
  const original = {}

  beforeEach(() => {
    for (const k of keys) original[k] = process.env[k]
  })

  afterEach(() => {
    for (const k of keys) {
      if (original[k] === undefined) delete process.env[k]
      else process.env[k] = original[k]
    }
    // Clear module cache so env reads re-evaluate — use dynamic import each time via createRequire
  })

  async function load() {
    // Bust cache between cases
    const path = new URL("../../shared/auth/test-environment.ts", import.meta.url).pathname
    const resolved = await import(`${path}?t=${Date.now()}-${Math.random()}`)
    return resolved
  }

  function clearEnv() {
    for (const k of keys) delete process.env[k]
  }

  it("allows only when test/E2E + flag + non-prod + non-prod supabase", async () => {
    clearEnv()
    process.env.NODE_ENV = "test"
    process.env.E2E = "true"
    process.env.ALLOW_BOOTSTRAP_TEST_ACCOUNTS = "true"
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://local-e2e.supabase.co"
    process.env.ORYX_PRODUCTION_SUPABASE_PROJECT_REF = "prod-project-ref"
    const mod = await load()
    assert.equal(mod.isTestUserProvisioningAllowed(), true)
    assert.equal(mod.testUserProvisioningDenialReason(), null)
  })

  it("rejects production NODE_ENV even with flag and E2E", async () => {
    clearEnv()
    process.env.NODE_ENV = "production"
    process.env.E2E = "true"
    process.env.ALLOW_BOOTSTRAP_TEST_ACCOUNTS = "true"
    const mod = await load()
    assert.equal(mod.isTestUserProvisioningAllowed(), false)
    assert.equal(mod.testUserProvisioningDenialReason(), "production_runtime")
    assert.throws(() => mod.assertTestEnvironment("unit"), /forbidden in production/)
  })

  it("rejects when flag is missing", async () => {
    clearEnv()
    process.env.NODE_ENV = "test"
    process.env.E2E = "true"
    const mod = await load()
    assert.equal(mod.isTestUserProvisioningAllowed(), false)
    assert.equal(mod.testUserProvisioningDenialReason(), "flag_disabled")
  })

  it("rejects when neither test nor E2E", async () => {
    clearEnv()
    process.env.NODE_ENV = "development"
    process.env.ALLOW_BOOTSTRAP_TEST_ACCOUNTS = "true"
    const mod = await load()
    assert.equal(mod.isTestUserProvisioningAllowed(), false)
    assert.equal(mod.testUserProvisioningDenialReason(), "missing_test_or_e2e_env")
  })

  it("rejects production Supabase project ref", async () => {
    clearEnv()
    process.env.NODE_ENV = "test"
    process.env.E2E = "true"
    process.env.ALLOW_BOOTSTRAP_TEST_ACCOUNTS = "true"
    process.env.ORYX_PRODUCTION_SUPABASE_PROJECT_REF = "onnjyvbygbazcrypwbqg"
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://onnjyvbygbazcrypwbqg.supabase.co"
    const mod = await load()
    assert.equal(mod.isTestUserProvisioningAllowed(), false)
    assert.equal(mod.testUserProvisioningDenialReason(), "production_supabase_project")
  })

  it("parses supabase project refs", async () => {
    const mod = await load()
    assert.equal(mod.supabaseProjectRefFromUrl("https://abc123.supabase.co"), "abc123")
    assert.equal(mod.supabaseProjectRefFromUrl("not-a-url"), null)
  })
})
