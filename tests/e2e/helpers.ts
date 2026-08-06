import { test as base, type Page, type APIRequestContext } from "@playwright/test"

const TEST_USERS = {
  admin: "admin@test.com",
  accounts: "accounts@test.com",
  engineer: "engineer@test.com",
} as const

/** Password candidates for an E2E test account — env vars first, then known seed/post-change values. */
function passwordCandidates(email: string, explicit?: string): string[] {
  const lower = email.trim().toLowerCase()
  const shared = [explicit, process.env.TEST_PASSWORD].filter(Boolean) as string[]

  if (lower === TEST_USERS.admin) {
    return [...new Set([
      ...shared,
      process.env.TEST_ADMIN_PASSWORD,
      "admin123",
      "Admin1234",
    ].filter(Boolean) as string[])]
  }
  if (lower === TEST_USERS.accounts) {
    return [...new Set([
      ...shared,
      process.env.TEST_ACCOUNTS_PASSWORD,
      "accounts123",
      "Accounts1234",
    ].filter(Boolean) as string[])]
  }
  if (lower === TEST_USERS.engineer) {
    return [...new Set([
      ...shared,
      process.env.TEST_ENGINEER_PASSWORD,
      "engineer123",
      "Engineer1234",
    ].filter(Boolean) as string[])]
  }

  return [...new Set([...shared, "admin123", "Admin1234"].filter(Boolean) as string[])]
}

async function completeForcedPasswordChange(page: Page, nextPassword: string) {
  if (!page.url().includes("/set-password")) return
  await page.locator("#new-password").fill(nextPassword)
  await page.locator("#confirm-password").fill(nextPassword)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL("/")
}

async function loginViaPage(page: Page, email: string, explicitPassword?: string) {
  await page.context().clearCookies()
  const candidates = passwordCandidates(email, explicitPassword)
  let lastError = "no login attempts made"

  for (const password of candidates) {
    await page.goto("/login")
    await page.locator("#email").fill(email)
    await page.locator("#password").fill(password)
    await page.locator('button[type="submit"]').click()

    try {
      await page.waitForURL(
        url => url.pathname === "/" || url.pathname === "/set-password",
        { timeout: 15_000 },
      )
      if (page.url().includes("/set-password")) {
        const postChange =
          email === TEST_USERS.admin ? "Admin1234"
          : email === TEST_USERS.accounts ? "Accounts1234"
          : email === TEST_USERS.engineer ? "Engineer1234"
          : password
        await completeForcedPasswordChange(page, postChange)
      }
      if (!page.url().includes("/login")) return
      lastError = "redirected back to login"
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
  }

  throw new Error(`UI login failed for ${email} after ${candidates.length} attempt(s): ${lastError}`)
}

export async function loginAsAdmin(page: Page) {
  await loginViaPage(page, TEST_USERS.admin)
}

export async function loginAsAccounts(page: Page) {
  await loginViaPage(page, TEST_USERS.accounts)
}

export async function loginAsEngineer(page: Page) {
  await loginViaPage(page, TEST_USERS.engineer)
}

export async function loginApi(
  request: APIRequestContext,
  email: string,
  password?: string,
): Promise<void> {
  const candidates = passwordCandidates(email, password)
  let lastStatus = 0
  let lastBody = ""

  for (const p of candidates) {
    const res = await request.post("/api/auth/login", {
      data: { email, password: p },
    })
    if (res.ok()) return
    lastStatus = res.status()
    lastBody = await res.text()
    if (process.env.CI !== "true") {
      console.log(`loginApi: ${email} attempt returned ${lastStatus}`)
    }
  }

  throw new Error(`Login failed for ${email}: ${lastStatus} ${lastBody}`)
}

/** Lightweight auth sanity check — call at the start of API-heavy suites if needed. */
export async function assertTestAuthReady(request: APIRequestContext): Promise<void> {
  await loginApi(request, TEST_USERS.admin)
}

export const test = base
export { expect } from "@playwright/test"
