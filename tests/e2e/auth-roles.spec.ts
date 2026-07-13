import { test, expect, loginAsEngineer, loginAsAdmin, loginApi } from "./helpers"

test.describe("Role-based access", () => {
  test("engineer cannot call admin reset-data API", async ({ request }) => {
    await loginApi(request, "engineer@test.com", "engineer123")

    const res = await request.post("/api/admin/reset-data", {
      data: { confirm: "RESET" },
    })

    expect(res.status()).toBe(403)
  })

  test("engineer cannot export jobs list", async ({ request }) => {
    await loginApi(request, "engineer@test.com", "engineer123")
    const res = await request.get("/api/jobs?export=true")
    expect(res.status()).toBe(403)
  })

  test("admin can export jobs list", async ({ page }) => {
    await loginAsAdmin(page)
    const res = await page.request.get("/api/jobs?export=true")
    expect(res.status(), await res.text()).toBe(200)
    const body = await res.json() as { jobs?: unknown[] }
    expect(Array.isArray(body.jobs)).toBeTruthy()
  })

  test("admin billing queue returns pagination metadata", async ({ page }) => {
    await loginAsAdmin(page)
    const res = await page.request.get("/api/billing-handoffs?view=awaiting&limit=200&page=1")
    expect(res.status(), await res.text()).toBe(200)
    const body = await res.json() as {
      handoffs?: unknown[]
      total?: number
      truncated?: boolean
      page?: number
    }
    expect(Array.isArray(body.handoffs)).toBeTruthy()
    expect(typeof body.total).toBe("number")
    expect(body.page).toBe(1)
  })

  test("engineer can open site visit calculator", async ({ page }) => {
    await loginAsEngineer(page)
    await page.goto("/site-visit-calculator")
    await expect(page.getByRole("heading", { name: "Site Visit Calculator" })).toBeVisible()
  })
})
