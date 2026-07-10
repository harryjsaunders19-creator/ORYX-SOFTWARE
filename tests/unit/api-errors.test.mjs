import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { apiInternalError } from "../../shared/api-errors.ts"

describe("apiInternalError", () => {
  it("returns 500 with a generic message by default", async () => {
    const res = apiInternalError("test.event", new Error("secret db path"))
    assert.equal(res.status, 500)
    const body = await res.json()
    assert.equal(body.error, "Internal server error")
    assert.equal(body.detail, undefined)
  })

  it("can expose detail for operator-facing routes", async () => {
    const res = apiInternalError("test.event", new Error("duplicate key"), {}, { exposeDetail: true })
    const body = await res.json()
    assert.equal(body.detail, "duplicate key")
  })
})
