import { test, expect, loginAsAdmin } from "./helpers"

test.describe("Jobs API smoke", () => {
  test("admin can create, read, and soft-delete a job", async ({ page }) => {
    await loginAsAdmin(page)

    const stamp = Date.now()
    const createRes = await page.request.post("/api/jobs", {
      data: {
        clientCompany: `E2E Jobs Client ${stamp}`,
        requestedBy: "E2E Tester",
        siteName: "Temple Quay",
        siteAddress: "Bristol, BS1 6DG",
        typeOfWorks: "Access Scaffold",
        designer: "Admin",
      },
    })
    expect(createRes.status(), await createRes.text()).toBe(201)
    const job = await createRes.json() as {
      id: string
      drawingNumber: string
      status: string
      clientCompany: string
    }
    expect(job.id).toBeTruthy()
    expect(job.drawingNumber).toMatch(/ORYX|SV-|SRV-|INS-/)
    expect(job.status).toBe("NEW_REQUEST")

    const getRes = await page.request.get(`/api/jobs/${job.id}`)
    expect(getRes.ok(), await getRes.text()).toBeTruthy()
    const loaded = await getRes.json() as { id: string; drawingNumber: string }
    expect(loaded.id).toBe(job.id)
    expect(loaded.drawingNumber).toBe(job.drawingNumber)

    const deleteRes = await page.request.delete(`/api/jobs/${job.id}`, {
      data: { reason: "E2E smoke cancel" },
    })
    expect(deleteRes.ok(), await deleteRes.text()).toBeTruthy()

    const archivedRes = await page.request.get(`/api/jobs/${job.id}`)
    expect(archivedRes.ok(), await archivedRes.text()).toBeTruthy()
    const archived = await archivedRes.json() as { archivedAt?: string | null }
    expect(archived.archivedAt).toBeTruthy()
  })

  test("rejects job create without required fields", async ({ page }) => {
    await loginAsAdmin(page)

    const res = await page.request.post("/api/jobs", {
      data: { clientCompany: "Incomplete Co" },
    })
    expect(res.status()).toBe(422)
    const body = await res.json() as { error?: string }
    expect(body.error).toBeTruthy()
  })
})
