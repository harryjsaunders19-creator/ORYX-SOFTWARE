/**
 * Fail-closed guard for test-user provisioning (admin@test.com / engineer@test.com).
 *
 * Allowed only when ALL of:
 *  1. NODE_ENV === "test" OR E2E === "true"
 *  2. ALLOW_BOOTSTRAP_TEST_ACCOUNTS === "true"
 *  3. Not a production runtime (NODE_ENV / VERCEL_ENV)
 *  4. Hosted Supabase project passes ref checks (see below)
 *  5. E2E flags are consistent (not production + test flag)
 */
export type TestProvisioningDenialReason =
  | "missing_test_or_e2e_env"
  | "flag_disabled"
  | "production_runtime"
  | "production_supabase_project"
  | "missing_production_project_ref"
  | "unknown_hosted_supabase"
  | "inconsistent_e2e_flags"
  | "test_flag_in_production"

export function isProductionRuntime(): boolean {
  if (process.env.NODE_ENV === "production") return true
  if (process.env.VERCEL_ENV === "production") return true
  return false
}

export function isVercelDeployment(): boolean {
  return process.env.VERCEL === "1" || !!process.env.VERCEL_ENV
}

/** Extract the Supabase project ref from a URL like https://abcd.supabase.co */
export function supabaseProjectRefFromUrl(url: string | undefined | null): string | null {
  if (!url) return null
  try {
    const host = new URL(url).hostname
    const match = /^([a-z0-9-]+)\.supabase\.co$/i.exec(host)
    return match?.[1]?.toLowerCase() ?? null
  } catch {
    return null
  }
}

export function currentSupabaseProjectRef(): string | null {
  return (
    supabaseProjectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
    ?? supabaseProjectRefFromUrl(process.env.SUPABASE_URL)
  )
}

export function isHostedSupabaseProject(): boolean {
  return currentSupabaseProjectRef() !== null
}

export function isLocalSupabaseUrl(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim()
  if (!url) return false
  try {
    const host = new URL(url).hostname
    return host === "127.0.0.1" || host === "localhost"
  } catch {
    return false
  }
}

export function configuredProductionSupabaseRef(): string | null {
  const ref = (process.env.ORYX_PRODUCTION_SUPABASE_PROJECT_REF ?? "").trim().toLowerCase()
  return ref || null
}

export function configuredE2ESupabaseRef(): string | null {
  const ref = (process.env.ORYX_E2E_SUPABASE_PROJECT_REF ?? "").trim().toLowerCase()
  return ref || null
}

export function isProductionSupabaseProject(): boolean {
  const productionRef = configuredProductionSupabaseRef()
  if (!productionRef) return false
  const current = currentSupabaseProjectRef()
  if (!current) return false
  return current === productionRef
}

export function isApprovedE2ESupabaseProject(): boolean {
  const approvedRef = configuredE2ESupabaseRef()
  if (!approvedRef) return false
  const current = currentSupabaseProjectRef()
  return !!current && current === approvedRef
}

export function isTestOrE2EEnvironment(): boolean {
  return process.env.NODE_ENV === "test" || process.env.E2E === "true"
}

export function isTestUserProvisioningFlagEnabled(): boolean {
  return process.env.ALLOW_BOOTSTRAP_TEST_ACCOUNTS === "true"
}

function hasInconsistentE2EFlags(): boolean {
  const e2e = process.env.E2E === "true"
  const nodeTest = process.env.NODE_ENV === "test"
  const flag = isTestUserProvisioningFlagEnabled()
  if (!flag) return false
  // Flag set but neither E2E nor NODE_ENV=test — incomplete setup.
  if (!e2e && !nodeTest) return true
  // Production runtime with any test/E2E signal is inconsistent.
  if (isProductionRuntime() && (e2e || nodeTest || flag)) return true
  return false
}

export function testUserProvisioningDenialReason(): TestProvisioningDenialReason | null {
  if (isProductionRuntime()) {
    if (isTestUserProvisioningFlagEnabled() || process.env.E2E === "true") {
      return "test_flag_in_production"
    }
    return "production_runtime"
  }

  if (hasInconsistentE2EFlags()) return "inconsistent_e2e_flags"

  if (!isTestOrE2EEnvironment()) return "missing_test_or_e2e_env"
  if (!isTestUserProvisioningFlagEnabled()) return "flag_disabled"

  // Production deployment must declare the production project ref when hosted Supabase is configured.
  if (isVercelDeployment() && isHostedSupabaseProject() && !configuredProductionSupabaseRef()) {
    return "missing_production_project_ref"
  }

  if (isProductionSupabaseProject()) return "production_supabase_project"

  // Hosted Supabase that is not local CLI, not production, and not an approved E2E project.
  if (isHostedSupabaseProject() && !isLocalSupabaseUrl() && !isApprovedE2ESupabaseProject()) {
    return "unknown_hosted_supabase"
  }

  return null
}

export function isTestUserProvisioningAllowed(): boolean {
  return testUserProvisioningDenialReason() === null
}

const REASON_MESSAGES: Record<TestProvisioningDenialReason, string> = {
  missing_test_or_e2e_env:
    "Test-user provisioning requires NODE_ENV=test or E2E=true",
  flag_disabled:
    "Test-user provisioning requires ALLOW_BOOTSTRAP_TEST_ACCOUNTS=true",
  production_runtime:
    "Test-user provisioning is forbidden in production runtimes",
  production_supabase_project:
    "Test-user provisioning is forbidden against the production Supabase project",
  missing_production_project_ref:
    "Test-user provisioning blocked: ORYX_PRODUCTION_SUPABASE_PROJECT_REF is required for hosted Supabase deployments",
  unknown_hosted_supabase:
    "Test-user provisioning blocked: hosted Supabase project is not an approved local or E2E test project",
  inconsistent_e2e_flags:
    "Test-user provisioning blocked: E2E/test flags are incomplete or inconsistent",
  test_flag_in_production:
    "Test-user provisioning is forbidden when test/E2E flags are enabled in production",
}

/** Structured security log — never includes passwords or hashes. */
export function logTestProvisioningBlocked(reason: TestProvisioningDenialReason, context?: string): void {
  console.warn(JSON.stringify({
    level: "security",
    event: "test_user_provisioning_blocked",
    reason,
    message: REASON_MESSAGES[reason],
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
}

/**
 * Abort immediately if test-user provisioning is not allowed.
 * Throws an Error with a clear message (no secrets).
 */
export function assertTestEnvironment(context?: string): void {
  const reason = testUserProvisioningDenialReason()
  if (!reason) return
  logTestProvisioningBlocked(reason, context)
  throw new Error(`${REASON_MESSAGES[reason]}${context ? ` (${context})` : ""}`)
}
