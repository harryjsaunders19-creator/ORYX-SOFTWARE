import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  LOGICAL_BACKUP_VERSION,
  computeLogicalBackupChecksum,
} from "../../modules/backups/services/logical-export.ts"
import { logicalBackupPackSchema } from "../../modules/backups/services/logical-backup-schema.ts"

describe("logical backup pack contract", () => {
  it("accepts a valid v2 pack with checksum and no password hashes", () => {
    const draft = {
      kind: "oryx-logical-backup",
      version: LOGICAL_BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      source: "supabase",
      counts: { users: 0, clients: 0, jobs: 0, quotes: 0 },
      tables: { users: [], clients: [], jobs: [], quotes: [] },
    }
    const pack = {
      ...draft,
      checksumAlgorithm: "sha256",
      checksum: computeLogicalBackupChecksum(draft),
    }
    const parsed = logicalBackupPackSchema.safeParse(pack)
    assert.equal(parsed.success, true)
    assert.equal(pack.version, 2)
  })

  it("rejects Excel-shaped or empty payloads", () => {
    assert.equal(logicalBackupPackSchema.safeParse(null).success, false)
    assert.equal(logicalBackupPackSchema.safeParse({ version: 1 }).success, false)
    assert.equal(
      logicalBackupPackSchema.safeParse({ kind: "oryx-logical-backup", version: 1 }).success,
      false,
    )
  })

  it("detects checksum tampering", () => {
    const draft = {
      kind: "oryx-logical-backup",
      version: 2,
      exportedAt: "2026-01-01T00:00:00.000Z",
      source: "sqlite",
      counts: { users: 0, clients: 0, jobs: 0, quotes: 0 },
      tables: { users: [], clients: [], jobs: [], quotes: [] },
    }
    const good = computeLogicalBackupChecksum(draft)
    const bad = computeLogicalBackupChecksum({ ...draft, exportedAt: "tampered" })
    assert.notEqual(good, bad)
  })
})
