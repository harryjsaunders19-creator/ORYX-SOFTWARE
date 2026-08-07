import { test, expect, loginAsAdmin } from "./helpers"

test.describe("Jobs panel request budget", () => {
  test("opening one job does not duplicate inspector fetches", async ({ page }) => {
    await loginAsAdmin(page)

    const stamp = Date.now()
    const createRes = await page.request.post("/api/jobs", {
      data: {
        clientCompany: `Perf Client ${stamp}`,
        requestedBy: "E2E Tester",
        siteName: "Perf Site",
        siteAddress: "Bristol",
        typeOfWorks: "Access Scaffold",
        designer: "Admin",
      },
    })
    expect(createRes.status(), await createRes.text()).toBe(201)
    const job = await createRes.json() as { id: string; drawingNumber: string }

    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto("/jobs")
    await expect(page.getByRole("heading", { name: "Job List" })).toBeVisible({ timeout: 30_000 })

    const counts = {
      jobDetail: 0,
      revisions: 0,
      documents: 0,
      quotes: 0,
    }

    page.on("request", req => {
      const url = req.url()
      if (url.includes(`/api/jobs/${job.id}/revisions`)) counts.revisions += 1
      else if (url.includes(`/api/jobs/${job.id}/documents`)) counts.documents += 1
      else if (url.includes(`/api/jobs/${job.id}?`) || url.endsWith(`/api/jobs/${job.id}`)) {
        counts.jobDetail += 1
      } else if (url.includes("/api/quotes?")) counts.quotes += 1
    })

    await page.getByText(job.drawingNumber, { exact: true }).first().click()
    await expect(page.getByLabel(`Inspector for ${job.drawingNumber}`)).toBeVisible({
      timeout: 15_000,
    })
    // Allow secondary fetches to settle.
    await page.waitForTimeout(1500)

    console.log("jobs-panel-open-request-counts", counts)

    // Single inspector mount → one request each (SWR may revalidate once; allow ≤2).
    expect(counts.jobDetail).toBeGreaterThanOrEqual(1)
    expect(counts.jobDetail).toBeLessThanOrEqual(2)
    expect(counts.revisions).toBeGreaterThanOrEqual(1)
    expect(counts.revisions).toBeLessThanOrEqual(2)
    expect(counts.documents).toBeGreaterThanOrEqual(1)
    expect(counts.documents).toBeLessThanOrEqual(2)
    expect(counts.quotes).toBeGreaterThanOrEqual(1)
    expect(counts.quotes).toBeLessThanOrEqual(2)

    // Desktop inspector remains in the split layout (not a mobile full-screen drawer).
    await expect(page.locator(".mobile-job-detail")).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Collapse job details" })).toBeVisible()

    await page.request.delete(`/api/jobs/${job.id}`, {
      data: { reason: "E2E perf cleanup" },
    })
  })
})
