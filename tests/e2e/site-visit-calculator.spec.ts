import { test, expect, loginAsAdmin, loginApi } from "./helpers"

test.describe("Site visit calculator", () => {
  test("admin can calculate a site visit cost", async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto("/site-visit-calculator")

    await expect(page.getByRole("heading", { name: "Site Visit Calculator" })).toBeVisible()

    const siteInput = page.getByLabel(/site address/i)
    await siteInput.fill("Bristol Temple Meads, Bristol")

    const listbox = page.getByRole("listbox", { name: "Address suggestions" })
    await expect(listbox).toBeVisible({ timeout: 15_000 })
    await listbox.getByRole("option").first().click()

    const summary = page.locator("#site-visit-summary")
    await expect(summary.getByText("Total (inc VAT)")).toBeVisible({ timeout: 45_000 })
    await expect(summary.locator(".text-lg").filter({ hasText: /£/ })).toBeVisible()
  })

  test("calculate API returns a priced result", async ({ request }) => {
    await loginApi(request, "admin@test.com", "admin123")

    const res = await request.post("/api/site-visit-calculator/calculate", {
      data: {
        siteAddress: "Bristol Temple Meads, Bristol",
        siteHours: 1,
      },
    })

    expect(res.ok()).toBeTruthy()
    const data = await res.json() as { result?: { grandTotal: number; subtotal: number } }
    expect(data.result?.subtotal).toBeGreaterThan(0)
    expect(data.result?.grandTotal).toBeGreaterThan(data.result?.subtotal ?? 0)
  })
})
