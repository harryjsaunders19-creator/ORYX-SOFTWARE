import { describe, it, beforeEach, afterEach } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { generateDownloadToken, verifyDownloadToken } = require("../../modules/backups/backup-token.ts")

describe("backup download token", () => {
  const originalSecret = process.env.BACKUP_DOWNLOAD_SECRET
  const originalNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    process.env.BACKUP_DOWNLOAD_SECRET = "test-secret-for-unit-tests"
    process.env.NODE_ENV = "test"
  })

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.BACKUP_DOWNLOAD_SECRET
    else process.env.BACKUP_DOWNLOAD_SECRET = originalSecret
    process.env.NODE_ENV = originalNodeEnv
  })

  it("verifies a freshly generated token", () => {
    const { token } = generateDownloadToken("backup-123", 600)
    assert.equal(verifyDownloadToken("backup-123", token), true)
  })

  it("rejects tokens for a different backup id", () => {
    const { token } = generateDownloadToken("backup-123", 600)
    assert.equal(verifyDownloadToken("backup-456", token), false)
  })

  it("rejects malformed tokens", () => {
    assert.equal(verifyDownloadToken("backup-123", "not-a-token"), false)
  })

  it("rejects expired tokens", () => {
    const { token } = generateDownloadToken("backup-123", -1)
    assert.equal(verifyDownloadToken("backup-123", token), false)
  })
})
