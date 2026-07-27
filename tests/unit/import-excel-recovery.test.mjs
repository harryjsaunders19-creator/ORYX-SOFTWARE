import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import ExcelJS from "exceljs"
import { importFromExcelBuffer } from "../../modules/import-export/services/excel-import.ts"
import { clientService } from "../../lib/services/client-service.ts"
import { jobService } from "../../lib/services/job-service.ts"
import { quoteService } from "../../lib/services/quote-service.ts"
import { userService } from "../../lib/services/user-service.ts"

const restores = []
function patchMethod(obj, key, impl) {
  const original = obj[key]
  obj[key] = impl
  restores.push(() => { obj[key] = original })
}

afterEach(() => {
  while (restores.length) restores.pop()()
})

async function workbookBufferWithSheets() {
  const wb = new ExcelJS.Workbook()

  const clients = wb.addWorksheet("Clients")
  clients.addRow(["Company Name", "Customer ID", "Main Contact", "Phone", "Email", "Billing Address", "Notes", "Status", "Added"])

  const jobs = wb.addWorksheet("Jobs")
  jobs.addRow([
    "Drawing Number", "Item Type", "Site Address", "Type of Works",
    "Client", "Customer ID", "Requested By", "Status", "Designer",
    "Quote Value (£)", "Variation Fees (£)", "Quote Reference",
    "Date Created", "Required By", "Date Completed", "Last Updated", "Notes",
  ])

  const quotes = wb.addWorksheet("Quotes")
  quotes.addRow([
    "Quote Number", "Status", "Client", "Contact", "Site Address", "Description",
    "Quote Value (£)", "VAT Rate (%)", "Quote Date", "Expiry Date", "Created By", "Notes",
  ])

  const users = wb.addWorksheet("Users")
  users.addRow(["User ID", "Name", "Email", "Role", "Status", "Account Created"])

  return wb.xlsx.writeBuffer()
}

describe("excel import recovery paths", () => {
  it("imports Users sheet and sets temporary credentials for new users", async () => {
    const createdUsers = []
    patchMethod(clientService, "findManyWithMeta", async () => [])
    patchMethod(jobService, "findMany", async () => [])
    patchMethod(quoteService, "findMany", async () => [])
    patchMethod(userService, "findMany", async () => [])
    patchMethod(clientService, "create", async () => null)
    patchMethod(clientService, "update", async () => null)
    patchMethod(jobService, "create", async () => null)
    patchMethod(jobService, "update", async () => null)
    patchMethod(quoteService, "create", async () => null)
    patchMethod(quoteService, "update", async () => null)
    patchMethod(userService, "create", async (payload) => {
      createdUsers.push(payload)
      return payload
    })
    patchMethod(userService, "update", async () => null)

    const buf = await workbookBufferWithSheets()
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    wb.getWorksheet("Users").addRow([
      "u-123",
      "Backup User",
      "backup.user@example.com",
      "ENGINEER",
      "Active",
      "28/07/2026",
    ])

    const result = await importFromExcelBuffer(await wb.xlsx.writeBuffer())

    assert.equal(result.users.created, 1)
    assert.equal(createdUsers.length, 1)
    assert.equal(createdUsers[0].id, "u-123")
    assert.equal(createdUsers[0].mustChangePassword, 1)
    assert.ok(typeof createdUsers[0].passwordHash === "string" && createdUsers[0].passwordHash.length > 20)
  })

  it("links Jobs to Clients by Customer ID on import", async () => {
    const createdJobs = []
    const existingClient = {
      id: "client-1",
      name: "Canonical Client Ltd",
      nameLower: "canonical client ltd",
      contactName: null,
      email: null,
      phone: null,
      billingAddress: null,
      notes: null,
      accountCode: "CUST-100",
      active: 1,
      archivedAt: null,
      archivedBy: null,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    }

    patchMethod(clientService, "findManyWithMeta", async () => [existingClient])
    patchMethod(jobService, "findMany", async () => [])
    patchMethod(quoteService, "findMany", async () => [])
    patchMethod(userService, "findMany", async () => [])
    patchMethod(clientService, "create", async () => null)
    patchMethod(clientService, "update", async () => null)
    patchMethod(jobService, "create", async (payload) => {
      createdJobs.push(payload)
      return payload
    })
    patchMethod(jobService, "update", async () => null)
    patchMethod(quoteService, "create", async () => null)
    patchMethod(quoteService, "update", async () => null)
    patchMethod(userService, "create", async () => null)
    patchMethod(userService, "update", async () => null)

    const buf = await workbookBufferWithSheets()
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    wb.getWorksheet("Jobs").addRow([
      "DRW-100",
      "Design",
      "12 River Street",
      "Access Scaffold",
      "Wrong Client Name",
      "CUST-100",
      "Requester",
      "New Request",
      "Admin",
      500,
      25,
      "Q-123",
      "28/07/2026",
      "",
      "",
      "",
      "Recovered row",
    ])

    const result = await importFromExcelBuffer(await wb.xlsx.writeBuffer())

    assert.equal(result.jobs.created, 1)
    assert.equal(createdJobs.length, 1)
    assert.equal(createdJobs[0].clientId, "client-1")
    assert.equal(createdJobs[0].clientCompany, "Canonical Client Ltd")
  })
})
