import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  JOBS_REGISTER_LIVE_EVENT,
  JOBS_REGISTER_LIVE_POLL_MS,
  JOBS_REGISTER_LIVE_TOPIC,
  classifyJobsLiveReason,
} from "../../modules/jobs/lib/jobs-register-live.ts"
import { createPendingMutationGate } from "../../modules/jobs/lib/jobs-register-optimistic.ts"

describe("jobs register live constants", () => {
  it("uses a stable broadcast topic and event", () => {
    assert.equal(JOBS_REGISTER_LIVE_TOPIC, "jobs-register")
    assert.equal(JOBS_REGISTER_LIVE_EVENT, "change")
    assert.ok(JOBS_REGISTER_LIVE_POLL_MS >= 5_000)
    assert.ok(JOBS_REGISTER_LIVE_POLL_MS <= 15_000)
  })

  it("classifies status and designer patches", () => {
    assert.equal(classifyJobsLiveReason({ status: "IN_DESIGN" }), "status")
    assert.equal(classifyJobsLiveReason({ designer: "Ada" }), "designer")
    assert.equal(classifyJobsLiveReason({ status: "ISSUED", designer: "Ada" }), "update")
    assert.equal(classifyJobsLiveReason({ siteName: "X" }), "update")
  })
})

describe("pending gate vs remote reconcile", () => {
  it("reports hasAnyPending across rows", () => {
    const gate = createPendingMutationGate()
    assert.equal(gate.hasAnyPending(), false)
    gate.begin("a")
    assert.equal(gate.hasAnyPending(), true)
    gate.begin("b")
    gate.end("a")
    assert.equal(gate.hasAnyPending(), true)
    gate.end("b")
    assert.equal(gate.hasAnyPending(), false)
  })
})
