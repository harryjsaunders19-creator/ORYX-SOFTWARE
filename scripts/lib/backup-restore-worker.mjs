#!/usr/bin/env node
/**
 * Isolated SQLite worker for backup/restore integration tests.
 * Invoked in a subprocess with DB_PATH set — never touches .data/oryx.db.
 *
 * Commands: seed | export | import | counts | verify
 */
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

const cmd = process.argv[2]
const arg = process.argv[3]

if (!process.env.DB_PATH) {
  console.error("DB_PATH required")
  process.exit(1)
}

// Force SQLite-only routing for this worker.
delete process.env.SUPABASE_SERVICE_ROLE_KEY
delete process.env.SUPABASE_SECRET_KEY
delete process.env.NEXT_PUBLIC_SUPABASE_URL
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
delete process.env.FORCE_SUPABASE_ONLY
process.env.ALLOW_BOOTSTRAP_TEST_ACCOUNTS = "false"
process.env.NODE_ENV = "test"

const tsImport = (specifier) =>
  import(`${pathToFileURL(specifier).href}?t=${Date.now()}-${Math.random()}`)

/** Representative fixture IDs — stable across export/restore assertions. */
export const FIXTURE = {
  adminId: "br-admin-001",
  accountsId: "br-acct-001",
  engineerId: "br-eng-001",
  clientId: "br-client-001",
  parentJobId: "br-job-parent",
  revAId: "br-job-rev-a",
  revBId: "br-job-rev-b",
  archivedJobId: "br-job-archived",
  quoteId: "br-quote-001",
  parentDrawing: "ORY-BRT-0001",
  revADrawing: "ORY-BRT-0001 Rev A",
  revBDrawing: "ORY-BRT-0001 Rev B",
  archivedDrawing: "ORY-BRT-ARCH",
  quoteNumber: "Q-BRT-001",
}

async function loadDb() {
  await tsImport(new URL("../../lib/db/schema.ts", import.meta.url).pathname)
  return tsImport(new URL("../../lib/db/connection.ts", import.meta.url).pathname)
}

async function seed() {
  const { hashPassword } = await tsImport(
    new URL("../../shared/auth/password.ts", import.meta.url).pathname,
  )
  await loadDb()
  const { userService } = await tsImport(
    new URL("../../modules/users/services/user-service.ts", import.meta.url).pathname,
  )
  const { clientService } = await tsImport(
    new URL("../../modules/clients/services/client-service.ts", import.meta.url).pathname,
  )
  const { jobService } = await tsImport(
    new URL("../../modules/jobs/services/job-service.ts", import.meta.url).pathname,
  )
  const { quoteService } = await tsImport(
    new URL("../../modules/quotes/services/quote-service.ts", import.meta.url).pathname,
  )
  const { db } = await loadDb()
  const { holdDb } = await tsImport(
    new URL("../../lib/db/stores/hold.ts", import.meta.url).pathname,
  )
  const { createId } = await import("@paralleldrive/cuid2")

  const pw = hashPassword("BackupTest1")
  const now = new Date().toISOString()

  for (const u of [
    { id: FIXTURE.adminId, name: "Backup Admin", email: "backup-admin@example.com", role: "ADMIN" },
    { id: FIXTURE.accountsId, name: "Backup Accounts", email: "backup-accounts@example.com", role: "ACCOUNTS" },
    { id: FIXTURE.engineerId, name: "Backup Engineer", email: "backup-engineer@example.com", role: "ENGINEER" },
  ]) {
    await userService.create({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      passwordHash: pw,
      mustChangePassword: 0,
    })
  }

  await clientService.create({
    id: FIXTURE.clientId,
    name: "Backup Test Client",
    accountCode: "BRT-CLIENT",
    contactName: "Sam Client",
    email: "client@example.com",
  })

  await jobService.create({
    id: FIXTURE.parentJobId,
    drawingNumber: FIXTURE.parentDrawing,
    itemType: "DESIGN",
    address: "1 Backup Street",
    typeOfWorks: "Access Scaffold",
    clientCompany: "Backup Test Client",
    clientId: FIXTURE.clientId,
    requestedBy: "Backup Admin",
    status: "IN_DESIGN",
    designer: "Backup Engineer",
    quoteValue: 5000,
    changedBy: "Backup Seed",
  })

  await jobService.create({
    id: FIXTURE.revAId,
    drawingNumber: FIXTURE.revADrawing,
    itemType: "REVISION",
    address: "1 Backup Street",
    typeOfWorks: "Access Scaffold",
    clientCompany: "Backup Test Client",
    clientId: FIXTURE.clientId,
    requestedBy: "Backup Admin",
    status: "IN_DESIGN",
    designer: "Backup Engineer",
    parentJobId: FIXTURE.parentJobId,
    revisionLetter: "A",
    changedBy: "Backup Seed",
  })

  await jobService.create({
    id: FIXTURE.revBId,
    drawingNumber: FIXTURE.revBDrawing,
    itemType: "REVISION",
    address: "1 Backup Street",
    typeOfWorks: "Access Scaffold",
    clientCompany: "Backup Test Client",
    clientId: FIXTURE.clientId,
    requestedBy: "Backup Admin",
    status: "ISSUED",
    designer: "Backup Engineer",
    parentJobId: FIXTURE.parentJobId,
    revisionLetter: "B",
    quoteValue: 6200,
    billable: true,
    dateCompleted: "2026-01-15",
    changedBy: "Backup Seed",
  })

  await jobService.create({
    id: FIXTURE.archivedJobId,
    drawingNumber: FIXTURE.archivedDrawing,
    itemType: "DESIGN",
    address: "9 Archive Lane",
    typeOfWorks: "Other",
    clientCompany: "Backup Test Client",
    clientId: FIXTURE.clientId,
    requestedBy: "Backup Admin",
    status: "NEW_REQUEST",
    designer: "Backup Engineer",
    changedBy: "Backup Seed",
  })
  await jobService.archive(
    FIXTURE.archivedJobId,
    FIXTURE.adminId,
    "Backup Admin",
    "Client withdrew — backup fixture",
  )

  await quoteService.create({
    id: FIXTURE.quoteId,
    quoteNumber: FIXTURE.quoteNumber,
    clientId: FIXTURE.clientId,
    clientCompany: "Backup Test Client",
    address: "1 Backup Street",
    description: "Backup test quote",
    quoteValue: 6200,
    quoteDate: "2026-01-10",
    status: "ACCEPTED",
    createdBy: "Backup Admin",
  })

  db.prepare(`
    INSERT INTO QuoteLineItem (id, quoteId, description, amount, vatApplicable, sortOrder, createdAt)
    VALUES (?, ?, ?, ?, 1, 0, ?)
  `).run(createId(), FIXTURE.quoteId, "Design package", 6200, now)

  holdDb.addHold({
    clientId: FIXTURE.clientId,
    reason: "Backup fixture hold",
    addedBy: FIXTURE.adminId,
  })

  db.prepare(`
    INSERT INTO CalendarEvent (id, title, categoryId, startDate, endDate, allDay, description, createdBy, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
  `).run(
    createId(),
    "Backup site visit",
    "cat_site_visit",
    "2026-02-01",
    "2026-02-01",
    "Fixture calendar row",
    FIXTURE.adminId,
    now,
    now,
  )

  db.prepare(`
    INSERT INTO StatusHistory (id, jobId, fromStatus, toStatus, changedBy, changedAt, note)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(createId(), FIXTURE.parentJobId, "NEW_REQUEST", "IN_DESIGN", "Backup Seed", now, "Fixture history")

  console.log(JSON.stringify({ ok: true, fixture: FIXTURE }))
}

async function exportBackup(outPath) {
  await loadDb()
  const { buildLogicalBackupPack } = await tsImport(
    new URL("../../modules/backups/services/logical-export.ts", import.meta.url).pathname,
  )
  const pack = await buildLogicalBackupPack()
  fs.writeFileSync(outPath, JSON.stringify(pack, null, 2))
  console.log(JSON.stringify({ ok: true, path: outPath, counts: pack.counts }))
}

async function importBackup(inPath) {
  await loadDb()
  const raw = JSON.parse(fs.readFileSync(inPath, "utf8"))
  const { importLogicalBackupPack } = await tsImport(
    new URL("../../modules/backups/services/logical-import.ts", import.meta.url).pathname,
  )
  const result = await importLogicalBackupPack(raw)
  console.log(JSON.stringify({ ok: true, result }))
}

async function counts() {
  await loadDb()
  const { db } = await loadDb()
  const tables = ["User", "Client", "Job", "Quote", "QuoteLineItem", "ClientHold", "BillingHandoff", "ArchiveLog", "StatusHistory", "CalendarEvent"]
  const out = {}
  for (const t of tables) {
    try {
      out[t] = db.prepare(`SELECT COUNT(*) as n FROM "${t}"`).get().n
    } catch {
      out[t] = null
    }
  }
  console.log(JSON.stringify(out))
}

async function verify(expectedPath) {
  await loadDb()
  const expected = JSON.parse(fs.readFileSync(expectedPath, "utf8"))
  const { userService } = await tsImport(
    new URL("../../modules/users/services/user-service.ts", import.meta.url).pathname,
  )
  const { clientService } = await tsImport(
    new URL("../../modules/clients/services/client-service.ts", import.meta.url).pathname,
  )
  const { jobService } = await tsImport(
    new URL("../../modules/jobs/services/job-service.ts", import.meta.url).pathname,
  )
  const { quoteService } = await tsImport(
    new URL("../../modules/quotes/services/quote-service.ts", import.meta.url).pathname,
  )
  const { db } = await loadDb()

  const errors = []

  const users = await userService.findMany()
  const clients = await clientService.findManyWithMeta({ take: 500 })
  const jobs = await jobService.findMany({ take: 500 })
  const quotes = await quoteService.findMany({ take: 500 })

  if (users.length !== expected.counts.users) errors.push(`users count ${users.length} !== ${expected.counts.users}`)
  if (clients.length !== expected.counts.clients) errors.push(`clients count ${clients.length} !== ${expected.counts.clients}`)
  if (jobs.length !== expected.counts.jobs) errors.push(`jobs count ${jobs.length} !== ${expected.counts.jobs}`)
  if (quotes.length !== expected.counts.quotes) errors.push(`quotes count ${quotes.length} !== ${expected.counts.quotes}`)

  for (const u of users) {
    if ("passwordHash" in u && u.passwordHash) {
      // Restored users must have a hash but it must differ from any exported secret field.
      const exported = (expected.tables.users ?? []).find(e => e.id === u.id)
      if (exported && "passwordHash" in exported) {
        errors.push(`exported user ${u.id} must not contain passwordHash`)
      }
    }
  }

  const parent = jobs.find(j => j.id === FIXTURE.parentJobId)
  const revA = jobs.find(j => j.id === FIXTURE.revAId)
  const revB = jobs.find(j => j.id === FIXTURE.revBId)
  if (!parent) errors.push("parent job missing")
  if (!revA || revA.parentJobId !== FIXTURE.parentJobId) errors.push("revision A parent link invalid")
  if (!revB || revB.parentJobId !== FIXTURE.parentJobId) errors.push("revision B parent link invalid")

  const drawings = jobs.map(j => j.drawingNumber.toUpperCase())
  if (new Set(drawings).size !== drawings.length) errors.push("duplicate drawing numbers after restore")

  const quote = quotes.find(q => q.id === FIXTURE.quoteId)
  if (!quote || quote.clientId !== FIXTURE.clientId) errors.push("quote/client relationship invalid")

  const admin = users.find(u => u.id === FIXTURE.adminId && u.role === "ADMIN")
  const accounts = users.find(u => u.id === FIXTURE.accountsId && u.role === "ACCOUNTS")
  const engineer = users.find(u => u.id === FIXTURE.engineerId && u.role === "ENGINEER")
  if (!admin || !accounts || !engineer) errors.push("user roles incomplete after restore")

  if (errors.length) {
    console.error(JSON.stringify({ ok: false, errors }))
    process.exit(1)
  }
  console.log(JSON.stringify({ ok: true }))
}

try {
  if (cmd === "seed") await seed()
  else if (cmd === "export") await exportBackup(arg)
  else if (cmd === "import") await importBackup(arg)
  else if (cmd === "counts") await counts()
  else if (cmd === "verify") await verify(arg)
  else {
    console.error(`Unknown command: ${cmd}`)
    process.exit(1)
  }
} catch (err) {
  console.error(err instanceof Error ? err.stack ?? err.message : err)
  process.exit(1)
}
