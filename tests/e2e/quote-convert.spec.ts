import { test, expect, loginAsAdmin } from "./helpers"

test.describe("Quote convert API", () => {
  test("accepted quote converts to a new job", async ({ page }) => {
    await loginAsAdmin(page)

    const today = new Date().toISOString().slice(0, 10)
    const expiry = new Date()
    expiry.setDate(expiry.getDate() + 30)

    const createRes = await page.request.post("/api/quotes", {
      data: {
        clientCompany: "Bristol Scaffolding Ltd",
        address: "14 Clifton Road, Bristol, BS8 1AF",
        typeOfWorks: "Temporary Roof",
        quoteValue: "1500",
        quoteDate: today,
        expiryDate: expiry.toISOString().slice(0, 10),
      },
    })
    expect(createRes.ok(), await createRes.text()).toBeTruthy()
    const quote = await createRes.json() as { id: string; quoteNumber: string }
    expect(quote.id).toBeTruthy()

    const acceptRes = await page.request.patch(`/api/quotes/${quote.id}`, {
      data: { status: "ACCEPTED" },
    })
    expect(acceptRes.ok(), await acceptRes.text()).toBeTruthy()

    const convertRes = await page.request.post(`/api/quotes/${quote.id}/convert`, {
      data: { designer: "Sarah Mitchell" },
    })
    expect(convertRes.status(), await convertRes.text()).toBe(201)

    const body = await convertRes.json() as {
      job: { id: string; drawingNumber: string }
      quote: { jobId: string | null }
    }
    expect(body.job.drawingNumber).toMatch(/ORYX/)
    expect(body.quote.jobId).toBe(body.job.id)
  })

  test("rejects convert when quote is not accepted", async ({ page }) => {
    await loginAsAdmin(page)

    const today = new Date().toISOString().slice(0, 10)
    const createRes = await page.request.post("/api/quotes", {
      data: {
        clientCompany: "Acme Access Ltd",
        address: "7 Whiteladies Road, Bristol",
        typeOfWorks: "Access Scaffold",
        quoteValue: "800",
        quoteDate: today,
      },
    })
    expect(createRes.ok(), await createRes.text()).toBeTruthy()
    const quote = await createRes.json() as { id: string }

    const convertRes = await page.request.post(`/api/quotes/${quote.id}/convert`, { data: {} })
    expect(convertRes.status()).toBe(422)
    const err = await convertRes.json() as { error?: string }
    expect(err.error).toMatch(/accepted/i)
  })
})
