import AxeBuilder from "@axe-core/playwright"
import { test, expect, loginAsAdmin, assertTestAuthReady } from "./helpers"

async function expectNoCriticalAxe(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze()
  const critical = results.violations.filter(v => v.impact === "critical")
  expect(critical, JSON.stringify(critical, null, 2)).toEqual([])
}

/**
 * Lightweight axe smoke — catches critical a11y regressions on key
 * authenticated surfaces. Expand route coverage / raise severity as
 * modules get a11y polish.
 */
test.describe("Accessibility smoke", () => {
  test.beforeAll(async ({ request }) => {
    await assertTestAuthReady(request)
  })

  test("login page has no critical axe violations", async ({ page }) => {
    await page.goto("/login")
    await expectNoCriticalAxe(page)
  })

  test("dashboard has no critical axe violations", async ({ page }) => {
    await loginAsAdmin(page)
    await expect(page).toHaveURL("/")
    await expect(page.locator("h1").filter({ hasText: /Good (morning|afternoon|evening)/i })).toBeVisible()
    await expectNoCriticalAxe(page)
  })

  test("jobs list has no critical axe violations", async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto("/jobs")
    await expect(page.locator("#jobs-search")).toBeVisible({ timeout: 15_000 })
    await expectNoCriticalAxe(page)
  })

  test("clients list has no critical axe violations", async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto("/clients")
    await expect(page.locator("h1").filter({ hasText: /client/i })).toBeVisible({ timeout: 15_000 })
    await expectNoCriticalAxe(page)
  })

  test("quotes list has no critical axe violations", async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto("/quotes")
    await expect(page.locator("h1").filter({ hasText: /quote/i })).toBeVisible({ timeout: 15_000 })
    await expectNoCriticalAxe(page)
  })

  test("calendar has no critical axe violations", async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto("/calendar")
    await expect(page.locator("h1").filter({ hasText: /calendar/i })).toBeVisible({ timeout: 15_000 })
    await expectNoCriticalAxe(page)
  })

  test("billing has no critical axe violations", async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto("/billing")
    await expect(page.locator("h1").filter({ hasText: /invoicing|billing/i })).toBeVisible({ timeout: 15_000 })
    await expectNoCriticalAxe(page)
  })

  test("users has no critical axe violations", async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto("/users")
    await expect(page.locator("h1").filter({ hasText: /^users$/i })).toBeVisible({ timeout: 15_000 })
    await expectNoCriticalAxe(page)
  })
})
