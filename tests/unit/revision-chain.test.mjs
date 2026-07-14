import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  buildRevisionFamilyIndex,
  compareRevisionLetters,
  enrichRevisionFamily,
  revisionFamilyLabel,
  revisionParentId,
} from "../../lib/revision-chain.ts"

describe("compareRevisionLetters", () => {
  it("orders A before B", () => {
    assert.ok(compareRevisionLetters("A", "B") < 0)
    assert.ok(compareRevisionLetters("B", "A") > 0)
  })
})

describe("buildRevisionFamilyIndex", () => {
  it("counts revisions and picks the latest letter per parent", () => {
    const rows = [
      { id: "rev-a", parentJobId: "orig-1", revisionLetter: "A" },
      { id: "rev-b", parentJobId: "orig-1", revisionLetter: "B" },
      { id: "rev-c", parentJobId: "orig-2", revisionLetter: "A" },
    ]
    const { countByParent, latestByParent } = buildRevisionFamilyIndex(rows)
    assert.equal(countByParent.get("orig-1"), 2)
    assert.equal(latestByParent.get("orig-1")?.id, "rev-b")
    assert.equal(latestByParent.get("orig-2")?.id, "rev-c")
  })
})

describe("enrichRevisionFamily", () => {
  const revisionRows = [
    { id: "rev-a", parentJobId: "orig-1", revisionLetter: "A", status: "ISSUED", designer: "Bob" },
    { id: "rev-b", parentJobId: "orig-1", revisionLetter: "B", status: "IN_DESIGN", designer: "Carol" },
  ]

  it("flags originals with revision counts", () => {
    const [original] = enrichRevisionFamily(
      [{ id: "orig-1", parentJobId: null, revisionLetter: null, status: "ISSUED", designer: "Alice" }],
      revisionRows,
    )
    assert.equal(original.hasRevisions, true)
    assert.equal(original.revisionCount, 2)
    assert.equal(original.latestRevisionLetter, "B")
    // Parent cards always offer Add revision; create API still anchors on the latest letter.
    assert.equal(original.canAddRevision, true)
    assert.equal(original.status, "IN_DESIGN") // overlaid from Rev B
    assert.equal(original.currentRevisionLetter, "B")
  })

  it("flags the latest revision in the chain", () => {
    const [revB] = enrichRevisionFamily(
      [{ id: "rev-b", parentJobId: "orig-1", revisionLetter: "B" }],
      revisionRows,
    )
    assert.equal(revB.isLatestInChain, true)
    assert.equal(revB.canAddRevision, true)
    assert.equal(revisionParentId(revB), "orig-1")
  })
})

describe("revisionFamilyLabel", () => {
  it("describes originals with revisions", () => {
    const label = revisionFamilyLabel({
      parentJobId: null,
      revisionLetter: null,
      hasRevisions: true,
      revisionCount: 2,
      latestRevisionLetter: "B",
      isLatestInChain: false,
    })
    assert.equal(label, "2 revisions (latest B)")
  })

  it("describes a revision in the chain", () => {
    const label = revisionFamilyLabel({
      parentJobId: "orig-1",
      revisionLetter: "A",
      hasRevisions: true,
      revisionCount: 2,
      latestRevisionLetter: "B",
      isLatestInChain: false,
    })
    assert.match(label ?? "", /Rev A/)
    assert.match(label ?? "", /latest B/)
  })
})
