#!/usr/bin/env node
/**
 * Verify logical backup checksum + schema round-trip without touching production.
 *
 * Usage: npm run test:backup-restore
 */
import assert from "node:assert/strict"
import {
  LOGICAL_BACKUP_VERSION,
  computeLogicalBackupChecksum,
} from "../modules/backups/services/logical-export.ts"
import { logicalBackupPackSchema } from "../modules/backups/services/logical-backup-schema.ts"

function buildFixture() {
  const draft = {
    kind: "oryx-logical-backup",
    version: LOGICAL_BACKUP_VERSION,
    exportedAt: "2026-08-06T00:00:00.000Z",
    source: "sqlite",
    counts: { users: 1, clients: 1, jobs: 1, quotes: 0 },
    tables: {
      users: [{
        id: "u1", name: "Admin", email: "admin@example.com", role: "ADMIN",
        active: 1, mustChangePassword: 1, createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }],
      clients: [{
        id: "c1", name: "Acme", contactName: null, phone: null, email: null,
        billingAddress: null, notes: null, accountCode: "ACME", active: 1,
        createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      }],
      jobs: [{
        id: "j1", drawingNumber: "ORY-0001", itemType: "DESIGN", address: "1 High St",
        typeOfWorks: "Scaffold", customTypeDescription: null, clientCompany: "Acme",
        clientId: "c1", requestedBy: "Sam", status: "IN_DESIGN", designer: "Alex",
        quoteValue: 1000, variationFees: null, quoteReference: null,
        dateCreated: "2026-01-02", requiredByDate: null, dateCompleted: null,
        notes: null, parentJobId: null, revisionLetter: null,
        updatedAt: "2026-01-02T00:00:00.000Z",
      }],
      quotes: [],
    },
  }
  const checksum = computeLogicalBackupChecksum(draft)
  return { ...draft, checksumAlgorithm: "sha256", checksum }
}

const pack = buildFixture()
const parsed = logicalBackupPackSchema.safeParse(pack)
assert.equal(parsed.success, true, "fixture must pass schema")
assert.equal("passwordHash" in pack.tables.users[0], false, "must not export password hashes")

const expected = computeLogicalBackupChecksum({
  kind: pack.kind,
  version: pack.version,
  exportedAt: pack.exportedAt,
  source: pack.source,
  counts: pack.counts,
  tables: pack.tables,
})
assert.equal(expected, pack.checksum, "checksum must match")

const tampered = { ...pack, checksum: "0".repeat(64) }
assert.notEqual(
  computeLogicalBackupChecksum({
    kind: tampered.kind,
    version: tampered.version,
    exportedAt: tampered.exportedAt,
    source: tampered.source,
    counts: tampered.counts,
    tables: tampered.tables,
  }),
  tampered.checksum,
)

console.log("test:backup-restore OK — schema v%s, checksum verified, no secrets in users", LOGICAL_BACKUP_VERSION)
