import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { cat2DocumentReference } from "../../modules/jobs/pdf/cat2-check-sheet.ts"

describe("cat2DocumentReference", () => {
  it("omits revision from document reference when drawing has Rev suffix", () => {
    assert.equal(
      cat2DocumentReference("26/ORYX/07/540 Rev C", "C"),
      "26-ORYX-07-540-CATII Check Certificate",
    )
  })

  it("omits revisionLetter even when drawing has no Rev suffix", () => {
    assert.equal(
      cat2DocumentReference("26/ORYX/07/540", "C"),
      "26-ORYX-07-540-CATII Check Certificate",
    )
  })

  it("keeps base reference for originals without revision", () => {
    assert.equal(
      cat2DocumentReference("26/ORYX/07/540", null),
      "26-ORYX-07-540-CATII Check Certificate",
    )
  })
})
