import { test as base, type Page, type APIRequestContext } from "@playwright/test"

async function completeForcedPasswordChange(page: Page, nextPassword: string) {
  if (!page.url().includes("/set-password")) return
  await page.locator("#new-password").fill(nextPassword)
  await page.locator("#confirm-password").fill(nextPassword)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL("/")
}

export async function loginAsAdmin(page: Page) {
  await page.goto("/login")
  await page.locator("#email").fill("admin@test.com")
  await page.locator("#password").fill("admin123")
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(url => url.pathname === "/" || url.pathname === "/set-password", {
    timeout: 30_000,
  })
  await completeForcedPasswordChange(page, "Admin1234")
}

export async function loginAsAccounts(page: Page) {
  await page.context().clearCookies()
  await page.goto("/login")
  await page.locator("#email").fill("accounts@test.com")
  await page.locator("#password").fill("accounts123")
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(url => url.pathname === "/" || url.pathname === "/set-password", {
    timeout: 30_000,
  })
  await completeForcedPasswordChange(page, "Accounts1234")
}

export async function loginAsEngineer(page: Page) {
  // Clear any prior session so role switches in the same test are reliable.
  await page.context().clearCookies()
  await page.goto("/login")
  await page.locator("#email").fill("engineer@test.com")
  await page.locator("#password").fill("engineer123")
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(url => url.pathname === "/" || url.pathname === "/set-password", {
    timeout: 30_000,
  })
  await completeForcedPasswordChange(page, "Engineer1234")
}

export async function loginApi(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<void> {
  const res = await request.post("/api/auth/login", {
    data: { email, password },
  })
  if (!res.ok()) {
    throw new Error(`Login failed for ${email}: ${res.status()} ${await res.text()}`)
  }
}

export const test = base
export { expect } from "@playwright/test"
