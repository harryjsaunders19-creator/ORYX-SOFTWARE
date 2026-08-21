import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const inspectorApi = readFileSync(join(__dirname, "../../modules/jobs/api/inspector.ts"), "utf8")
const inspectorUi = readFileSync(join(__dirname, "../../modules/jobs/components/jobs-inspector.tsx"), "utf8")
const registerUi = readFileSync(join(__dirname, "../../modules/jobs/components/jobs-register.tsx"), "utf8")
const routeFile = readFileSync(join(__dirname, "../../app/api/jobs/[id]/inspector/route.ts"), "utf8")

describe("jobs inspector bootstrap", () => {
  it("exposes GET /api/jobs/:id/inspector with jobs module auth", () => {
    assert.match(routeFile, /modules\/jobs\/api\/inspector/)
    assert.match(inspectorApi, /requireModuleAccess\("jobs"\)/)
    assert.match(inspectorApi, /jobId/)
    assert.match(inspectorApi, /revisions/)
    assert.match(inspectorApi, /documents/)
    assert.match(inspectorApi, /quotes/)
  })

  it("classic inspector uses a single bootstrap SWR key", () => {
    assert.match(inspectorUi, /\/api\/jobs\/\$\{project\.id\}\/inspector/)
    assert.doesNotMatch(
      inspectorUi,
      /!workItemsModel \? `\/api\/jobs\/\$\{project\.id\}\?include=parent,current`/,
    )
    assert.doesNotMatch(
      inspectorUi,
      /!workItemsModel \? `\/api\/jobs\/\$\{project\.id\}\/revisions`/,
    )
  })

  it("guards against Job A late response populating Job B", () => {
    assert.match(inspectorUi, /inspectorRaw\?\.jobId === project\.id/)
    assert.match(inspectorUi, /keepPreviousData: false/)
  })

  it("does not preload document blobs in bootstrap", () => {
    assert.doesNotMatch(inspectorApi, /storagePath|arrayBuffer|download/)
    assert.match(inspectorApi, /limit: 40/)
  })
})

describe("jobs designers SWR cache", () => {
  it("uses a longer client dedupe interval for designers", () => {
    assert.match(registerUi, /DESIGNERS_SWR/)
    assert.match(registerUi, /dedupingInterval: 60_000/)
  })
})
