import { test as base, type Page, type APIRequestContext } from "@playwright/test"

export async function loginAsAdmin(page: Page) {
  await page.goto("/login")
  await page.locator("#email").fill("admin@test.com")
  await page.locator("#password").fill("admin123")
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(url => url.pathname === "/" || url.pathname === "/set-password")
  if (page.url().includes("/set-password")) {
    await page.locator("#new-password").fill("Admin1234")
    await page.locator("#confirm-password").fill("Admin1234")
    await page.locator('button[type="submit"]').click()
    await page.waitForURL("/")
  }
}

export async function loginAsEngineer(page: Page) {
  await page.goto("/login")
  await page.locator("#email").fill("engineer@test.com")
  await page.locator("#password").fill("engineer123")
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(url => url.pathname === "/" || url.pathname === "/set-password")
  if (page.url().includes("/set-password")) {
    await page.locator("#new-password").fill("Engineer1234")
    await page.locator("#confirm-password").fill("Engineer1234")
    await page.locator('button[type="submit"]').click()
    await page.waitForURL("/")
  }
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
