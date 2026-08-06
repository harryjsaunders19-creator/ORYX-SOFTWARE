#!/usr/bin/env node
/**
 * End-to-end logical backup round-trip against isolated temporary SQLite databases.
 *
 * Usage: npm run test:backup-restore
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import {
  LOGICAL_BACKUP_VERSION,
  computeLogicalBackupChecksum,
} from "../modules/backups/services/logical-export.ts"
import { logicalBackupPackSchema } from "../modules/backups/services/logical-backup-schema.ts"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const worker = path.join(root, "scripts/lib/backup-restore-worker.mjs")

function runWorker(dbPath, command, extraArg) {
  const args = ["--import", "tsx", worker, command]
  if (extraArg) args.push(extraArg)
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env: {
      ...process.env,
      DB_PATH: dbPath,
      ALLOW_BOOTSTRAP_TEST_ACCOUNTS: "false",
      NODE_ENV: "test",
      SUPABASE_SERVICE_ROLE_KEY: "",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      FORCE_SUPABASE_ONLY: "",
    },
    encoding: "utf8",
  })
  if (result.status !== 0) {
    console.error(result.stdout)
    console.error(result.stderr)
    throw new Error(`worker ${command} failed for ${dbPath}`)
  }
  return result.stdout.trim()
}

function parseLastJson(stdout) {
  const lines = stdout.trim().split("\n").filter(Boolean)
  return JSON.parse(lines[lines.length - 1])
}

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

console.log("── Backup schema validation ──")
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

console.log("── Backup security validation ──")
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
const secretProbe = JSON.stringify(pack)
assert.equal(/passwordHash|service.?role|AUTH_SECRET/i.test(secretProbe), false)

console.log("── Full backup/restore round-trip validation ──")
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "oryx-backup-test-"))
const sourceDb = path.join(tmpDir, "source.db")
const targetDb = path.join(tmpDir, "target.db")
const rollbackDb = path.join(tmpDir, "rollback.db")
const backupPath = path.join(tmpDir, "backup.json")

try {
  runWorker(sourceDb, "seed")
  runWorker(sourceDb, "export", backupPath)

  const backup = JSON.parse(fs.readFileSync(backupPath, "utf8"))
  assert.equal(backup.version, LOGICAL_BACKUP_VERSION)
  assert.ok(backup.checksum, "export must include checksum")
  for (const row of backup.tables.users ?? []) {
    assert.equal("passwordHash" in row, false, "export must strip password hashes")
  }
  const checksumOk = computeLogicalBackupChecksum({
    kind: backup.kind,
    version: backup.version,
    exportedAt: backup.exportedAt,
    source: backup.source,
    counts: backup.counts,
    tables: backup.tables,
  })
  assert.equal(checksumOk, backup.checksum, "exported checksum must verify")

  // Restore into a clean database.
  fs.writeFileSync(targetDb, "")
  runWorker(targetDb, "import", backupPath)
  runWorker(targetDb, "verify", backupPath)

  // Malformed restore must fail with no partial data (rollback).
  fs.copyFileSync(sourceDb, rollbackDb)
  for (const suffix of ["-wal", "-shm"]) {
    if (fs.existsSync(sourceDb + suffix)) fs.copyFileSync(sourceDb + suffix, rollbackDb + suffix)
  }
  const before = parseLastJson(runWorker(rollbackDb, "counts"))
  const bad = { ...backup, checksum: "0".repeat(64) }
  const badPath = path.join(tmpDir, "bad.json")
  fs.writeFileSync(badPath, JSON.stringify(bad))
  const badResult = spawnSync(process.execPath, ["--import", "tsx", worker, "import", badPath], {
    cwd: root,
    env: {
      ...process.env,
      DB_PATH: rollbackDb,
      ALLOW_BOOTSTRAP_TEST_ACCOUNTS: "false",
      NODE_ENV: "test",
      SUPABASE_SERVICE_ROLE_KEY: "",
      NEXT_PUBLIC_SUPABASE_URL: "",
    },
    encoding: "utf8",
  })
  assert.notEqual(badResult.status, 0, "malformed restore must fail")
  const after = parseLastJson(runWorker(rollbackDb, "counts"))
  assert.deepEqual(after, before, "failed import must rollback to pre-import state")

  // Duplicate drawing numbers in one pack — second row updates first, no duplicate rows.
  const dupeDb = path.join(tmpDir, "dupe.db")
  fs.writeFileSync(dupeDb, "")
  const dupePack = structuredClone(backup)
  const dupeJob = structuredClone(dupePack.tables.jobs[0])
  dupeJob.id = "duplicate-id-should-update"
  dupeJob.clientCompany = "Changed Co"
  dupePack.tables.jobs.push(dupeJob)
  dupePack.counts.jobs = dupePack.tables.jobs.length
  dupePack.checksum = computeLogicalBackupChecksum({
    kind: dupePack.kind,
    version: dupePack.version,
    exportedAt: dupePack.exportedAt,
    source: dupePack.source,
    counts: dupePack.counts,
    tables: dupePack.tables,
  })
  const dupePath = path.join(tmpDir, "dupe.json")
  fs.writeFileSync(dupePath, JSON.stringify(dupePack))
  runWorker(dupeDb, "import", dupePath)
  const dupeCounts = parseLastJson(runWorker(dupeDb, "counts"))
  assert.equal(dupeCounts.Job, backup.counts.jobs, "duplicate drawing import must not create extra job rows")

  console.log(
    "test:backup-restore OK — schema v%s, security checks, round-trip, rollback, duplicate drawing",
    LOGICAL_BACKUP_VERSION,
  )
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true })
}
