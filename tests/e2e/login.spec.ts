import { test, expect } from "@playwright/test"

test.describe("Authentication", () => {
  test("redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/jobs")
    await expect(page).toHaveURL(/\/login/)
  })

  test("admin can log in and reach the dashboard", async ({ page }) => {
    await page.goto("/login")
    await page.locator("#email").fill("admin@test.com")
    await page.locator("#password").fill("admin123")
    await page.locator('button[type="submit"]').click()

    await expect(page).toHaveURL("/")
    await expect(page.locator("h1").filter({ hasText: "Dashboard" })).toBeVisible()
  })

  test("wrong password shows an error", async ({ page }) => {
    await page.goto("/login")
    await page.locator("#email").fill("admin@test.com")
    await page.locator("#password").fill("wrong-password")
    await page.locator('button[type="submit"]').click()

    await expect(page.getByText(/invalid email or password/i)).toBeVisible()
  })
})
