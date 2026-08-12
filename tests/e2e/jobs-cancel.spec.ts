import { test, expect, loginAsAdmin, loginAsAccounts, loginApi, assertTestAuthReady } from "./helpers"

test.describe("Job cancellation", () => {
  test.beforeAll(async ({ request }) => {
    await assertTestAuthReady(request)
  })

  test("admin can cancel a job with a required reason", async ({ page }) => {
    await loginAsAdmin(page)
    const stamp = Date.now()
    const createRes = await page.request.post("/api/jobs", {
      data: {
        clientCompany: `Cancel Admin Client ${stamp}`,
        requestedBy: "E2E",
        siteName: "Cancel Site",
        siteAddress: "Bristol",
        typeOfWorks: "Access Scaffold",
        designer: "Admin",
      },
    })
    expect(createRes.status()).toBe(201)
    const job = await createRes.json() as { id: string; drawingNumber: string }

    const noReason = await page.request.delete(`/api/jobs/${job.id}`, { data: {} })
    expect(noReason.status()).toBe(422)

    const cancelRes = await page.request.delete(`/api/jobs/${job.id}`, {
      data: { reason: "Client withdrew", notes: "E2E cancel notes" },
    })
    expect(cancelRes.ok()).toBeTruthy()

    const archived = await page.request.get(`/api/jobs/${job.id}`)
    const body = await archived.json() as { archivedAt?: string | null; cancelRecord?: { reason?: string } }
    expect(body.archivedAt).toBeTruthy()
    expect(body.cancelRecord?.reason).toMatch(/Client withdrew/)
  })

  test("accounts can cancel where intended", async ({ page }) => {
    await loginApi(page.request, "accounts@test.com")
    const stamp = Date.now()
    const createRes = await page.request.post("/api/jobs", {
      data: {
        clientCompany: `Cancel Accounts Client ${stamp}`,
        requestedBy: "E2E",
        siteName: "Accounts Site",
        siteAddress: "Bristol",
        typeOfWorks: "Access Scaffold",
        designer: "Admin",
      },
    })
    expect(createRes.status()).toBe(201)
    const job = await createRes.json() as { id: string }
    const cancelRes = await page.request.delete(`/api/jobs/${job.id}`, {
      data: { reason: "Accounts cancellation" },
    })
    expect(cancelRes.ok()).toBeTruthy()
  })

  test("engineer receives 403 when calling cancel endpoint", async ({ request }) => {
    await loginApi(request, "admin@test.com")
    const createRes = await request.post("/api/jobs", {
      data: {
        clientCompany: `Engineer Block ${Date.now()}`,
        requestedBy: "E2E",
        siteName: "Block Site",
        siteAddress: "Bristol",
        typeOfWorks: "Access Scaffold",
        designer: "Admin",
      },
    })
    expect(createRes.status()).toBe(201)
    const job = await createRes.json() as { id: string }

    await loginApi(request, "engineer@test.com")
    const cancelRes = await request.delete(`/api/jobs/${job.id}`, {
      data: { reason: "Should be blocked" },
    })
    expect(cancelRes.status()).toBe(403)
  })

  test("double submission is prevented after first cancel", async ({ page }) => {
    await loginAsAdmin(page)
    const createRes = await page.request.post("/api/jobs", {
      data: {
        clientCompany: `Double Cancel ${Date.now()}`,
        requestedBy: "E2E",
        siteName: "Dup",
        siteAddress: "Bristol",
        typeOfWorks: "Access Scaffold",
        designer: "Admin",
      },
    })
    const job = await createRes.json() as { id: string }
    const first = await page.request.delete(`/api/jobs/${job.id}`, { data: { reason: "First cancel" } })
    expect(first.ok()).toBeTruthy()
    const second = await page.request.delete(`/api/jobs/${job.id}`, { data: { reason: "Second cancel" } })
    expect(second.status()).toBe(409)
  })

  test("cancel modal is usable and requires a reason in the UI", async ({ page }) => {
    await loginAsAdmin(page)
    const createRes = await page.request.post("/api/jobs", {
      data: {
        clientCompany: `UI Cancel ${Date.now()}`,
        requestedBy: "E2E",
        siteName: "UI Site",
        siteAddress: "Bristol",
        typeOfWorks: "Access Scaffold",
        designer: "Admin",
      },
    })
    const job = await createRes.json() as { id: string; drawingNumber: string }

    await page.goto(`/jobs/${job.id}`)
    const cancelBtn = page.getByRole("button", { name: "Cancel Job" })
    await cancelBtn.waitFor({ state: "visible", timeout: 30_000 })
    await cancelBtn.click()
    await expect(page.getByRole("dialog")).toBeVisible()
    await expect(page.locator("#jobs-cancel-reason")).toBeVisible({ timeout: 15_000 })

    const confirm = page.getByRole("button", { name: "Cancel job" })
    await expect(confirm).toBeDisabled()
    await page.locator("#jobs-cancel-reason").fill("UI cancellation reason")
    await expect(confirm).toBeEnabled()
    await confirm.click()
    await expect(page.getByRole("dialog", { name: "Cancel job" })).toBeHidden({ timeout: 15_000 })

    const archived = await page.request.get(`/api/jobs/${job.id}`)
    const body = await archived.json() as { archivedAt?: string | null }
    expect(body.archivedAt).toBeTruthy()
  })

  test("test-user seed script is unavailable outside approved E2E setup", async () => {
    const { spawnSync } = await import("node:child_process")
    const res = spawnSync("node", ["scripts/e2e-seed-supabase-users.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "development",
        E2E: "",
        ALLOW_BOOTSTRAP_TEST_ACCOUNTS: "",
        NEXT_PUBLIC_SUPABASE_URL: "https://unknown-project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "fake-key",
      },
      encoding: "utf8",
    })
    expect(res.status).not.toBe(0)
    expect(res.stderr + res.stdout).toMatch(/provisioning|forbidden|blocked|E2E|test/i)
  })
})
