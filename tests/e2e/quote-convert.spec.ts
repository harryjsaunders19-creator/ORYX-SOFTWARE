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
      data: { designer: "Admin" },
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

  test("blocks convert when client is on hold", async ({ page }) => {
    await loginAsAdmin(page)

    const clientName = `E2E Hold Client ${Date.now()}`
    const createClientRes = await page.request.post("/api/clients", {
      data: { name: clientName, billingAddress: "1 Test Street" },
    })
    expect(createClientRes.ok(), await createClientRes.text()).toBeTruthy()
    const client = await createClientRes.json() as { id: string }

    const holdRes = await page.request.post(`/api/clients/${client.id}/hold`, {
      data: { reason: "E2E test hold — unpaid invoices" },
    })
    expect(holdRes.status(), await holdRes.text()).toBe(201)

    const today = new Date().toISOString().slice(0, 10)
    const quoteRes = await page.request.post("/api/quotes", {
      data: {
        clientId: client.id,
        clientCompany: clientName,
        address: "1 Test Street, Bristol",
        typeOfWorks: "Temporary Roof",
        quoteValue: "2000",
        quoteDate: today,
      },
    })
    expect(quoteRes.ok(), await quoteRes.text()).toBeTruthy()
    const quote = await quoteRes.json() as { id: string }

    await page.request.patch(`/api/quotes/${quote.id}`, { data: { status: "ACCEPTED" } })

    const blocked = await page.request.post(`/api/quotes/${quote.id}/convert`, { data: {} })
    expect(blocked.status()).toBe(422)
    const blockedBody = await blocked.json() as { onHold?: boolean; holdReason?: string }
    expect(blockedBody.onHold).toBe(true)
    expect(blockedBody.holdReason).toBeTruthy()

    const proceed = await page.request.post(`/api/quotes/${quote.id}/convert`, {
      data: { proceedDespiteHold: true, designer: "Admin" },
    })
    expect(proceed.status(), await proceed.text()).toBe(201)
  })
})
