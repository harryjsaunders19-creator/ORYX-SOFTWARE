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

function isProductionRuntime() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production"
}

function isProductionSupabaseProject() {
  const productionRef = (process.env.ORYX_PRODUCTION_SUPABASE_PROJECT_REF ?? "").trim().toLowerCase()
  if (!productionRef) return false
  const current =
    supabaseProjectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
    ?? supabaseProjectRefFromUrl(process.env.SUPABASE_URL)
  if (!current) return false
  return current === productionRef
}

function denialReason() {
  if (!(process.env.NODE_ENV === "test" || process.env.E2E === "true")) return "missing_test_or_e2e_env"
  if (process.env.ALLOW_BOOTSTRAP_TEST_ACCOUNTS !== "true") return "flag_disabled"
  if (isProductionRuntime()) return "production_runtime"
  if (isProductionSupabaseProject()) return "production_supabase_project"
  return null
}

const MESSAGES = {
  missing_test_or_e2e_env: "Test-user provisioning requires NODE_ENV=test or E2E=true",
  flag_disabled: "Test-user provisioning requires ALLOW_BOOTSTRAP_TEST_ACCOUNTS=true",
  production_runtime: "Test-user provisioning is forbidden in production runtimes",
  production_supabase_project: "Test-user provisioning is forbidden against the production Supabase project",
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
    at: new Date().toISOString(),
  }))
  throw new Error(`${MESSAGES[reason]}${context ? ` (${context})` : ""}`)
}
