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

test.describe("Jobs optimistic mutations", () => {
  test("status change updates UI before list revalidation and rolls back on failure", async ({ page }) => {
    await loginAsAdmin(page)
    const stamp = Date.now()
    const createRes = await page.request.post("/api/jobs", {
      data: {
        clientCompany: `Opt Status ${stamp}`,
        requestedBy: "E2E Tester",
        siteName: "Opt Site",
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
    await page.getByRole("tab", { name: /^All/ }).click()
    await expect(page.getByText(job.drawingNumber, { exact: true }).first()).toBeVisible()

    const jobRow = page.getByRole("row").filter({ hasText: job.drawingNumber })

    let listGetsDuringMutation = 0
    page.on("request", req => {
      const url = req.url()
      if (req.method() === "GET" && url.includes("/api/jobs?") && !url.includes("/api/jobs/designers")) {
        listGetsDuringMutation += 1
      }
    })

    // Slow successful PATCH — UI should update before it resolves.
    let releasePatch: (() => void) | undefined
    const patchGate = new Promise<void>(resolve => { releasePatch = resolve })
    await page.route(`**/api/jobs/${job.id}`, async route => {
      if (route.request().method() !== "PATCH") {
        await route.continue()
        return
      }
      await patchGate
      const res = await route.fetch()
      await route.fulfill({ response: res })
    })

    const beforeListGets = listGetsDuringMutation
    const statusTrigger = jobRow.getByRole("combobox", { name: "Change original design status" })
    await statusTrigger.click()
    await page.getByRole("option", { name: /In Progress/i }).click()

    // Optimistic: badge text updates while PATCH is still gated.
    await expect(statusTrigger).toContainText(/Progress|In Progress/i, { timeout: 3_000 })
    await expect(page.locator(".skeleton").first()).toHaveCount(0)

    releasePatch?.()
    await expect(page.getByText(/Status →/i).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(job.drawingNumber, { exact: true }).first()).toBeVisible()
    expect(listGetsDuringMutation - beforeListGets).toBeLessThanOrEqual(3)

    await page.unroute(`**/api/jobs/${job.id}`)

    // Failure rollback
    await page.route(`**/api/jobs/${job.id}`, async route => {
      if (route.request().method() !== "PATCH") {
        await route.continue()
        return
      }
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Simulated failure" }),
      })
    })

    await statusTrigger.click()
    await page.getByRole("option", { name: /Requires Checking|Checking/i }).click()
    await expect(page.getByText(/Simulated failure|Failed to change status/i).first()).toBeVisible({
      timeout: 5_000,
    })
    await expect(statusTrigger).not.toContainText(/Checking/i, { timeout: 5_000 })

    await page.unroute(`**/api/jobs/${job.id}`)
    await page.request.delete(`/api/jobs/${job.id}`, { data: { reason: "E2E opt status cleanup" } })
  })

  test("designer change is optimistic and rolls back on API failure", async ({ page }) => {
    await loginAsAdmin(page)
    const stamp = Date.now()
    const createRes = await page.request.post("/api/jobs", {
      data: {
        clientCompany: `Opt Des ${stamp}`,
        requestedBy: "E2E Tester",
        siteName: "Opt Des Site",
        siteAddress: "Bristol",
        typeOfWorks: "Access Scaffold",
        designer: "",
      },
    })
    expect(createRes.status(), await createRes.text()).toBe(201)
    const job = await createRes.json() as { id: string; drawingNumber: string }

    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto("/jobs")
    await expect(page.getByRole("heading", { name: "Job List" })).toBeVisible({ timeout: 30_000 })
    await page.getByRole("tab", { name: /^All/ }).click()

    const jobRow = page.getByRole("row").filter({ hasText: job.drawingNumber })

    await page.route(`**/api/jobs/${job.id}`, async route => {
      if (route.request().method() !== "PATCH") {
        await route.continue()
        return
      }
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Designer rejected" }),
      })
    })

    const designerTrigger = jobRow.getByRole("combobox", { name: "Change designer for original drawing" })
    await designerTrigger.click()
    const option = page.getByRole("option").filter({ hasNotText: /^Unassigned$/i }).first()
    await expect(option).toBeVisible()
    await option.click()

    await expect(page.getByText(/Designer rejected|Failed to assign/i).first()).toBeVisible({
      timeout: 5_000,
    })
    await expect(designerTrigger).toBeEnabled({ timeout: 5_000 })

    await page.unroute(`**/api/jobs/${job.id}`)
    await page.request.delete(`/api/jobs/${job.id}`, { data: { reason: "E2E opt designer cleanup" } })
  })

  test("completing a job on Active scope removes the row without list skeleton", async ({ page }) => {
    await loginAsAdmin(page)
    const stamp = Date.now()
    const createRes = await page.request.post("/api/jobs", {
      data: {
        clientCompany: `Opt Scope ${stamp}`,
        requestedBy: "E2E Tester",
        siteName: "Scope Site",
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
    await page.getByRole("tab", { name: /^Active/ }).click()
    const jobRow = page.getByRole("row").filter({ hasText: job.drawingNumber })
    await expect(jobRow).toBeVisible()

    const statusTrigger = jobRow.getByRole("combobox", { name: "Change original design status" })
    await statusTrigger.click()
    await page.getByRole("option", { name: /^Complete$/i }).click()
    await expect(page.getByText(/Status → Complete/i).first()).toBeVisible({ timeout: 10_000 })

    await expect(page.getByRole("row").filter({ hasText: job.drawingNumber })).toHaveCount(0, {
      timeout: 8_000,
    })
    await expect(page.locator(".skeleton")).toHaveCount(0)

    await page.request.delete(`/api/jobs/${job.id}`, { data: { reason: "E2E opt scope cleanup" } })
  })
})
