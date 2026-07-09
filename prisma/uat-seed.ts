/**
 * prisma/uat-seed.ts — User Acceptance Testing dataset.
 *
 * Run with: npx tsx prisma/uat-seed.ts
 * Resets the database first (deletes prisma/oryx.db if present) so this is
 * always a clean, reproducible UAT environment.
 *
 * Deliberately uses jobDb/clientDb/quoteDb/holdDb/userDb directly rather than
 * raw SQL — every job's status progression goes through jobDb.update() in
 * the same sequence a real user clicking through the UI would produce, so
 * StatusHistory ends up with a genuine multi-step audit trail (not a single
 * "created already at this status" row), and every transition to ISSUED
 * fires the real automatic billing-handoff trigger exactly as it would in
 * production.
 */
/**
 * prisma/uat-seed.ts — User Acceptance Testing dataset.
 *
 * IMPORTANT: this script does NOT delete the existing database itself.
 * Static `import` statements execute before any other top-level code in the
 * file regardless of where they're textually written — so a self-deletion
 * call here would run *after* lib/db.ts's import has already opened a
 * connection to the old file, deleting it out from under that open handle
 * rather than before it's ever opened. (On Linux this doesn't error; it
 * silently unlinks the directory entry while the already-open fd keeps
 * writing to the now-nameless inode, and every row "successfully" written
 * vanishes the moment the process exits — this actually happened while
 * building this script, which is how the bug was caught.) Reset the
 * database as a separate step first, exactly like the existing
 * `npm run db:reset` script already does for the same reason:
 *
 *   rm -f prisma/oryx.db && npx tsx prisma/uat-seed.ts
 */
import { createId } from "@paralleldrive/cuid2"
import {
  jobDb, clientDb, quoteDb, holdDb, userDb, billingHandoffDb, sequenceDb, db,
} from "@/lib/db"
import { allocateDrawingNumber } from "@/lib/db"

/**
 * dateCreated is deliberately NOT exposed via CreateJobData — a real user
 * should never be able to claim a job was created on a different date than
 * it actually was; that's a system-set audit timestamp, not user input.
 * Backdating it for "long-running project" fixtures is a legitimate seed-
 * data need but not a legitimate app feature, so it's done here as a
 * narrowly-scoped raw write local to this script, never touching
 * lib/db.ts's public surface.
 */
function backdateCreation(jobId: string, daysAgoValue: number) {
  const backdated = daysAgo(daysAgoValue) + "T09:00:00.000Z"
  db.prepare('UPDATE Job SET dateCreated = ?, "createdAt" = ? WHERE id = ?').run(backdated, backdated, jobId)
  db.prepare('UPDATE StatusHistory SET changedAt = ? WHERE jobId = ? AND fromStatus IS NULL').run(backdated, jobId)
}

function daysAgo(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10)
}
function rand<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }
function randInt(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min }

function nextDrawingNumber(): string {
  return allocateDrawingNumber()
}
function nextRefNumber(prefix: string): string { return sequenceDb.nextRefNumber(prefix) }

console.log("🌱  Seeding UAT dataset…\n")

// ── Users ──────────────────────────────────────────────────────────
const ADMIN = userDb.create({ id: createId(), name: "Harry Voss", role: "ADMIN" })
const ACCOUNTS = userDb.create({ id: createId(), name: "Accounts Team", role: "ADMIN" })
userDb.create({ id: createId(), name: "Priya Shah", role: "ENGINEER" })
userDb.create({ id: createId(), name: "Tom O'Brien", role: "ENGINEER" })
userDb.create({ id: createId(), name: "Wei Zhang", role: "ENGINEER" })
userDb.create({ id: createId(), name: "Aoife Murphy", role: "ENGINEER" })
console.log("✓ 6 users (2 Admin, 4 Engineer)")

const DESIGNERS = ["Priya Shah", "Tom O'Brien", "Wei Zhang", "Aoife Murphy", "Marcus Olawale", "Jean-Luc Béranger"]

// ── Clients ──────────────────────────────────────────────────────
const REPEAT_CLIENT_NAMES = [
  "Crestwood Construction Ltd", "Northgate Builders", "Riverside Developments Ltd",
  "Pinnacle Group", "Hallmark Scaffolding Services",
]
const ONE_OFF_CLIENT_NAMES = [
  "Oakridge Property Co", "Sterling Build Co", "Avalon Estates", "Brightline Contractors",
  "Meridian Works Ltd", "Foundry Square Developments", "Granite Peak Construction",
  "Silverline Developments", "Eastgate Holdings", "Maple & Co Builders",
  "Bridgeview Builders Ltd", "Castlewood Property Group", "Thornton Developments",
  "Redwood Construction Group", "Kingsley Estates", "Ferndale Construction",
  "Whitcombe Property Services", "Birchwood Developments",
]

const clients: Record<string, ReturnType<typeof clientDb.create>> = {}
for (const name of REPEAT_CLIENT_NAMES) {
  clients[name] = clientDb.create({ id: createId(), name, contactName: rand(["Jane Doe", "Mark Ellison", "Sarah Connor", "David Okafor"]), email: "info@example.com", phone: "020 7946 0958" })
}
for (const name of ONE_OFF_CLIENT_NAMES) {
  clients[name] = clientDb.create({ id: createId(), name, contactName: rand(["", "Alex Carter", "Jordan Lee"]), email: rand(["", "contact@example.com"]) })
}

// Near-duplicate pair — visually similar, NOT the same normalized name, so
// both legitimately coexist; this is exactly the "is search/filter precise
// enough to tell these apart" edge case, not a duplicate-prevention test.
clients["Westfield Developments"] = clientDb.create({ id: createId(), name: "Westfield Developments", contactName: "Pat Reilly" })
clients["Westfield Development"]  = clientDb.create({ id: createId(), name: "Westfield Development", contactName: "Chris Adeyemi" })

// Long name
clients["__LONG__"] = clientDb.create({
  id: createId(),
  name: "Greater Manchester Regional Scaffold & Access Solutions (Holdings) Limited",
  contactName: "Operations Office",
})

// Hold-list client
clients["__HOLD__"] = clientDb.create({ id: createId(), name: "Bellweather Construction Group", contactName: "Finance Dept" })

// Archive-candidate client
clients["__ARCHIVE__"] = clientDb.create({ id: createId(), name: "Old Foundations Ltd", contactName: "Retired Office" })

// Diacritic client — reproduces a known real bug (SQLite's LIKE is only
// case-insensitive for ASCII; searching "MULLER" or "muller" without the
// umlaut finds nothing) found during an earlier QA audit of this app.
clients["__DIACRITIC__"] = clientDb.create({ id: createId(), name: "Müller Bau (UK) Ltd", contactName: "Hans Müller" })

console.log(`✓ ${Object.keys(clients).length} clients (5 repeat, 18 one-off, 1 near-duplicate pair, 1 long-name, 1 hold-candidate, 1 archive-candidate)`)

// ── Hold list: put Bellweather on hold ──────────────────────────────
holdDb.addHold({ clientId: clients["__HOLD__"].id, reason: "Overdue invoices — three unpaid past 60 days", addedBy: ACCOUNTS.name })
console.log("✓ Bellweather Construction Group placed on hold")

// ── Type of Works pools, split realistically ────────────────────
const RESIDENTIAL_WORKS = ["Access Scaffold", "Edge Protection", "Loading Bay", "Temporary Roof"]
const COMMERCIAL_WORKS  = ["Birdcage (Internal/External)", "Gantry", "Cantilevered Scaffold", "Hoist Tower / Lifting Frame", "Asbestos Enclosure"]

const RESIDENTIAL_ADDRESSES = [
  "14 Elm Close, Manchester, M20 3RT", "8 Birch Grove, Leeds, LS6 2QF", "22 Cedar Road, Bristol, BS5 9JN",
  "3 Maple Avenue, York, YO10 4PL", "61 Willow Drive, Sheffield, S10 2BN",
]
const COMMERCIAL_ADDRESSES = [
  "Unit 4, Trinity Trade Park, Birmingham, B6 7DY", "12-14 Quayside Business Centre, Newcastle, NE1 3DE",
  "Building C, Riverside Industrial Estate, Leeds, LS10 1AB", "The Old Mill, Wharf Road, Manchester, M4 5JD",
  "Plot 7, Western Distribution Park, Bristol, BS11 9YA",
]
const LONG_ADDRESS = "Unit 7B, Phase 2, Greater Manchester Regional Logistics and Distribution Park, Trafford Park Industrial Estate, Off Ashburton Road West, Trafford Park, Manchester, Greater Manchester, M17 1RW"

interface JobSpec {
  client: string; address: string; works: string; designer: string
  quoteValue: number | null; createdDaysAgo: number; requiredInDays: number | null
  notes: string | null; requestedBy: string
}

function makeSpec(opts: Partial<JobSpec> & { client: string }): JobSpec {
  const defaults: JobSpec = {
    client: opts.client,
    address: rand(RESIDENTIAL_ADDRESSES), works: rand(RESIDENTIAL_WORKS), designer: rand(DESIGNERS),
    quoteValue: randInt(300, 2000), createdDaysAgo: randInt(1, 60), requiredInDays: randInt(5, 30),
    notes: "Standard scope, no access restrictions.", requestedBy: "Site Manager",
  }
  // Merge key-by-key rather than via spread: opts may contain explicit
  // `undefined` for keys the caller deliberately didn't set (e.g.
  // `quoteValue: cond ? 0 : undefined`), and object spread does NOT skip
  // those — `{...defaults, ...{x: undefined}}` sets x to undefined, not the
  // default. That silently violated NOT NULL columns when undefined reached
  // jobDb.create() (better-sqlite3 binds JS undefined as NULL).
  const merged = { ...defaults } as JobSpec & Record<string, unknown>
  for (const [key, value] of Object.entries(opts)) {
    if (value !== undefined) merged[key] = value
  }
  return merged
}

function progressJob(id: string, steps: { status: string; changedBy: string; designer?: string }[]) {
  for (const step of steps) {
    const data: Parameters<typeof jobDb.update>[1] = { status: step.status, changedBy: step.changedBy }
    if (step.designer !== undefined) data.designer = step.designer
    jobDb.update(id, data)
  }
}

function createJob(spec: JobSpec, itemType = "DESIGN"): ReturnType<typeof jobDb.create> {
  const client = clients[spec.client]
  const drawingNumber = itemType === "DESIGN" ? nextDrawingNumber() : nextRefNumber(
    itemType === "SITE_VISIT" ? "SV" : itemType === "SURVEY" ? "SRV" : "INS"
  )
  return jobDb.create({
    id: createId(), drawingNumber, itemType, address: spec.address,
    typeOfWorks: itemType === "DESIGN" ? spec.works : "",
    clientCompany: client.name, clientId: client.id, requestedBy: spec.requestedBy,
    status: "NEW_REQUEST", designer: "", dateCompleted: null, notes: spec.notes,
    quoteValue: spec.quoteValue, requiredByDate: spec.requiredInDays != null ? daysAgo(-spec.requiredInDays) : null,
    changedBy: ADMIN.name,
  })
}

const stats = { newRequest: 0, inDesign: 0, checking: 0, issued: 0 }

// ── 15 New Request (stay here, no progression) ────────────────────
for (let i = 0; i < 15; i++) {
  const isLongRunning = i < 3
  const spec = makeSpec({
    client: rand([...REPEAT_CLIENT_NAMES, ...ONE_OFF_CLIENT_NAMES]),
    createdDaysAgo: isLongRunning ? randInt(200, 400) : randInt(1, 14),
    notes: i === 5 ? null : undefined,
    quoteValue: i === 6 ? null : undefined,
  })
  const job = createJob(spec)
  if (isLongRunning) backdateCreation(job.id, spec.createdDaysAgo)
  stats.newRequest++
}

// ── 20 In Progress ─────────────────────────────────────────────────
for (let i = 0; i < 20; i++) {
  const isCommercial = i % 3 === 0
  const isUrgent = i < 3
  const spec = makeSpec({
    client: rand([...REPEAT_CLIENT_NAMES, ...ONE_OFF_CLIENT_NAMES]),
    address: isCommercial ? rand(COMMERCIAL_ADDRESSES) : rand(RESIDENTIAL_ADDRESSES),
    works: isCommercial ? rand(COMMERCIAL_WORKS) : rand(RESIDENTIAL_WORKS),
    quoteValue: isCommercial ? randInt(50000, 500000) : randInt(300, 2000),
    requiredInDays: isUrgent ? randInt(-3, 2) : randInt(5, 45),
  })
  const job = createJob(spec)
  const d1 = rand(DESIGNERS)
  if (i < 3) {
    const d2 = rand(DESIGNERS.filter(d => d !== d1))
    progressJob(job.id, [
      { status: "IN_DESIGN", changedBy: ADMIN.name, designer: d1 },
      { status: "IN_DESIGN", changedBy: ADMIN.name, designer: d2 },
    ])
  } else {
    progressJob(job.id, [{ status: "IN_DESIGN", changedBy: ADMIN.name, designer: d1 }])
  }
  stats.inDesign++
}

// ── 10 Requires Checking ───────────────────────────────────────────
for (let i = 0; i < 10; i++) {
  const spec = makeSpec({ client: rand([...REPEAT_CLIENT_NAMES, ...ONE_OFF_CLIENT_NAMES]) })
  const job = createJob(spec)
  const designer = rand(DESIGNERS)
  progressJob(job.id, [
    { status: "IN_DESIGN", changedBy: ADMIN.name, designer },
    { status: "CHECKING", changedBy: designer },
  ])
  stats.checking++
}

// ── 15 Complete — 10 stay uncleared (Ready For Invoicing), 5 pre-cleared ──
const completedJobs: { job: ReturnType<typeof jobDb.create>; designer: string }[] = []
for (let i = 0; i < 15; i++) {
  const isHighValue = i < 5
  const isLowValue = i >= 5 && i < 8
  const spec = makeSpec({
    client: rand([...REPEAT_CLIENT_NAMES, ...ONE_OFF_CLIENT_NAMES, "Westfield Developments", "Westfield Development"]),
    address: i === 0 ? LONG_ADDRESS : undefined,
    quoteValue: isHighValue ? randInt(100000, 500000) : isLowValue ? randInt(0, 400) : randInt(2000, 20000),
    requestedBy: i === 7 ? "" : undefined,
  })
  const job = createJob(spec)
  const designer = rand(DESIGNERS)
  progressJob(job.id, [
    { status: "IN_DESIGN", changedBy: ADMIN.name, designer },
    { status: "CHECKING", changedBy: designer },
    { status: "ISSUED", changedBy: ADMIN.name },
  ])
  completedJobs.push({ job, designer })
  stats.issued++
}

const allCompletedHandoffs = completedJobs.map(c => billingHandoffDb.findBySourceJobId(c.job.id)!)
const batch = billingHandoffDb.createExportBatch({
  handoffIds: allCompletedHandoffs.slice(0, 5).map(h => h.id),
  exportedBy: ACCOUNTS.name,
  exportDate: daysAgo(3),
  notes: "UAT fixture — pre-cleared batch simulating prior accounts processing",
})
console.log("✓ 60 primary jobs seeded (15 New Request, 20 In Progress, 10 Requires Checking, 15 Complete)")
console.log(`✓ Pre-cleared 5 of 15 Complete jobs via batch ${batch.batch.batchNumber} — 10 remain uncleared (Ready For Invoicing)`)

// ── Revision testing ────────────────────────────────────────────────
function makeIssuedParent(label: string): ReturnType<typeof jobDb.create> {
  const spec = makeSpec({ client: rand(REPEAT_CLIENT_NAMES), notes: `Original job — ${label}` })
  const job = createJob(spec)
  const designer = rand(DESIGNERS)
  progressJob(job.id, [
    { status: "IN_DESIGN", changedBy: ADMIN.name, designer },
    { status: "CHECKING", changedBy: designer },
    { status: "ISSUED", changedBy: ADMIN.name },
  ])
  return job
}

function createRevision(parent: ReturnType<typeof jobDb.create>, letter: string): ReturnType<typeof jobDb.create> {
  return jobDb.create({
    id: createId(), drawingNumber: `${parent.drawingNumber} Rev ${letter}`, itemType: "REVISION",
    address: parent.address, typeOfWorks: parent.typeOfWorks, clientCompany: parent.clientCompany,
    clientId: parent.clientId, requestedBy: "Client request — post-issue change", status: "NEW_REQUEST",
    designer: "", dateCompleted: null, notes: "Revision requested after original issue.",
    parentJobId: parent.id, revisionLetter: letter, changedBy: ADMIN.name,
  })
}

for (let i = 0; i < 10; i++) {
  const parent = makeIssuedParent(`revision group A #${i + 1}`)
  const rev = createRevision(parent, "A")
  if (i % 2 === 0) progressJob(rev.id, [{ status: "IN_DESIGN", changedBy: rand(DESIGNERS), designer: rand(DESIGNERS) }])
}
console.log("✓ Revision Group A: 10 parents, 1 revision each")

for (let i = 0; i < 5; i++) {
  const parent = makeIssuedParent(`revision group B #${i + 1}`)
  createRevision(parent, "A")
  const revB = createRevision(parent, "B")
  progressJob(revB.id, [{ status: "IN_DESIGN", changedBy: rand(DESIGNERS), designer: rand(DESIGNERS) }])
}
console.log("✓ Revision Group B: 5 parents, 2 revisions each")

for (let i = 0; i < 2; i++) {
  const parent = makeIssuedParent(`revision group C #${i + 1}`)
  const rev = createRevision(parent, "A")
  const designer = rand(DESIGNERS)
  progressJob(rev.id, [
    { status: "IN_DESIGN", changedBy: ADMIN.name, designer },
    { status: "CHECKING", changedBy: designer },
    { status: "ISSUED", changedBy: ADMIN.name },
  ])
}
console.log("✓ Revision Group C: 2 parents with a COMPLETED revision (separate billable event)")

for (let i = 0; i < 2; i++) {
  const parent = makeIssuedParent(`revision group D #${i + 1}`)
  const rev = createRevision(parent, "A")
  progressJob(rev.id, [{ status: "IN_DESIGN", changedBy: rand(DESIGNERS), designer: rand(DESIGNERS) }])
}
console.log("✓ Revision Group D: 2 parents with a revision still IN PROGRESS")

// ── Site Visit / Survey / Inspection (non-Design item types) ───────
for (let i = 0; i < 3; i++) {
  const job = createJob(makeSpec({ client: rand(ONE_OFF_CLIENT_NAMES), works: "" }), "SITE_VISIT")
  if (i === 0) progressJob(job.id, [{ status: "ISSUED", changedBy: ADMIN.name, designer: rand(DESIGNERS) }])
}
createJob(makeSpec({ client: rand(ONE_OFF_CLIENT_NAMES), works: "" }), "SURVEY")
createJob(makeSpec({ client: rand(ONE_OFF_CLIENT_NAMES), works: "" }), "INSPECTION")
console.log("✓ 3 Site Visits, 1 Survey, 1 Inspection")

// ── Archive a client (after giving it one historical job) ──────────
const archiveJob = createJob(makeSpec({ client: "__ARCHIVE__", notes: "Historical job for an archived client" }))
progressJob(archiveJob.id, [
  { status: "IN_DESIGN", changedBy: ADMIN.name, designer: rand(DESIGNERS) },
  { status: "ISSUED", changedBy: ADMIN.name },
])
clientDb.update(clients["__ARCHIVE__"].id, { active: 0 })
console.log("✓ Old Foundations Ltd archived after one historical completed job")

// ── A job for the held client (to exercise the hold-warning banner) ─
createJob(makeSpec({ client: "__HOLD__", notes: "Created while client is on hold — exercises the warning banner" }))
console.log("✓ One job created for the on-hold client (Bellweather)")

// ── Diacritic fixtures — guaranteed, not left to random chance ──────
const diacriticJob = createJob(makeSpec({
  client: "__DIACRITIC__", address: "4 Schillerstraße Court, Leeds, LS3 1AA",
  notes: "Fixture for Unicode/diacritic search testing — see UAT plan.",
}))
progressJob(diacriticJob.id, [{ status: "IN_DESIGN", changedBy: ADMIN.name, designer: "Jean-Luc Béranger" }])
console.log("✓ One job guaranteed-assigned to Müller Bau (UK) Ltd / Jean-Luc Béranger for Unicode search testing")

// ── Quotes ───────────────────────────────────────────────────────
const QUOTE_STATUSES_PLAN: { status: string; count: number }[] = [
  { status: "DRAFT", count: 3 }, { status: "SENT", count: 5 },
  { status: "ACCEPTED", count: 4 }, { status: "REJECTED", count: 3 }, { status: "EXPIRED", count: 2 },
]
let convertedCount = 0
for (const { status, count } of QUOTE_STATUSES_PLAN) {
  for (let i = 0; i < count; i++) {
    const clientName = rand([...REPEAT_CLIENT_NAMES, ...ONE_OFF_CLIENT_NAMES])
    const quote = quoteDb.create({
      clientId: clients[clientName].id, clientCompany: clientName,
      contactName: rand(["", "Site Contact", "Jane Doe"]),
      address: rand(RESIDENTIAL_ADDRESSES.concat(COMMERCIAL_ADDRESSES)),
      description: rand(["Scaffold to rear elevation for re-roofing works.", "Birdcage scaffold internal, 3 storeys.", "Edge protection for new-build perimeter."]),
      quoteValue: randInt(500, 80000), quoteDate: daysAgo(randInt(5, 90)),
      expiryDate: daysAgo(randInt(-30, 60)), status, createdBy: ADMIN.name,
    })
    if (status === "ACCEPTED" && convertedCount < 2) {
      const job = jobDb.create({
        id: createId(), drawingNumber: nextDrawingNumber(), itemType: "DESIGN",
        address: quote.address, typeOfWorks: rand(RESIDENTIAL_WORKS),
        clientCompany: clientName, clientId: clients[clientName].id,
        requestedBy: quote.contactName || clientName, status: "NEW_REQUEST", designer: "",
        dateCompleted: null, notes: null, quoteValue: quote.quoteValue,
        quoteReference: quote.quoteNumber, quoteDate: quote.quoteDate, changedBy: ADMIN.name,
      })
      quoteDb.update(quote.id, { jobId: job.id })
      convertedCount++
    }
  }
}
console.log(`✓ ${QUOTE_STATUSES_PLAN.reduce((a, b) => a + b.count, 0)} quotes (2 ACCEPTED quotes converted to real jobs)`)

console.log("\n✅  UAT dataset seeded successfully.")
console.log(`   Total Job rows: ${jobDb.count({})}`)
console.log(`   Total Clients: ${Object.keys(clients).length}`)
console.log(`   Awaiting accounts action (Ready For Invoicing): ${billingHandoffDb.stats().awaitingCount}`)
console.log(`   Cleared: ${billingHandoffDb.stats().clearedCount}`)
