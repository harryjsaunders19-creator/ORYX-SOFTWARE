import { test as base, type Page } from "@playwright/test"

export async function loginAsAdmin(page: Page) {
  await page.goto("/login")
  await page.locator("#email").fill("admin@test.com")
  await page.locator("#password").fill("admin123")
  await page.locator('button[type="submit"]').click()
  await page.waitForURL("/")
}

export const test = base
export { expect } from "@playwright/test"
