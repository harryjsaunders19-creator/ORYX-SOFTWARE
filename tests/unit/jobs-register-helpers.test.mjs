import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  deriveNextAction,
  deriveProjectHealth,
  deriveWorkflowProgress,
  revisionBadgeLabel,
  siteDisplay,
  shortStatusLabel,
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
})
