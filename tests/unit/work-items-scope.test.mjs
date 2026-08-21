import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  statusesForMixedScope,
  mixedRowCurrentWorkType,
} from "../../modules/jobs/services/mixed-workload-service.ts"
import { matchesJobsListScope, parseJobsListScope } from "../../modules/jobs/lib/current-work.ts"

describe("work-items scope parity helpers", () => {
  it("parses scope aliases", () => {
    assert.equal(parseJobsListScope("active"), "active")
    assert.equal(parseJobsListScope("revisions"), "revisions")
    assert.equal(parseJobsListScope("with_active_revision"), "revisions")
    assert.equal(parseJobsListScope("completed"), "completed")
    assert.equal(parseJobsListScope("all"), "all")
    assert.equal(parseJobsListScope(null), "all")
  })

  it("statusesForMixedScope matches Jobs Register tabs", () => {
    assert.deepEqual(statusesForMixedScope("active"), [
      "NEW_REQUEST", "IN_DESIGN", "CHECKING", "READY_TO_SEND",
    ])
    assert.deepEqual(statusesForMixedScope("revisions"), [
      "NEW_REQUEST", "IN_DESIGN", "CHECKING", "READY_TO_SEND",
    ])
    assert.deepEqual(statusesForMixedScope("completed"), ["ISSUED"])
    assert.ok(statusesForMixedScope("all").includes("ISSUED"))
    assert.ok(statusesForMixedScope("all").includes("IN_DESIGN"))
    assert.deepEqual(statusesForMixedScope("active", "CHECKING"), ["CHECKING"])
  })

  it("mixedRowCurrentWorkType mirrors classic current-work classification", () => {
    assert.equal(mixedRowCurrentWorkType({ workType: "ORIGINAL", status: "IN_DESIGN" }), "original")
    assert.equal(mixedRowCurrentWorkType({ workType: "REVISION", status: "CHECKING" }), "revision")
    assert.equal(mixedRowCurrentWorkType({ workType: "ORIGINAL", status: "ISSUED" }), "none")
    assert.equal(mixedRowCurrentWorkType({ workType: "REVISION", status: "ISSUED" }), "none")
  })

  it("server-filtered rows satisfy matchesJobsListScope for every tab", () => {
    const rows = [
      { workType: "ORIGINAL", status: "IN_DESIGN" },
      { workType: "REVISION", status: "CHECKING" },
      { workType: "ORIGINAL", status: "ISSUED" },
      { workType: "REVISION", status: "ISSUED" },
    ]
    const classified = rows.map(r => ({
      ...r,
      currentWorkType: mixedRowCurrentWorkType(r),
    }))

    const forScope = (scope) =>
      classified.filter(r => matchesJobsListScope(r.currentWorkType, scope))

    assert.equal(forScope("all").length, 4)
    assert.equal(forScope("active").length, 2)
    assert.equal(forScope("revisions").length, 1)
    assert.equal(forScope("completed").length, 2)

    // Simulate underfilled-page bug: only first 2 of a larger set are "active".
    // Scope filtering must happen before pagination — helpers classify correctly
    // so a server that filters by statusesForMixedScope("active") keeps both.
    const mostlyComplete = [
      ...Array.from({ length: 98 }, () => ({ workType: "ORIGINAL", status: "ISSUED" })),
      { workType: "ORIGINAL", status: "IN_DESIGN" },
      { workType: "REVISION", status: "NEW_REQUEST" },
    ].map(r => ({ currentWorkType: mixedRowCurrentWorkType(r) }))

    const active = mostlyComplete.filter(r => matchesJobsListScope(r.currentWorkType, "active"))
    assert.equal(active.length, 2)
    assert.equal(mostlyComplete.length, 100)
  })
})
