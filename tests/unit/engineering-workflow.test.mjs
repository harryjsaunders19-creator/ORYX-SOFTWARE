import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  engineeringDrawingLabel,
  getEngineeringStageFromDrawingStatus,
} from "../../modules/jobs/lib/engineering-workflow.ts"

describe("engineering-workflow", () => {
  it("maps drawing status to engineering stages", () => {
    assert.equal(getEngineeringStageFromDrawingStatus("NEW_REQUEST").id, "request")
    assert.equal(getEngineeringStageFromDrawingStatus("IN_DESIGN").id, "design")
    assert.equal(getEngineeringStageFromDrawingStatus("CHECKING").id, "check")
    assert.equal(getEngineeringStageFromDrawingStatus("READY_TO_SEND").id, "issue")
    assert.equal(getEngineeringStageFromDrawingStatus("ISSUED").id, "complete")
  })

  it("treats closed drawings as complete", () => {
    assert.equal(
      getEngineeringStageFromDrawingStatus("IN_DESIGN", { closed: true }).label,
      "Complete",
    )
  })

  it("labels the active drawing consistently", () => {
    assert.equal(
      engineeringDrawingLabel({ currentWorkType: "original" }),
      "Original",
    )
    assert.equal(
      engineeringDrawingLabel({
        currentWorkType: "revision",
        revisionLetter: "C",
      }),
      "Rev C",
    )
    assert.equal(
      engineeringDrawingLabel({ currentWorkType: "none" }),
      "Complete",
    )
  })
})
