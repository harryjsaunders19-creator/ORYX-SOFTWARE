import assert from "node:assert/strict"
import { describe, it } from "node:test"

/** Mirrors jobs DELETE body validation (reason required, ≥3 chars). */
function validateCancelBody(body) {
  const reason = typeof body?.reason === "string" ? body.reason.trim() : ""
  if (reason.length < 3) {
    return { ok: false, status: 422, error: "A cancellation reason is required (at least 3 characters)" }
  }
  const notes = typeof body?.notes === "string" ? body.notes.trim() : ""
  const archiveReason = notes ? `${reason}\n\nNotes: ${notes}` : reason
  return { ok: true, archiveReason }
}

describe("job cancellation validation", () => {
  it("accepts a valid reason", () => {
    const r = validateCancelBody({ reason: "Client withdrew" })
    assert.equal(r.ok, true)
    assert.equal(r.archiveReason, "Client withdrew")
  })

  it("rejects missing reason", () => {
    const r = validateCancelBody({})
    assert.equal(r.ok, false)
    assert.equal(r.status, 422)
  })

  it("rejects short reason", () => {
    const r = validateCancelBody({ reason: "no" })
    assert.equal(r.ok, false)
  })

  it("appends optional notes to the archive reason", () => {
    const r = validateCancelBody({ reason: "Duplicate entry", notes: "Created twice by mistake" })
    assert.equal(r.ok, true)
    assert.match(r.archiveReason, /Notes: Created twice/)
  })
})
