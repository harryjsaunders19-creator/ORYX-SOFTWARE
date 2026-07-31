import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  getCurrentWorkItem,
  getCurrentWorkStatus,
  isProjectOperationallyActive,
  isProjectFullyClosed,
  pickLatestActiveRevision,
  statusChangeTitle,
  revisionsFromListOverlay,
} from "../../modules/jobs/lib/current-work.ts"
import {
  deriveNextAction,
  deriveProjectHealth,
  deriveWorkflowProgress,
  jobToRegisterProject,
  revisionBadgeLabel,
  siteDisplay,
  shortStatusLabel,
  drawingNumberContext,
  missingLabel,
} from "../../modules/jobs/components/jobs-register-helpers.ts"

describe("jobs-register-helpers", () => {
  it("formats revision badges", () => {
    assert.equal(revisionBadgeLabel(null), "Rev 0")
    assert.equal(revisionBadgeLabel("C"), "Rev C")
    assert.equal(revisionBadgeLabel("Rev B"), "REV B")
  })

  it("maps status to short register labels", () => {
    assert.equal(shortStatusLabel("CHECKING"), "Checking")
    assert.equal(shortStatusLabel("READY_TO_SEND"), "Awaiting Client")
    assert.equal(shortStatusLabel("IN_DESIGN"), "Designing")
    assert.equal(shortStatusLabel("ISSUED"), "Issued")
  })

  it("derives next actions from status", () => {
    assert.equal(deriveNextAction("CHECKING"), "Complete internal check")
    assert.equal(deriveNextAction("READY_TO_SEND"), "Issue to client")
    assert.equal(deriveNextAction("ISSUED"), "Complete")
  })

  it("marks overdue health when past required date", () => {
    const health = deriveProjectHealth("CHECKING", "2020-01-01")
    assert.equal(health.tone, "danger")
    assert.equal(health.label, "Overdue")
  })

  it("ticks workflow stages from status and files", () => {
    const stages = deriveWorkflowProgress({
      status: "CHECKING",
      hasDrawing: true,
      invoiceStatus: "NONE",
    })
    assert.deepEqual(
      stages.map(s => [s.id, s.done]),
      [
        ["created", true],
        ["uploaded", true],
        ["checking", true],
        ["issued", false],
        ["invoiced", false],
      ],
    )
  })

  it("handles missing site and address safely", () => {
    assert.equal(siteDisplay(null, null), "—")
    assert.equal(siteDisplay(undefined, ""), "—")
    assert.equal(siteDisplay("", "Terminal 2, London"), "Terminal 2")
  })

  it("builds drawing-number context without Closed label", () => {
    assert.equal(
      drawingNumberContext({
        currentRevisionLetter: "E",
        currentWorkType: "revision",
        revisionCount: 3,
      }),
      "Rev E",
    )
    assert.equal(
      drawingNumberContext({
        currentRevisionLetter: null,
        currentWorkType: "none",
        revisionCount: 3,
      }),
      "3 revisions",
    )
    assert.equal(
      drawingNumberContext({
        currentRevisionLetter: null,
        currentWorkType: "none",
        revisionCount: 0,
        dateCompleted: "2026-07-24",
      }),
      "Completed 24 Jul 2026",
    )
    assert.equal(
      drawingNumberContext({
        currentRevisionLetter: null,
        currentWorkType: "original",
        revisionCount: 0,
      }),
      "Original only",
    )
    assert.equal(
      drawingNumberContext({
        currentRevisionLetter: null,
        currentWorkType: "none",
        revisionCount: 0,
      }),
      "Original design",
    )
  })

  it("replaces bare dashes with readable empty states", () => {
    assert.equal(missingLabel(null, "Unassigned"), "Unassigned")
    assert.equal(missingLabel("—", "Not invoiced"), "Not invoiced")
    assert.equal(missingLabel("Ready", "Not invoiced"), "Ready")
  })
})

describe("drawing-status-colours", () => {
  it("maps workflow statuses to theme-aware colour tokens", async () => {
    const {
      getDrawingStatusColour,
      getDrawingStatusLabel,
      getDrawingStatusBadgeClass,
    } = await import("../../modules/jobs/lib/drawing-status-colours.ts")

    assert.equal(getDrawingStatusLabel("ISSUED"), "Complete")
    assert.equal(getDrawingStatusLabel("IN_DESIGN"), "In Progress")
    assert.match(getDrawingStatusColour("ISSUED").text, /ok/)
    assert.match(getDrawingStatusColour("CHECKING").text, /tag-revision/)
    assert.match(getDrawingStatusColour("READY_TO_SEND").text, /wn/)
    assert.match(getDrawingStatusBadgeClass("NEW_REQUEST"), /ac2/)
    assert.equal(getDrawingStatusColour("UNKNOWN").text, getDrawingStatusColour("NEW_REQUEST").text)
  })
})

describe("designer assignment titles", () => {
  it("names the assignment target explicitly", async () => {
    const { designerAssignmentTitle } = await import(
      "../../modules/jobs/components/designer-assignment-selector.tsx"
    )
    assert.equal(
      designerAssignmentTitle("original"),
      "Assign design engineer to original drawing",
    )
    assert.equal(
      designerAssignmentTitle("revision", "REV E"),
      "Assign design engineer to REV E",
    )
    assert.equal(
      designerAssignmentTitle("revision", "E"),
      "Assign design engineer to Rev E",
    )
  })
})

describe("current-work helpers", () => {
  const original = {
    id: "parent-1",
    status: "ISSUED",
    designer: "Harry",
    requiredByDate: null,
  }

  it("original active with no revisions", () => {
    const project = { ...original, status: "IN_DESIGN" }
    const cw = getCurrentWorkItem(project, [])
    assert.equal(cw.type, "original")
    assert.equal(cw.id, "parent-1")
    assert.equal(cw.revisionLabel, "ORIGINAL")
    assert.equal(cw.status, "IN_DESIGN")
    assert.equal(cw.isActive, true)
    assert.equal(isProjectOperationallyActive(project, []), true)
    assert.equal(isProjectFullyClosed(project, []), false)
  })

  it("original complete with no revisions", () => {
    const cw = getCurrentWorkItem(original, [])
    assert.equal(cw.type, "none")
    assert.equal(cw.displayLabel, "No Active Work")
    assert.equal(cw.isActive, false)
    assert.equal(isProjectFullyClosed(original, []), true)
  })

  it("original complete with Revision A designing", () => {
    const revs = [{
      id: "rev-a",
      revisionLetter: "A",
      status: "IN_DESIGN",
      designer: "Harry",
      requiredByDate: "2026-08-01",
    }]
    const cw = getCurrentWorkItem(original, revs)
    assert.equal(cw.type, "revision")
    assert.equal(cw.id, "rev-a")
    assert.equal(cw.revisionLabel, "REV A")
    assert.equal(cw.status, "IN_DESIGN")
    assert.equal(getCurrentWorkStatus(original, revs), "IN_DESIGN")
    // Original remains complete
    assert.equal(original.status, "ISSUED")
    assert.equal(isProjectFullyClosed(original, revs), false)
  })

  it("original complete with Revision A checking", () => {
    const revs = [{
      id: "rev-a",
      revisionLetter: "A",
      status: "CHECKING",
    }]
    const cw = getCurrentWorkItem(original, revs)
    assert.equal(cw.status, "CHECKING")
    assert.equal(cw.revisionLabel, "REV A")
  })

  it("original complete with Revision A complete → no active work", () => {
    const revs = [{
      id: "rev-a",
      revisionLetter: "A",
      status: "ISSUED",
    }]
    const cw = getCurrentWorkItem(original, revs)
    assert.equal(cw.type, "none")
    assert.equal(cw.displayLabel, "No Active Work")
    assert.equal(isProjectFullyClosed(original, revs), true)
  })

  it("original complete, A complete, B active → B is current", () => {
    const revs = [
      { id: "rev-a", revisionLetter: "A", status: "ISSUED" },
      { id: "rev-b", revisionLetter: "B", status: "NEW_REQUEST" },
    ]
    const cw = getCurrentWorkItem(original, revs)
    assert.equal(cw.id, "rev-b")
    assert.equal(cw.revisionLabel, "REV B")
    assert.equal(cw.status, "NEW_REQUEST")
  })

  it("multiple active revisions picks latest by letter and warns", () => {
    const revs = [
      { id: "rev-a", revisionLetter: "A", status: "CHECKING" },
      { id: "rev-c", revisionLetter: "C", status: "IN_DESIGN" },
      { id: "rev-b", revisionLetter: "B", status: "NEW_REQUEST" },
    ]
    const { revision, multipleActive } = pickLatestActiveRevision(revs)
    assert.equal(revision?.id, "rev-c")
    assert.equal(multipleActive, true)
    const cw = getCurrentWorkItem(original, revs)
    assert.equal(cw.id, "rev-c")
    assert.equal(cw.multipleActiveWarning, true)
  })

  it("completing active revision yields no active work", () => {
    const before = getCurrentWorkItem(original, [
      { id: "rev-a", revisionLetter: "A", status: "CHECKING" },
    ])
    assert.equal(before.type, "revision")
    const after = getCurrentWorkItem(original, [
      { id: "rev-a", revisionLetter: "A", status: "ISSUED" },
    ])
    assert.equal(after.type, "none")
  })

  it("reopening a completed revision makes it current again", () => {
    const closed = getCurrentWorkItem(original, [
      { id: "rev-a", revisionLetter: "A", status: "ISSUED" },
    ])
    assert.equal(closed.type, "none")
    const reopened = getCurrentWorkItem(original, [
      { id: "rev-a", revisionLetter: "A", status: "IN_DESIGN" },
    ])
    assert.equal(reopened.type, "revision")
    assert.equal(reopened.id, "rev-a")
  })

  it("creating a revision leaves original complete in mapping", () => {
    const job = {
      id: "p1",
      drawingNumber: "OX-1",
      clientCompany: "Client",
      siteName: null,
      address: "Site",
      status: "ISSUED",
      designer: "Harry",
      requiredByDate: null,
      quoteValue: 100,
      updatedAt: "2026-01-01",
      clientId: null,
      typeOfWorks: "Access Scaffold",
      revisionLetter: null,
      canAddRevision: true,
      revisionCount: 1,
      currentRevisionId: "r1",
      currentRevisionLetter: "A",
      currentStatus: "NEW_REQUEST",
      currentDesigner: "Harry",
      currentRequiredByDate: null,
      currentQuoteValue: 50,
    }
    const row = jobToRegisterProject(job)
    assert.equal(row.projectStatus, "ISSUED")
    assert.equal(row.currentWorkType, "revision")
    assert.equal(row.detailId, "r1")
    assert.equal(row.currentStatus, "NEW_REQUEST")
    assert.match(row.currentWorkLabel, /REV A/i)
  })

  it("status change titles are unambiguous", () => {
    assert.equal(statusChangeTitle("original"), "Change original design status")
    assert.equal(statusChangeTitle("revision", "REV C"), "Change REV C status")
    assert.equal(statusChangeTitle("revision", "C"), "Change Revision C status")
  })

  it("builds revision overlay from list fields", () => {
    const revs = revisionsFromListOverlay({
      id: "p1",
      status: "ISSUED",
      currentRevisionId: "r1",
      currentRevisionLetter: "B",
      currentStatus: "CHECKING",
    })
    assert.equal(revs.length, 1)
    assert.equal(revs[0].id, "r1")
    assert.equal(revs[0].status, "CHECKING")
  })
})
