import { test, expect, loginAsAdmin, loginAsEngineer } from "./helpers"

test.describe("Clients API smoke", () => {
  test("admin can create, update, and archive a client", async ({ page }) => {
    await loginAsAdmin(page)

    const stamp = Date.now()
    const name = `E2E Client ${stamp}`

    const createRes = await page.request.post("/api/clients", {
      data: {
        name,
        billingAddress: "1 Test Street, Bristol",
        contactName: "Alex Tester",
        email: `e2e-${stamp}@example.com`,
      },
    })
    expect(createRes.status(), await createRes.text()).toBe(201)
    const created = await createRes.json() as { id: string; name: string }
    expect(created.id).toBeTruthy()
    expect(created.name).toBe(name)

    const getRes = await page.request.get(`/api/clients/${created.id}`)
    expect(getRes.ok(), await getRes.text()).toBeTruthy()
    const loaded = await getRes.json() as { client: { id: string; name: string } }
    expect(loaded.client.id).toBe(created.id)

    const patchRes = await page.request.patch(`/api/clients/${created.id}`, {
      data: { notes: "Updated by e2e smoke" },
    })
    expect(patchRes.ok(), await patchRes.text()).toBeTruthy()
    const patched = await patchRes.json() as { notes?: string | null }
    expect(patched.notes).toBe("Updated by e2e smoke")

    const deleteRes = await page.request.delete(`/api/clients/${created.id}`)
    expect(deleteRes.ok(), await deleteRes.text()).toBeTruthy()
    const archived = await deleteRes.json() as {
      archived?: boolean
      client?: { archivedAt?: string | null }
    }
    expect(archived.archived).toBe(true)
    expect(archived.client?.archivedAt).toBeTruthy()
  })

  test("rejects duplicate client names", async ({ page }) => {
    await loginAsAdmin(page)

    const name = `E2E Dup Client ${Date.now()}`
    const first = await page.request.post("/api/clients", {
      data: { name, billingAddress: "2 Test Street" },
    })
    expect(first.status(), await first.text()).toBe(201)

    const second = await page.request.post("/api/clients", {
      data: { name, billingAddress: "3 Test Street" },
    })
    expect(second.status()).toBe(409)
  })

  test("engineer cannot archive a client", async ({ page }) => {
    await loginAsAdmin(page)
    const name = `E2E Eng Client ${Date.now()}`
    const createRes = await page.request.post("/api/clients", {
      data: { name, billingAddress: "4 Test Street" },
    })
    expect(createRes.status(), await createRes.text()).toBe(201)
    const client = await createRes.json() as { id: string }

    await loginAsEngineer(page)
    const deleteRes = await page.request.delete(`/api/clients/${client.id}`)
    expect(deleteRes.status()).toBe(403)
  })
})
