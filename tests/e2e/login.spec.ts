import { test, expect } from "@playwright/test"

test.describe("Authentication", () => {
  test("redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/jobs")
    await expect(page).toHaveURL(/\/login/)
  })

  test("admin can log in and reach the dashboard", async ({ page }) => {
    await page.goto("/login")
    await page.getByLabel("Email").fill("admin@test.com")
    await page.getByLabel("Password").fill("admin123")
    await page.getByRole("button", { name: /sign in/i }).click()

    await expect(page).toHaveURL("/")
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible()
  })

  test("wrong password shows an error", async ({ page }) => {
    await page.goto("/login")
    await page.getByLabel("Email").fill("admin@test.com")
    await page.getByLabel("Password").fill("wrong-password")
    await page.getByRole("button", { name: /sign in/i }).click()

    await expect(page.getByText(/invalid email or password/i)).toBeVisible()
  })
})
