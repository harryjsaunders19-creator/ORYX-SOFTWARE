import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  originalWorkItemId,
  deriveInvoiceFields,
  buildOriginalWorkItem,
  buildRevisionWorkItem,
  planDesignJobMigration,
  validateMigrationPlan,
  isDesignParentCandidate,
} from "../../lib/migrations/work-items-backfill.ts"

describe("work-items-backfill", () => {
  it("originalWorkItemId is stable per parent", () => {
    assert.equal(originalWorkItemId("abc123"), "abc123:wi-original")
  })

  it("isDesignParentCandidate matches DESIGN originals only", () => {
    assert.equal(isDesignParentCandidate({ itemType: "DESIGN", parentJobId: null }), true)
    assert.equal(isDesignParentCandidate({ itemType: "SITE_VISIT", parentJobId: null }), false)
    assert.equal(isDesignParentCandidate({ itemType: "DESIGN", parentJobId: "x" }), false)
  })

  it("deriveInvoiceFields marks cleared handoff as INVOICED", () => {
    const job = {
      id: "j1",
      status: "ISSUED",
      invoiceId: "INV-100",
      quoteValue: 450,
      variationFees: null,
      additionalCharges: null,
      quoteDate: "2026-01-10",
      parentJobId: null,
    }
    const result = deriveInvoiceFields(job, [
      { sourceJobId: "j1", clearedByAccountsAt: "2026-01-15T10:00:00Z" },
    ])
    assert.equal(result.invoiceStatus, "INVOICED")
    assert.equal(result.invoiceNumber, "INV-100")
    assert.equal(result.billedValue, 450)
  })

  it("deriveInvoiceFields marks active handoff as READY", () => {
    const job = { id: "j2", status: "ISSUED", parentJobId: null, billable: true }
    const result = deriveInvoiceFields(job, [
      { sourceJobId: "j2", clearedByAccountsAt: null },
    ])
    assert.equal(result.invoiceStatus, "READY")
  })

  it("deriveInvoiceFields non-billable revision complete stays NONE", () => {
    const job = { id: "j3", status: "ISSUED", parentJobId: "p1", billable: false }
    const result = deriveInvoiceFields(job, [])
    assert.equal(result.invoiceStatus, "NONE")
  })

  it("planDesignJobMigration splits parent and revisions", () => {
    const jobs = [
      {
        id: "p1",
        drawingNumber: "26/ORYX/07/001",
        itemType: "DESIGN",
        parentJobId: null,
        address: "Site",
        typeOfWorks: "Scaffold",
        clientCompany: "Acme",
        requestedBy: "Bob",
        status: "ISSUED",
        designer: "Jane",
        dateCreated: "2026-01-01",
        createdAt: "2026-01-01",
        updatedAt: "2026-01-02",
        billable: true,
      },
      {
        id: "r1",
        drawingNumber: "26/ORYX/07/001 Rev A",
        itemType: "REVISION",
        parentJobId: "p1",
        revisionLetter: "A",
        address: "Site",
        typeOfWorks: "Scaffold",
        clientCompany: "Acme",
        requestedBy: "Bob",
        status: "IN_DESIGN",
        designer: "Jane",
        dateCreated: "2026-02-01",
        createdAt: "2026-02-01",
        updatedAt: "2026-02-02",
        billable: false,
      },
      {
        id: "sv1",
        drawingNumber: "SV-2026-001",
        itemType: "SITE_VISIT",
        parentJobId: null,
        address: "Site",
        typeOfWorks: "",
        clientCompany: "Beta",
        requestedBy: "Bob",
        status: "NEW_REQUEST",
        designer: "",
        dateCreated: "2026-03-01",
        createdAt: "2026-03-01",
        updatedAt: "2026-03-01",
      },
    ]
    const plan = planDesignJobMigration(jobs, [], "2026-07-14T00:00:00Z")
    const validation = validateMigrationPlan(jobs, plan)

    assert.equal(plan.parents.length, 1)
    assert.equal(plan.parents[0].drawingNumber, "26/ORYX/07/001")
    assert.equal(plan.workItems.length, 2)
    assert.equal(plan.workItems.filter(w => w.workType === "ORIGINAL").length, 1)
    assert.equal(plan.workItems.filter(w => w.workType === "REVISION").length, 1)
    assert.equal(plan.workItems.find(w => w.workType === "ORIGINAL").id, "p1:wi-original")
    assert.equal(plan.workItems.find(w => w.workType === "REVISION").id, "r1")
    assert.equal(validation.ok, true)
  })

  it("buildOriginalWorkItem uses Original Issue title", () => {
    const parent = {
      id: "p1",
      drawingNumber: "26/ORYX/07/001",
      itemType: "DESIGN",
      parentJobId: null,
      status: "IN_DESIGN",
      designer: "Jane",
      dateCreated: "2026-01-01",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
      billable: true,
    }
    const item = buildOriginalWorkItem(parent, [], "2026-07-14T00:00:00Z")
    assert.equal(item.title, "Original Issue")
    assert.equal(item.workType, "ORIGINAL")
  })

  it("buildRevisionWorkItem preserves revision id", () => {
    const rev = {
      id: "rev-a",
      parentJobId: "p1",
      revisionLetter: "A",
      status: "CHECKING",
      designer: "Jane",
      dateCreated: "2026-02-01",
      createdAt: "2026-02-01",
      updatedAt: "2026-02-01",
      billable: false,
    }
    const item = buildRevisionWorkItem(rev, [], "2026-07-14T00:00:00Z")
    assert.equal(item.id, "rev-a")
    assert.equal(item.title, "Revision A")
  })
})
