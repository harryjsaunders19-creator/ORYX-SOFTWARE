/**
 * Unit tests for current-revision deadline tallies (dashboard overdue KPI).
 */
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  countActiveOriginalJobs,
  countActiveRevisions,
  overdueOriginalIds,
  tallyDeadlineStats,
} from "../../modules/jobs/services/deadline-tallies.ts"

const TODAY = "2026-07-28"

function row(partial) {
  return {
    parentJobId: null,
    revisionLetter: null,
    requiredByDate: null,
    ...partial,
  }
}

describe("tallyDeadlineStats", () => {
  it("counts an overdue original with no revisions", () => {
    const rows = [
      row({ id: "p1", status: "IN_DESIGN", requiredByDate: "2026-07-20" }),
    ]
    assert.deepEqual(tallyDeadlineStats(rows, TODAY), {
      overdueCount: 1,
      dueTodayCount: 0,
      dueThisWeekCount: 0,
    })
  })

  it("does not count revision rows separately when the current revision is on track", () => {
    const rows = [
      row({ id: "p1", status: "IN_DESIGN", requiredByDate: "2026-07-01" }),
      row({
        id: "r1",
        parentJobId: "p1",
        revisionLetter: "A",
        status: "IN_DESIGN",
        requiredByDate: "2026-07-15",
      }),
      row({
        id: "r2",
        parentJobId: "p1",
        revisionLetter: "B",
        status: "CHECKING",
        requiredByDate: "2026-08-10",
      }),
    ]
    assert.deepEqual(tallyDeadlineStats(rows, TODAY), {
      overdueCount: 0,
      dueTodayCount: 0,
      dueThisWeekCount: 0,
    })
    assert.deepEqual(overdueOriginalIds(rows, TODAY), [])
  })

  it("counts the original once when the latest revision is overdue", () => {
    const rows = [
      row({ id: "p1", status: "ISSUED", requiredByDate: "2026-07-01" }),
      row({
        id: "r1",
        parentJobId: "p1",
        revisionLetter: "A",
        status: "IN_DESIGN",
        requiredByDate: "2026-07-15",
      }),
    ]
    assert.deepEqual(tallyDeadlineStats(rows, TODAY), {
      overdueCount: 1,
      dueTodayCount: 0,
      dueThisWeekCount: 0,
    })
    assert.deepEqual(overdueOriginalIds(rows, TODAY), ["p1"])
  })

  it("ignores ISSUED current work", () => {
    const rows = [
      row({ id: "p1", status: "ISSUED", requiredByDate: "2026-07-01" }),
    ]
    assert.deepEqual(tallyDeadlineStats(rows, TODAY), {
      overdueCount: 0,
      dueTodayCount: 0,
      dueThisWeekCount: 0,
    })
  })

  it("tallies due today and due this week on the current revision", () => {
    const rows = [
      row({ id: "p1", status: "IN_DESIGN", requiredByDate: "2026-07-28" }),
      row({ id: "p2", status: "IN_DESIGN", requiredByDate: "2026-07-30" }),
      row({ id: "p3", status: "IN_DESIGN", requiredByDate: "2026-08-20" }),
    ]
    assert.deepEqual(tallyDeadlineStats(rows, TODAY), {
      overdueCount: 0,
      dueTodayCount: 1,
      dueThisWeekCount: 2,
    })
  })
})

describe("countActiveOriginalJobs", () => {
  it("counts only New Request and In Progress", () => {
    const rows = [
      row({ id: "a", status: "NEW_REQUEST" }),
      row({ id: "b", status: "IN_DESIGN" }),
      row({ id: "c", status: "CHECKING" }),
      row({ id: "d", status: "READY_TO_SEND" }),
      row({ id: "e", status: "ISSUED" }),
    ]
    assert.equal(countActiveOriginalJobs(rows), 2)
  })

  it("uses current-revision status so a completed current rev is not active", () => {
    const rows = [
      row({ id: "p1", status: "IN_DESIGN", requiredByDate: "2026-07-01" }),
      row({
        id: "r1",
        parentJobId: "p1",
        revisionLetter: "A",
        status: "ISSUED",
        requiredByDate: "2026-07-15",
      }),
    ]
    assert.equal(countActiveOriginalJobs(rows), 0)
  })

  it("counts a parent once when the current revision is still in progress", () => {
    const rows = [
      row({ id: "p1", status: "ISSUED" }),
      row({
        id: "r1",
        parentJobId: "p1",
        revisionLetter: "A",
        status: "IN_DESIGN",
      }),
    ]
    assert.equal(countActiveOriginalJobs(rows), 1)
  })

  it("does not count Requires Checking as active", () => {
    const rows = [
      row({ id: "p1", status: "ISSUED" }),
      row({
        id: "r1",
        parentJobId: "p1",
        revisionLetter: "A",
        status: "CHECKING",
      }),
    ]
    assert.equal(countActiveOriginalJobs(rows), 0)
  })
})

describe("countActiveRevisions", () => {
  it("counts only revision rows still in flight", () => {
    const rows = [
      row({ id: "p1", status: "ISSUED" }),
      row({ id: "r1", parentJobId: "p1", revisionLetter: "A", status: "IN_DESIGN" }),
      row({ id: "r2", parentJobId: "p1", revisionLetter: "B", status: "CHECKING" }),
      row({ id: "r3", parentJobId: "p1", revisionLetter: "C", status: "READY_TO_SEND" }),
      row({ id: "r4", parentJobId: "p1", revisionLetter: "D", status: "ISSUED" }),
    ]
    assert.equal(countActiveRevisions(rows), 2)
  })

  it("ignores original rows", () => {
    const rows = [
      row({ id: "p1", status: "IN_DESIGN" }),
      row({ id: "p2", status: "NEW_REQUEST" }),
    ]
    assert.equal(countActiveRevisions(rows), 0)
  })
})
