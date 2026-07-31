import { test, expect, loginAsAdmin } from "./helpers"

test.describe("Jobs mobile detail panel", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("opens full-screen detail and scrolls to the bottom", async ({ page }) => {
    await loginAsAdmin(page)

    const stamp = Date.now()
    const createRes = await page.request.post("/api/jobs", {
      data: {
        clientCompany: `Mobile Scroll Client ${stamp}`,
        requestedBy: "E2E Tester",
        siteName: "Long Site Name For Layout",
        siteAddress:
          "Unit 12, Temple Quay House, 2 The Square, Temple Quay, Bristol, BS1 6DG, United Kingdom",
        typeOfWorks: "Access Scaffold",
        designer: "Admin",
        notes:
          "Long description of works to ensure the mobile detail panel has enough content to scroll. ".repeat(8),
      },
    })
    expect(createRes.status(), await createRes.text()).toBe(201)
    const job = await createRes.json() as { id: string; drawingNumber: string }

    await page.goto("/jobs")
    await expect(page.getByRole("heading", { name: "Jobs" })).toBeVisible({ timeout: 30_000 })

    const firstCard = page.getByRole("button", { name: `Open ${job.drawingNumber}` })
    await expect(firstCard).toBeVisible({ timeout: 30_000 })

    const list = page.locator("div.md\\:hidden").locator(".overflow-y-auto").first()
    await list.evaluate(el => {
      el.scrollTop = 80
    })
    const listScrollBefore = await list.evaluate(el => el.scrollTop)

    // Click the drawing number — status/designer controls stopPropagation.
    await firstCard.getByRole("heading", { name: job.drawingNumber }).click()

    const drawer = page.locator(".mobile-job-detail")
    await expect(drawer).toBeVisible()
    await expect(drawer.getByLabel(`Inspector for ${job.drawingNumber}`)).toBeVisible()

    const content = drawer.locator(".mobile-job-detail__content")
    await expect(content).toBeVisible()

    // Primary sections must render immediately from list data (no full-panel spinner).
    await expect(content.locator("section, [class*='space-y']").first()).toBeVisible({
      timeout: 5_000,
    })

    // Force tall content so scroll reachability is measurable even on short fixtures.
    await content.evaluate(el => {
      const pad = document.createElement("div")
      pad.style.height = "1200px"
      pad.setAttribute("data-testid", "scroll-pad")
      el.appendChild(pad)
    })

    const scrollMetrics = await content.evaluate(el => {
      el.scrollTop = el.scrollHeight
      return {
        scrollTop: el.scrollTop,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        reachedBottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 4,
        overflowY: getComputedStyle(el).overflowY,
      }
    })

    expect(scrollMetrics.overflowY).toMatch(/auto|scroll/)
    expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight)
    expect(scrollMetrics.reachedBottom).toBeTruthy()

    await drawer.getByRole("button", { name: "Back to Jobs" }).click()
    await expect(drawer).toHaveCount(0)

    const listScrollAfter = await list.evaluate(el => el.scrollTop)
    expect(listScrollAfter).toBe(listScrollBefore)

    await page.request.delete(`/api/jobs/${job.id}`, {
      data: { reason: "E2E mobile scroll cleanup" },
    })
  })
})
