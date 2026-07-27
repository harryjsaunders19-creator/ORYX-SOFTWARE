import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { buildApiKey } from "../../shared/hooks/use-api.ts"

describe("buildApiKey", () => {
  it("returns the path when params are omitted", () => {
    assert.equal(buildApiKey("/api/jobs"), "/api/jobs")
  })

  it("omits null, undefined, and empty string values", () => {
    assert.equal(
      buildApiKey("/api/password-vault", { search: "", sort: "asc", page: null, limit: undefined }),
      "/api/password-vault?sort=asc",
    )
  })

  it("serializes booleans and numbers", () => {
    assert.equal(
      buildApiKey("/api/jobs", { page: 2, onlyOriginals: true, archived: false }),
      "/api/jobs?page=2&onlyOriginals=true&archived=false",
    )
  })
})
