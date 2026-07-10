import { test, expect, loginAsEngineer, loginApi } from "./helpers"

test.describe("Role-based access", () => {
  test("engineer cannot call admin reset-data API", async ({ request }) => {
    await loginApi(request, "engineer@test.com", "engineer123")

    const res = await request.post("/api/admin/reset-data", {
      data: { confirm: "RESET" },
    })

    expect(res.status()).toBe(403)
  })

  test("engineer can open site visit calculator", async ({ page }) => {
    await loginAsEngineer(page)
    await page.goto("/site-visit-calculator")
    await expect(page.getByRole("heading", { name: "Site Visit Calculator" })).toBeVisible()
  })
})
