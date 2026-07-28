import { test, expect, loginAsAdmin } from "./helpers"

test.describe("Authentication", () => {
  test("redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/jobs")
    await expect(page).toHaveURL(/\/login/)
  })

  test("admin can log in and reach the dashboard", async ({ page }) => {
    await loginAsAdmin(page)
    await expect(page).toHaveURL("/")
    // Dashboard greeting is time-based ("Good morning/afternoon/evening, …")
    await expect(page.locator("h1").filter({ hasText: /Good (morning|afternoon|evening)/i })).toBeVisible()
  })

  test("wrong password shows an error", async ({ page }) => {
    await page.goto("/login")
    await page.locator("#email").fill("admin@test.com")
    await page.locator("#password").fill("wrong-password")
    await page.locator('button[type="submit"]').click()

    await expect(page.getByText(/invalid email or password/i)).toBeVisible()
  })
})
