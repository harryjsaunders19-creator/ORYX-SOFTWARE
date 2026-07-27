import { test, expect, loginAsAdmin } from "./helpers"

test.describe("Billing + backups smoke", () => {
  test("admin can complete a job, export the handoff, and list backups", async ({ page }) => {
    await loginAsAdmin(page)

    const stamp = Date.now()
    const createRes = await page.request.post("/api/jobs", {
      data: {
        clientCompany: `E2E Billing ${stamp}`,
        requestedBy: "E2E Tester",
        siteName: "Temple Quay",
        siteAddress: "Bristol, BS1 6DG",
        typeOfWorks: "Access Scaffold",
        designer: "Admin",
        quoteValue: 950,
      },
    })
    expect(createRes.status(), await createRes.text()).toBe(201)
    const job = await createRes.json() as { id: string }

    const patchRes = await page.request.patch(`/api/jobs/${job.id}`, {
      data: { status: "ISSUED", dateCompleted: new Date().toISOString().slice(0, 10) },
    })
    expect(patchRes.ok(), await patchRes.text()).toBeTruthy()

    const handoffRes = await page.request.get(`/api/billing-handoffs?sourceJobId=${job.id}`)
    expect(handoffRes.status(), await handoffRes.text()).toBe(200)
    const handoffBody = await handoffRes.json() as { handoff?: { id: string } | null }
    expect(handoffBody.handoff?.id).toBeTruthy()

    const exportRes = await page.request.post("/api/billing-handoffs/export", {
      data: { handoffIds: [handoffBody.handoff!.id], notes: "e2e smoke" },
    })
    expect(exportRes.status(), await exportRes.text()).toBe(200)
    expect(exportRes.headers()["content-type"]).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    expect(exportRes.headers()["x-batch-number"]).toBeTruthy()

    const backupsRes = await page.request.get("/api/backups")
    expect(backupsRes.status(), await backupsRes.text()).toBe(200)
    const backupsBody = await backupsRes.json() as {
      backups?: unknown[]
      localBackupSupported?: boolean
      localBackupDurable?: boolean
    }
    expect(Array.isArray(backupsBody.backups)).toBeTruthy()
    expect(typeof backupsBody.localBackupSupported).toBe("boolean")

    await page.request.delete(`/api/jobs/${job.id}`, {
      data: { reason: "E2E billing smoke cleanup" },
    })
  })

  test("malformed jobs page param does not 500", async ({ page }) => {
    await loginAsAdmin(page)
    const res = await page.request.get("/api/jobs?page=abc&limit=nope")
    expect(res.status(), await res.text()).toBe(200)
    const body = await res.json() as { page?: number; limit?: number; jobs?: unknown[] }
    expect(body.page).toBe(1)
    expect(body.limit).toBe(25)
    expect(Array.isArray(body.jobs)).toBeTruthy()
  })
})
