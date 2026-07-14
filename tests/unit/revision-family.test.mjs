import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { buildRevisionHistoryChain } from "../../modules/jobs/services/revision-family-service.ts"

const original = {
  id: "orig-1",
  drawingNumber: "26/ORYX/07/001",
  revisionLetter: null,
  parentJobId: null,
  status: "ISSUED",
  designer: "Alice",
  notes: null,
  dateCreated: "2026-07-14T10:00:00.000Z",
}

const revA = {
  id: "rev-a",
  drawingNumber: "26/ORYX/07/001 Rev A",
  revisionLetter: "A",
  parentJobId: "orig-1",
  status: "ISSUED",
  designer: "Bob",
  notes: "Client requested loading changes",
  dateCreated: "2026-07-16T10:00:00.000Z",
}

const revB = {
  id: "rev-b",
  drawingNumber: "26/ORYX/07/001 Rev B",
  revisionLetter: "B",
  parentJobId: "orig-1",
  status: "IN_DESIGN",
  designer: "Carol",
  notes: "Added pavement gantry",
  dateCreated: "2026-07-18T10:00:00.000Z",
}

describe("buildRevisionHistoryChain", () => {
  it("orders original then revisions with current first when building chain", () => {
    const issuedBy = new Map([
      ["orig-1", { changedBy: "Harry", changedAt: "2026-07-14T12:00:00.000Z" }],
      ["rev-a", { changedBy: "Harry", changedAt: "2026-07-16T15:00:00.000Z" }],
    ])
    const chain = buildRevisionHistoryChain({
      original,
      revisions: [revA, revB],
      currentJobId: "rev-b",
      issuedBy,
    })

    assert.equal(chain.length, 3)
    assert.equal(chain[0].isCurrent, true)
    assert.match(chain[0].title, /Current Revision/)
    assert.match(chain[0].title, /Rev B/)
    assert.equal(chain[0].billable, false)
    // Remaining entries reverse chronological
    assert.equal(chain[1].revisionLetter, "A")
    assert.equal(chain[1].notes, "Client requested loading changes")
    assert.equal(chain[2].isOriginal, true)
    assert.equal(chain[2].issuedBy, "Harry")
  })

  it("marks the original as current when viewing it", () => {
    const chain = buildRevisionHistoryChain({
      original,
      revisions: [revA],
      currentJobId: "orig-1",
      issuedBy: new Map(),
    })
    assert.equal(chain[0].isCurrent, true)
    assert.match(chain[0].title, /Current/)
  })
})
