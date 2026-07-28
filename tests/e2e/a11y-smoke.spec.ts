import AxeBuilder from "@axe-core/playwright"
import { test, expect, loginAsAdmin } from "./helpers"

/**
 * Lightweight axe smoke — catches critical a11y regressions on key
 * authenticated surfaces. Expand route coverage / raise severity as
 * modules get a11y polish.
 */
test.describe("Accessibility smoke", () => {
  test("login page has no critical axe violations", async ({ page }) => {
    await page.goto("/login")
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze()
    const serious = results.violations.filter(v => v.impact === "critical")
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([])
  })

  test("dashboard has no critical axe violations", async ({ page }) => {
    await loginAsAdmin(page)
    await expect(page).toHaveURL("/")
    await expect(page.locator("h1").filter({ hasText: /Good (morning|afternoon|evening)/i })).toBeVisible()

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze()
    const serious = results.violations.filter(v => v.impact === "critical")
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([])
  })

  test("jobs list has no critical axe violations", async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto("/jobs")
    await expect(page.locator("#jobs-search")).toBeVisible({ timeout: 15_000 })

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze()
    const serious = results.violations.filter(v => v.impact === "critical")
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([])
  })
})
