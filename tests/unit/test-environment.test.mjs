import assert from "node:assert/strict"
import { describe, it, beforeEach, afterEach } from "node:test"

describe("isTestUserProvisioningAllowed", () => {
  const keys = [
    "NODE_ENV",
    "E2E",
    "ALLOW_BOOTSTRAP_TEST_ACCOUNTS",
    "VERCEL_ENV",
    "VERCEL",
    "ORYX_PRODUCTION_SUPABASE_PROJECT_REF",
    "ORYX_E2E_SUPABASE_PROJECT_REF",
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
  })

  async function load() {
    const path = new URL("../../shared/auth/test-environment.ts", import.meta.url).pathname
    return import(`${path}?t=${Date.now()}-${Math.random()}`)
  }

  function clearEnv() {
    for (const k of keys) delete process.env[k]
  }

  function allowBase() {
    process.env.NODE_ENV = "test"
    process.env.E2E = "true"
    process.env.ALLOW_BOOTSTRAP_TEST_ACCOUNTS = "true"
  }

  it("allows local E2E with test flag and non-prod runtime", async () => {
    clearEnv()
    allowBase()
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321"
    const mod = await load()
    assert.equal(mod.isTestUserProvisioningAllowed(), true)
  })

  it("allows approved hosted E2E Supabase project", async () => {
    clearEnv()
    allowBase()
    process.env.ORYX_E2E_SUPABASE_PROJECT_REF = "e2e-test-project"
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://e2e-test-project.supabase.co"
    const mod = await load()
    assert.equal(mod.isTestUserProvisioningAllowed(), true)
  })

  it("rejects production runtime even with correct production ref configured", async () => {
    clearEnv()
    process.env.NODE_ENV = "production"
    process.env.E2E = "true"
    process.env.ALLOW_BOOTSTRAP_TEST_ACCOUNTS = "true"
    process.env.ORYX_PRODUCTION_SUPABASE_PROJECT_REF = "prod-ref"
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://prod-ref.supabase.co"
    const mod = await load()
    assert.equal(mod.isTestUserProvisioningAllowed(), false)
    assert.equal(mod.testUserProvisioningDenialReason(), "test_flag_in_production")
  })

  it("rejects production with no project ref on hosted Supabase preview", async () => {
    clearEnv()
    allowBase()
    process.env.VERCEL = "1"
    process.env.VERCEL_ENV = "preview"
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://unknown-preview.supabase.co"
    const mod = await load()
    assert.equal(mod.isTestUserProvisioningAllowed(), false)
    assert.equal(mod.testUserProvisioningDenialReason(), "missing_production_project_ref")
  })

  it("rejects unknown hosted Supabase project", async () => {
    clearEnv()
    allowBase()
    process.env.ORYX_PRODUCTION_SUPABASE_PROJECT_REF = "prod-ref"
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://random-staging.supabase.co"
    const mod = await load()
    assert.equal(mod.isTestUserProvisioningAllowed(), false)
    assert.equal(mod.testUserProvisioningDenialReason(), "unknown_hosted_supabase")
  })

  it("rejects production Supabase project ref match", async () => {
    clearEnv()
    allowBase()
    process.env.ORYX_PRODUCTION_SUPABASE_PROJECT_REF = "prod-ref"
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://prod-ref.supabase.co"
    const mod = await load()
    assert.equal(mod.isTestUserProvisioningAllowed(), false)
    assert.equal(mod.testUserProvisioningDenialReason(), "production_supabase_project")
  })

  it("rejects when flag is missing", async () => {
    clearEnv()
    process.env.NODE_ENV = "test"
    process.env.E2E = "true"
    const mod = await load()
    assert.equal(mod.testUserProvisioningDenialReason(), "flag_disabled")
  })

  it("rejects conflicting flags (bootstrap without test/E2E env)", async () => {
    clearEnv()
    process.env.NODE_ENV = "development"
    process.env.ALLOW_BOOTSTRAP_TEST_ACCOUNTS = "true"
    const mod = await load()
    assert.equal(mod.testUserProvisioningDenialReason(), "inconsistent_e2e_flags")
  })

  it("rejects test flag enabled in production runtime", async () => {
    clearEnv()
    process.env.NODE_ENV = "production"
    process.env.ALLOW_BOOTSTRAP_TEST_ACCOUNTS = "true"
    const mod = await load()
    assert.equal(mod.testUserProvisioningDenialReason(), "test_flag_in_production")
  })

  it("parses supabase project refs", async () => {
    const mod = await load()
    assert.equal(mod.supabaseProjectRefFromUrl("https://abc123.supabase.co"), "abc123")
    assert.equal(mod.supabaseProjectRefFromUrl("http://127.0.0.1:54321"), null)
  })
})
