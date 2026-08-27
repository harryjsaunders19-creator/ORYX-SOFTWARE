import { test, expect, loginAsAdmin, loginAsEngineer } from "./helpers"

/**
 * Two-user Jobs Register live sync.
 * Creates/archives isolated E2E jobs only (never production data).
 * Relies on Broadcast when available, else visibility soft-poll (≤8s).
 */
const LIVE_WAIT_MS = 20_000

async function createE2EJob(
  request: import("@playwright/test").APIRequestContext,
  stamp: number,
  label: string,
) {
  const res = await request.post("/api/jobs", {
    data: {
      clientCompany: `Live Sync ${label} ${stamp}`,
      requestedBy: "E2E Live",
      siteName: `LiveSite${label}${stamp}`,
      siteAddress: "Bristol",
      typeOfWorks: "Access Scaffold",
      designer: "Admin",
    },
  })
  expect(res.status(), await res.text()).toBe(201)
  return res.json() as Promise<{ id: string; drawingNumber: string; status: string; designer: string }>
}

async function openJobsAll(page: import("@playwright/test").Page) {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/jobs")
  await expect(page.getByRole("heading", { name: "Job List" })).toBeVisible({ timeout: 30_000 })
  await page.getByRole("tab", { name: /^All/ }).click()
}

test.describe("Jobs multi-user live sync", () => {
  test("Test A — concurrent status update appears for User B", async ({ browser }) => {
    const stamp = Date.now()
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    const pageA = await ctxA.newPage()
    const pageB = await ctxB.newPage()

    await loginAsAdmin(pageA)
    await loginAsEngineer(pageB)

    const job = await createE2EJob(pageA.request, stamp, "status")
    try {
      await openJobsAll(pageA)
      await openJobsAll(pageB)

      await expect(pageB.getByText(job.drawingNumber, { exact: true }).first()).toBeVisible()

      const patch = await pageA.request.patch(`/api/jobs/${job.id}`, {
        data: { status: "IN_DESIGN" },
      })
      expect(patch.ok(), await patch.text()).toBeTruthy()

      const rowB = pageB.getByRole("row").filter({ hasText: job.drawingNumber })
      await expect(rowB.getByRole("combobox", { name: /status/i })).toContainText(
        /Progress|In Progress/i,
        { timeout: LIVE_WAIT_MS },
      )
    } finally {
      await pageA.request.delete(`/api/jobs/${job.id}`, { data: { reason: "E2E live status cleanup" } })
      await ctxA.close()
      await ctxB.close()
    }
  })

  test("Test B — concurrent designer update appears for User B", async ({ browser }) => {
    const stamp = Date.now()
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    const pageA = await ctxA.newPage()
    const pageB = await ctxB.newPage()

    await loginAsAdmin(pageA)
    await loginAsEngineer(pageB)

    const job = await createE2EJob(pageA.request, stamp, "designer")
    try {
      await openJobsAll(pageA)
      await openJobsAll(pageB)
      await expect(pageB.getByText(job.drawingNumber, { exact: true }).first()).toBeVisible()

      const designersRes = await pageA.request.get("/api/jobs/designers")
      expect(designersRes.ok()).toBeTruthy()
      const { designers } = await designersRes.json() as { designers: string[] }
      const next = designers.find(d => d && d !== "Admin") ?? designers[0] ?? "Engineer"
      // Prefer a name different from current when possible.
      const target = designers.find(d => d !== (job.designer || "Admin")) ?? next

      const patch = await pageA.request.patch(`/api/jobs/${job.id}`, {
        data: { designer: target },
      })
      expect(patch.ok(), await patch.text()).toBeTruthy()

      const rowB = pageB.getByRole("row").filter({ hasText: job.drawingNumber })
      await expect(rowB).toContainText(target, { timeout: LIVE_WAIT_MS })
    } finally {
      await pageA.request.delete(`/api/jobs/${job.id}`, { data: { reason: "E2E live designer cleanup" } })
      await ctxA.close()
      await ctxB.close()
    }
  })

  test("Test C — Active → Completed removes row from Active for User B", async ({ browser }) => {
    const stamp = Date.now()
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    const pageA = await ctxA.newPage()
    const pageB = await ctxB.newPage()

    await loginAsAdmin(pageA)
    await loginAsEngineer(pageB)

    const job = await createE2EJob(pageA.request, stamp, "scope")
    try {
      await openJobsAll(pageB)
      await pageB.getByRole("tab", { name: /^Active/ }).click()
      await expect(pageB.getByText(job.drawingNumber, { exact: true }).first()).toBeVisible()

      const patch = await pageA.request.patch(`/api/jobs/${job.id}`, {
        data: { status: "ISSUED" },
      })
      expect(patch.ok(), await patch.text()).toBeTruthy()

      await expect(pageB.getByText(job.drawingNumber, { exact: true })).toHaveCount(0, {
        timeout: LIVE_WAIT_MS,
      })
    } finally {
      await pageA.request.delete(`/api/jobs/${job.id}`, { data: { reason: "E2E live scope cleanup" } })
      await ctxA.close()
      await ctxB.close()
    }
  })

  test("Test D — search reconciliation when job no longer matches", async ({ browser }) => {
    const stamp = Date.now()
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    const pageA = await ctxA.newPage()
    const pageB = await ctxB.newPage()

    await loginAsAdmin(pageA)
    await loginAsEngineer(pageB)

    const uniqueSite = `LiveSearchNeedle${stamp}`
    const createRes = await pageA.request.post("/api/jobs", {
      data: {
        clientCompany: `Live Search Co ${stamp}`,
        requestedBy: "E2E Live",
        siteName: uniqueSite,
        siteAddress: "Bristol",
        typeOfWorks: "Access Scaffold",
        designer: "Admin",
      },
    })
    expect(createRes.status(), await createRes.text()).toBe(201)
    const job = await createRes.json() as { id: string; drawingNumber: string }

    try {
      await openJobsAll(pageB)
      await pageB.getByLabel("Search projects").fill(uniqueSite)
      await expect(pageB.getByText(job.drawingNumber, { exact: true }).first()).toBeVisible({
        timeout: 15_000,
      })

      const patch = await pageA.request.patch(`/api/jobs/${job.id}`, {
        data: { siteName: `RenamedAway${stamp}`, siteAddress: "Bath" },
      })
      expect(patch.ok(), await patch.text()).toBeTruthy()

      await expect(pageB.getByText(job.drawingNumber, { exact: true })).toHaveCount(0, {
        timeout: LIVE_WAIT_MS,
      })
    } finally {
      await pageA.request.delete(`/api/jobs/${job.id}`, { data: { reason: "E2E live search cleanup" } })
      await ctxA.close()
      await ctxB.close()
    }
  })

  test("Test E — deletion removes row and keeps counts sensible", async ({ browser }) => {
    const stamp = Date.now()
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    const pageA = await ctxA.newPage()
    const pageB = await ctxB.newPage()

    await loginAsAdmin(pageA)
    await loginAsEngineer(pageB)

    const job = await createE2EJob(pageA.request, stamp, "delete")
    try {
      await openJobsAll(pageB)
      await expect(pageB.getByText(job.drawingNumber, { exact: true }).first()).toBeVisible()
      const footerBefore = await pageB.getByText(/Showing\s+\d+\s+of\s+\d+/i).first().textContent()

      const del = await pageA.request.delete(`/api/jobs/${job.id}`, {
        data: { reason: "E2E live delete" },
      })
      expect(del.ok(), await del.text()).toBeTruthy()

      await expect(pageB.getByText(job.drawingNumber, { exact: true })).toHaveCount(0, {
        timeout: LIVE_WAIT_MS,
      })
      await expect(pageB.getByText(/Showing\s+\d+\s+of\s+\d+/i).first()).toBeVisible()
      const footerAfter = await pageB.getByText(/Showing\s+\d+\s+of\s+\d+/i).first().textContent()
      expect(footerAfter).toBeTruthy()
      expect(footerAfter).not.toEqual(footerBefore)
    } finally {
      await ctxA.close()
      await ctxB.close()
    }
  })

  test("Test F — remount keeps a single live channel", async ({ page }) => {
    await loginAsAdmin(page)
    await openJobsAll(page)

    // Channel counter is 0 when Supabase anon is not configured (SQLite local).
    const first = await page.evaluate(() =>
      (window as unknown as { __oryxJobsLiveChannels?: number }).__oryxJobsLiveChannels ?? null,
    )

    await page.goto("/")
    await expect(page.getByRole("heading", { name: /Dashboard|ORYX|Home/i }).first()).toBeVisible({
      timeout: 20_000,
    }).catch(() => undefined)

    await page.goto("/jobs")
    await expect(page.getByRole("heading", { name: "Job List" })).toBeVisible({ timeout: 30_000 })
    await page.getByRole("tab", { name: /^All/ }).click()

    await page.goto("/clients").catch(() => undefined)
    await page.goto("/jobs")
    await expect(page.getByRole("heading", { name: "Job List" })).toBeVisible({ timeout: 30_000 })

    const after = await page.evaluate(() =>
      (window as unknown as { __oryxJobsLiveChannels?: number }).__oryxJobsLiveChannels ?? null,
    )

    if (first != null && after != null) {
      expect(after).toBe(1)
      expect(after).toBe(first)
    } else {
      // Soft poll path without Realtime — remounts must still render one table.
      await expect(page.getByRole("table", { name: "Job list" })).toBeVisible()
    }
  })
})

test.describe("Jobs list inspector request budget", () => {
  test("loading /jobs does not fetch inspector once per row", async ({ page }) => {
    await loginAsAdmin(page)
    const stamp = Date.now()
    const job = await createE2EJob(page.request, stamp, "n1")

    let inspectorGets = 0
    page.on("request", req => {
      if (req.method() === "GET" && /\/api\/jobs\/[^/]+\/inspector/.test(req.url())) {
        inspectorGets += 1
      }
    })

    try {
      await openJobsAll(page)
      await expect(page.getByText(job.drawingNumber, { exact: true }).first()).toBeVisible()
      await page.waitForTimeout(2_000)
      expect(inspectorGets).toBe(0)
    } finally {
      await page.request.delete(`/api/jobs/${job.id}`, { data: { reason: "E2E n1 cleanup" } })
    }
  })
})
