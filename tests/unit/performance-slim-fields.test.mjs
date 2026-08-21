import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { performanceRowsFromRawJobs } from "../../modules/performance/services/performance-service.ts"

describe("performance slim-field equivalence", () => {
  const slim = {
    id: "j1",
    drawingNumber: "26/ORYX/01/001",
    clientId: "c1",
    clientCompany: "Acme Scaffolding",
    designer: "Priya Shah",
    status: "ISSUED",
    itemType: "DESIGN",
    tags: ["CAT II"],
    dateCreated: "2026-07-10T12:00:00.000Z",
    dateCompleted: "2026-07-15T09:00:00.000Z",
    requiredByDate: "2026-07-20",
    requestedDate: "2026-07-01",
    parentJobId: null,
  }

  const fullShaped = {
    ...slim,
    address: "1 High Street",
    notes: "should be ignored by performance mapping",
    quoteValue: 1500,
    invoiceId: "inv-1",
    archivedAt: null,
  }

  it("maps slim and full-shaped rows with the same KPI fields identically", () => {
    const fromSlim = performanceRowsFromRawJobs([slim])
    const fromFull = performanceRowsFromRawJobs([fullShaped])
    assert.deepEqual(fromSlim, fromFull)
  })

  it("normalises designer empty string to Unassigned", () => {
    const [row] = performanceRowsFromRawJobs([{ ...slim, designer: "" }])
    assert.equal(row.designer, "Unassigned")
  })

  it("preserves revision parent links and tags", () => {
    const [row] = performanceRowsFromRawJobs([{
      ...slim,
      id: "rev-a",
      parentJobId: "j1",
      tags: ["urgent", "site"],
      dateCreated: "2026-08-01",
    }])
    assert.equal(row.parentJobId, "j1")
    assert.deepEqual(row.tags, ["urgent", "site"])
    assert.equal(row.createdDate, "2026-08-01")
  })

  it("handles null optional date fields", () => {
    const [row] = performanceRowsFromRawJobs([{
      ...slim,
      dateCompleted: null,
      requiredByDate: null,
      requestedDate: null,
      clientId: null,
      status: "IN_DESIGN",
    }])
    assert.equal(row.completedDate, null)
    assert.equal(row.requiredByDate, null)
    assert.equal(row.requestedDate, null)
    assert.equal(row.clientId, null)
    assert.equal(row.status, "IN_DESIGN")
  })
})
