import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  applyClassicDesignerPatch,
  applyClassicStatusPatch,
  createPendingMutationGate,
  patchClassicJobsCache,
  predictWorkTypeAfterStatusChange,
  shouldRemoveFromScope,
} from "../../modules/jobs/lib/jobs-register-optimistic.ts"

describe("jobs-register-optimistic helpers", () => {
  it("predicts work type for original complete / reopen", () => {
    assert.equal(
      predictWorkTypeAfterStatusChange({
        previousWorkType: "original",
        nextStatus: "ISSUED",
        projectStatus: "IN_DESIGN",
      }),
      "none",
    )
    assert.equal(
      predictWorkTypeAfterStatusChange({
        previousWorkType: "none",
        nextStatus: "IN_DESIGN",
        projectStatus: "ISSUED",
      }),
      "original",
    )
  })

  it("predicts revision complete falls back to parent activity", () => {
    assert.equal(
      predictWorkTypeAfterStatusChange({
        previousWorkType: "revision",
        nextStatus: "ISSUED",
        projectStatus: "ISSUED",
      }),
      "none",
    )
    assert.equal(
      predictWorkTypeAfterStatusChange({
        previousWorkType: "revision",
        nextStatus: "ISSUED",
        projectStatus: "IN_DESIGN",
      }),
      "original",
    )
    assert.equal(
      predictWorkTypeAfterStatusChange({
        previousWorkType: "revision",
        nextStatus: "CHECKING",
        projectStatus: "ISSUED",
      }),
      "revision",
    )
  })

  it("scope removal matches Jobs tabs", () => {
    assert.equal(shouldRemoveFromScope("none", "active"), true)
    assert.equal(shouldRemoveFromScope("none", "completed"), false)
    assert.equal(shouldRemoveFromScope("revision", "revisions"), false)
    assert.equal(shouldRemoveFromScope("original", "revisions"), true)
    assert.equal(shouldRemoveFromScope("none", "all"), false)
  })

  it("does not overwrite parent status when editing a revision", () => {
    const patched = applyClassicStatusPatch(
      { id: "p1", status: "ISSUED", currentStatus: "CHECKING" },
      { nextStatus: "READY_TO_SEND", editingRevision: true, nextWorkType: "revision" },
    )
    assert.equal(patched.status, "ISSUED")
    assert.equal(patched.currentStatus, "READY_TO_SEND")
  })

  it("overwrites parent status when editing the original", () => {
    const patched = applyClassicStatusPatch(
      { id: "p1", status: "IN_DESIGN", currentStatus: "IN_DESIGN" },
      { nextStatus: "ISSUED", editingRevision: false, nextWorkType: "none" },
    )
    assert.equal(patched.status, "ISSUED")
    assert.equal(patched.currentStatus, "ISSUED")
  })

  it("designer patch keeps parent designer when editing revision", () => {
    const patched = applyClassicDesignerPatch(
      { id: "p1", designer: "Parent", currentDesigner: "RevDes" },
      "Sam",
      true,
    )
    assert.equal(patched.designer, "Parent")
    assert.equal(patched.currentDesigner, "Sam")
  })

  it("removes row from active scope and decrements total", () => {
    const next = patchClassicJobsCache(
      {
        jobs: [
          { id: "a", status: "IN_DESIGN", currentStatus: "IN_DESIGN" },
          { id: "b", status: "IN_DESIGN", currentStatus: "IN_DESIGN" },
        ],
        total: 2,
      },
      {
        projectId: "a",
        scope: "active",
        nextWorkType: "none",
        patch: job => applyClassicStatusPatch(job, {
          nextStatus: "ISSUED",
          editingRevision: false,
          nextWorkType: "none",
        }),
      },
    )
    assert.equal(next?.jobs.length, 1)
    assert.equal(next?.jobs[0]?.id, "b")
    assert.equal(next?.total, 1)
  })

  it("keeps row on all scope when completing", () => {
    const next = patchClassicJobsCache(
      {
        jobs: [{ id: "a", status: "IN_DESIGN", currentStatus: "IN_DESIGN" }],
        total: 1,
      },
      {
        projectId: "a",
        scope: "all",
        nextWorkType: "none",
        patch: job => applyClassicStatusPatch(job, {
          nextStatus: "ISSUED",
          editingRevision: false,
          nextWorkType: "none",
        }),
      },
    )
    assert.equal(next?.jobs.length, 1)
    assert.equal(next?.jobs[0]?.currentStatus, "ISSUED")
    assert.equal(next?.total, 1)
  })

  it("pending mutation gate only clears when last mutation ends", () => {
    const gate = createPendingMutationGate()
    gate.begin("j1")
    gate.begin("j1")
    assert.equal(gate.end("j1"), false)
    assert.equal(gate.isPending("j1"), true)
    assert.equal(gate.end("j1"), true)
    assert.equal(gate.isPending("j1"), false)
  })
})
