import { test, expect, loginAsAdmin } from "./helpers"

test.describe("Quotes API smoke", () => {
  test("admin can create and update a quote", async ({ page }) => {
    await loginAsAdmin(page)

    const today = new Date().toISOString().slice(0, 10)
    const createRes = await page.request.post("/api/quotes", {
      data: {
        clientCompany: `E2E Quotes Client ${Date.now()}`,
        address: "10 Queens Square, Bristol",
        typeOfWorks: "Access Scaffold",
        quoteValue: "1250",
        quoteDate: today,
      },
    })
    expect(createRes.status(), await createRes.text()).toBe(201)
    const quote = await createRes.json() as {
      id: string
      quoteNumber: string
      status: string
    }
    expect(quote.id).toBeTruthy()
    expect(quote.quoteNumber).toBeTruthy()
    expect(quote.status).toBe("DRAFT")

    const patchRes = await page.request.patch(`/api/quotes/${quote.id}`, {
      data: { status: "SENT" },
    })
    expect(patchRes.ok(), await patchRes.text()).toBeTruthy()
    const updated = await patchRes.json() as { status: string }
    expect(updated.status).toBe("SENT")

    const getRes = await page.request.get(`/api/quotes/${quote.id}`)
    expect(getRes.ok(), await getRes.text()).toBeTruthy()
  })
})
