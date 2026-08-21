import { test, expect, loginAsAdmin } from "./helpers"

test.describe("Jobs panel request budget", () => {
  test("opening one job uses inspector bootstrap (one primary request)", async ({ page }) => {
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
      inspector: 0,
      jobDetail: 0,
      revisions: 0,
      documents: 0,
      quotes: 0,
    }

    page.on("request", req => {
      const url = req.url()
      if (url.includes(`/api/jobs/${job.id}/inspector`)) counts.inspector += 1
      else if (url.includes(`/api/jobs/${job.id}/revisions`)) counts.revisions += 1
      else if (url.includes(`/api/jobs/${job.id}/documents`)) counts.documents += 1
      else if (url.includes(`/api/jobs/${job.id}?`) || url.endsWith(`/api/jobs/${job.id}`)) {
        counts.jobDetail += 1
      } else if (url.includes("/api/quotes?")) counts.quotes += 1
    })

    await page.getByText(job.drawingNumber, { exact: true }).first().click()
    await expect(page.getByLabel(`Inspector for ${job.drawingNumber}`)).toBeVisible({
      timeout: 15_000,
    })
    // Allow SWR / paint to settle.
    await page.waitForTimeout(1500)

    console.log("jobs-panel-open-request-counts", counts)

    // Classic inspector: one bootstrap request (SWR may revalidate once; allow ≤2).
    expect(counts.inspector).toBeGreaterThanOrEqual(1)
    expect(counts.inspector).toBeLessThanOrEqual(2)
    // Legacy fan-out endpoints must not fire on open.
    expect(counts.jobDetail).toBe(0)
    expect(counts.revisions).toBe(0)
    expect(counts.documents).toBe(0)
    expect(counts.quotes).toBe(0)

    // Desktop inspector remains in the split layout (not a mobile full-screen drawer).
    await expect(page.locator(".mobile-job-detail")).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Collapse job details" })).toBeVisible()

    await page.request.delete(`/api/jobs/${job.id}`, {
      data: { reason: "E2E perf cleanup" },
    })
  })

  test("rapid Job A → Job B never shows A under B", async ({ page }) => {
    await loginAsAdmin(page)
    const stamp = Date.now()

    async function createJob(label: string) {
      const res = await page.request.post("/api/jobs", {
        data: {
          clientCompany: `Switch ${label} ${stamp}`,
          requestedBy: "E2E Tester",
          siteName: `Site ${label}`,
          siteAddress: "Bristol",
          typeOfWorks: "Access Scaffold",
          designer: "Admin",
        },
      })
      expect(res.status(), await res.text()).toBe(201)
      return await res.json() as { id: string; drawingNumber: string }
    }

    const jobA = await createJob("A")
    const jobB = await createJob("B")

    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto("/jobs")
    await expect(page.getByRole("heading", { name: "Job List" })).toBeVisible({ timeout: 30_000 })

    await page.getByText(jobA.drawingNumber, { exact: true }).first().click()
    await expect(page.getByLabel(`Inspector for ${jobA.drawingNumber}`)).toBeVisible({
      timeout: 15_000,
    })

    await page.getByText(jobB.drawingNumber, { exact: true }).first().click()
    await expect(page.getByLabel(`Inspector for ${jobB.drawingNumber}`)).toBeVisible({
      timeout: 15_000,
    })
    // After switching, the inspector label must be B — not a stale A flash that sticks.
    await expect(page.getByLabel(`Inspector for ${jobA.drawingNumber}`)).toHaveCount(0)
    await expect(page.getByText(jobB.drawingNumber).first()).toBeVisible()

    await page.request.delete(`/api/jobs/${jobA.id}`, { data: { reason: "E2E cleanup A" } })
    await page.request.delete(`/api/jobs/${jobB.id}`, { data: { reason: "E2E cleanup B" } })
  })
})
