import { test, expect, loginAsAdmin } from "./helpers"

test.describe("Jobs mobile detail panel", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("opens full-screen detail and scrolls to the bottom", async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto("/jobs")
    await expect(page.getByRole("heading", { name: "Jobs" })).toBeVisible({ timeout: 30_000 })

    const firstCard = page.locator("article[aria-label^='Open ']").first()
    await expect(firstCard).toBeVisible({ timeout: 30_000 })

    const list = page.locator(".md\\:hidden .overflow-y-auto").first()
    await list.evaluate(el => {
      el.scrollTop = 120
    })
    const listScrollBefore = await list.evaluate(el => el.scrollTop)

    await firstCard.click()

    const drawer = page.locator(".mobile-job-detail")
    await expect(drawer).toBeVisible()
    await expect(drawer.getByLabel(/Inspector for/)).toBeVisible()

    const content = drawer.locator(".mobile-job-detail__content")
    await expect(content).toBeVisible()

    // Primary sections must render immediately from list data (no full-panel spinner).
    await expect(content.getByText(/Current|Revision|Project|Status/i).first()).toBeVisible({
      timeout: 5_000,
    })

    const scrollMetrics = await content.evaluate(el => {
      el.scrollTop = el.scrollHeight
      return {
        scrollTop: el.scrollTop,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        canScroll: el.scrollHeight > el.clientHeight + 8,
        reachedBottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 4,
      }
    })

    expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight)
    expect(scrollMetrics.reachedBottom).toBeTruthy()

    await drawer.getByRole("button", { name: "Back to Jobs" }).click()
    await expect(drawer).toHaveCount(0)

    const listScrollAfter = await list.evaluate(el => el.scrollTop)
    expect(listScrollAfter).toBe(listScrollBefore)
  })
})
