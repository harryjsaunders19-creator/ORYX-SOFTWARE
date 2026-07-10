import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  compareJobsForList,
  computeJobListSortKey,
  sortJobsForList,
} from "../../modules/jobs/job-list-sort.ts"

describe("computeJobListSortKey", () => {
  it("orders originals before revisions of the same drawing", () => {
    const original = computeJobListSortKey("26/ORYX/07/015", null, null)
    const revA = computeJobListSortKey("26/ORYX/07/015 Rev A", "parent-id", "A")
    assert.ok(original < revA)
  })

  it("orders lower sequence numbers first", () => {
    const a = computeJobListSortKey("26/ORYX/07/002", null, null)
    const b = computeJobListSortKey("26/ORYX/07/010", null, null)
    assert.ok(a < b)
  })
})

describe("sortJobsForList vs list_sort_key", () => {
  const rows = [
    { drawingNumber: "26/ORYX/07/010", parentJobId: null, revisionLetter: null, createdAt: "2026-07-01" },
    { drawingNumber: "26/ORYX/07/002", parentJobId: null, revisionLetter: null, createdAt: "2026-07-02" },
    { drawingNumber: "26/ORYX/07/002 Rev A", parentJobId: "p1", revisionLetter: "A", createdAt: "2026-07-03" },
  ]

  it("matches in-memory sort order when sorted by computeJobListSortKey", () => {
    const expected = sortJobsForList(rows, "asc").map(r => r.drawingNumber)
    const byKey = [...rows]
      .sort((a, b) =>
        computeJobListSortKey(a.drawingNumber, a.parentJobId, a.revisionLetter)
          .localeCompare(computeJobListSortKey(b.drawingNumber, b.parentJobId, b.revisionLetter)),
      )
      .map(r => r.drawingNumber)
    assert.deepEqual(byKey, expected)
  })

  it("compareJobsForList is consistent with key ordering for asc", () => {
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const cmp = compareJobsForList(rows[i], rows[j], "asc")
        const keyCmp = computeJobListSortKey(rows[i].drawingNumber, rows[i].parentJobId, rows[i].revisionLetter)
          .localeCompare(computeJobListSortKey(rows[j].drawingNumber, rows[j].parentJobId, rows[j].revisionLetter))
        assert.equal(Math.sign(cmp), Math.sign(keyCmp))
      }
    }
  })
})
