/**
 * Plain-JS mirror of shared/auth/test-environment.ts for Node scripts
 * that cannot import TypeScript without tsx.
 * Keep in sync with the TypeScript source.
 */

function supabaseProjectRefFromUrl(url) {
  if (!url) return null
  try {
    const host = new URL(url).hostname
    const match = /^([a-z0-9-]+)\.supabase\.co$/i.exec(host)
    return match?.[1]?.toLowerCase() ?? null
  } catch {
    return null
  }
}

function currentSupabaseProjectRef() {
  return (
    supabaseProjectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
    ?? supabaseProjectRefFromUrl(process.env.SUPABASE_URL)
  )
}

function isProductionRuntime() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production"
}

function isVercelDeployment() {
  return process.env.VERCEL === "1" || !!process.env.VERCEL_ENV
}

function isHostedSupabaseProject() {
  return currentSupabaseProjectRef() !== null
}

function isLocalSupabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim()
  if (!url) return false
  try {
    const host = new URL(url).hostname
    return host === "127.0.0.1" || host === "localhost"
  } catch {
    return false
  }
}

function configuredProductionSupabaseRef() {
  const ref = (process.env.ORYX_PRODUCTION_SUPABASE_PROJECT_REF ?? "").trim().toLowerCase()
  return ref || null
}

function configuredE2ESupabaseRef() {
  const ref = (process.env.ORYX_E2E_SUPABASE_PROJECT_REF ?? "").trim().toLowerCase()
  return ref || null
}

function isProductionSupabaseProject() {
  const productionRef = configuredProductionSupabaseRef()
  if (!productionRef) return false
  const current = currentSupabaseProjectRef()
  if (!current) return false
  return current === productionRef
}

function isApprovedE2ESupabaseProject() {
  const approvedRef = configuredE2ESupabaseRef()
  if (!approvedRef) return false
  const current = currentSupabaseProjectRef()
  return !!current && current === approvedRef
}

function hasInconsistentE2EFlags() {
  const e2e = process.env.E2E === "true"
  const nodeTest = process.env.NODE_ENV === "test"
  const flag = process.env.ALLOW_BOOTSTRAP_TEST_ACCOUNTS === "true"
  if (!flag) return false
  if (!e2e && !nodeTest) return true
  if (isProductionRuntime() && (e2e || nodeTest || flag)) return true
  return false
}

function denialReason() {
  if (isProductionRuntime()) {
    if (process.env.ALLOW_BOOTSTRAP_TEST_ACCOUNTS === "true" || process.env.E2E === "true") {
      return "test_flag_in_production"
    }
    return "production_runtime"
  }
  if (hasInconsistentE2EFlags()) return "inconsistent_e2e_flags"
  if (!(process.env.NODE_ENV === "test" || process.env.E2E === "true")) return "missing_test_or_e2e_env"
  if (process.env.ALLOW_BOOTSTRAP_TEST_ACCOUNTS !== "true") return "flag_disabled"
  if (isVercelDeployment() && isHostedSupabaseProject() && !configuredProductionSupabaseRef()) {
    return "missing_production_project_ref"
  }
  if (isProductionSupabaseProject()) return "production_supabase_project"
  if (isHostedSupabaseProject() && !isLocalSupabaseUrl() && !isApprovedE2ESupabaseProject()) {
    return "unknown_hosted_supabase"
  }
  return null
}

const MESSAGES = {
  missing_test_or_e2e_env: "Test-user provisioning requires NODE_ENV=test or E2E=true",
  flag_disabled: "Test-user provisioning requires ALLOW_BOOTSTRAP_TEST_ACCOUNTS=true",
  production_runtime: "Test-user provisioning is forbidden in production runtimes",
  production_supabase_project: "Test-user provisioning is forbidden against the production Supabase project",
  missing_production_project_ref:
    "Test-user provisioning blocked: ORYX_PRODUCTION_SUPABASE_PROJECT_REF is required for hosted Supabase deployments",
  unknown_hosted_supabase:
    "Test-user provisioning blocked: hosted Supabase project is not an approved local or E2E test project",
  inconsistent_e2e_flags: "Test-user provisioning blocked: E2E/test flags are incomplete or inconsistent",
  test_flag_in_production: "Test-user provisioning is forbidden when test/E2E flags are enabled in production",
}

export function assertTestEnvironment(context) {
  const reason = denialReason()
  if (!reason) return
  console.warn(JSON.stringify({
    level: "security",
    event: "test_user_provisioning_blocked",
    reason,
    message: MESSAGES[reason],
    context: context ?? null,
    nodeEnv: process.env.NODE_ENV ?? null,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    e2e: process.env.E2E === "true",
    flag: process.env.ALLOW_BOOTSTRAP_TEST_ACCOUNTS === "true",
    supabaseRef: currentSupabaseProjectRef(),
    productionRefConfigured: !!configuredProductionSupabaseRef(),
    e2eRefConfigured: !!configuredE2ESupabaseRef(),
    at: new Date().toISOString(),
  }))
  throw new Error(`${MESSAGES[reason]}${context ? ` (${context})` : ""}`)
}
