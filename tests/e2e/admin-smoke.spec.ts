import { test, expect, loginAsAdmin } from "./helpers"

test.describe("Admin API smoke", () => {
  test("admin can reach billing, vault, users, and patch a drawing number", async ({ page }) => {
    await loginAsAdmin(page)

    const billingRes = await page.request.get("/api/billing-handoffs")
    expect(billingRes.status(), await billingRes.text()).toBe(200)

    const vaultRes = await page.request.get("/api/password-vault")
    expect(vaultRes.status(), await vaultRes.text()).toBe(200)

    const usersRes = await page.request.get("/api/users")
    expect(usersRes.status(), await usersRes.text()).toBe(200)

    const stamp = Date.now()
    const createRes = await page.request.post("/api/jobs", {
      data: {
        clientCompany: `E2E Admin Smoke ${stamp}`,
        requestedBy: "E2E Tester",
        siteName: "Temple Quay",
        siteAddress: "Bristol, BS1 6DG",
        typeOfWorks: "Access Scaffold",
        designer: "Admin",
      },
    })
    expect(createRes.status(), await createRes.text()).toBe(201)
    const job = await createRes.json() as { id: string; drawingNumber: string }
    expect(job.id).toBeTruthy()

    const patchedNumber = `ORYX-E2E-${stamp}`
    const patchRes = await page.request.patch(`/api/jobs/${job.id}/drawing-number`, {
      data: { drawingNumber: patchedNumber },
    })
    expect(patchRes.ok(), await patchRes.text()).toBeTruthy()

    const getRes = await page.request.get(`/api/jobs/${job.id}`)
    expect(getRes.ok(), await getRes.text()).toBeTruthy()
    const loaded = await getRes.json() as { drawingNumber: string }
    expect(loaded.drawingNumber).toBe(patchedNumber)

    await page.request.delete(`/api/jobs/${job.id}`, {
      data: { reason: "E2E admin smoke cleanup" },
    })
  })
})
