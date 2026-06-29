/**
 * Generates fixtures/oryx-stress-test-export.xlsx — same sheet layout as
 * lib/global-export.ts (importable via Backups → Import or /api/import/excel).
 *
 * Usage: node scripts/generate-stress-test-export.mjs
 *        node scripts/generate-stress-test-export.mjs --clients=100 --jobs=1000 --quotes=200
 */
import ExcelJS from "exceljs"
import { mkdirSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, "..", "fixtures")
const OUT_FILE = join(OUT_DIR, "oryx-stress-test-export.xlsx")

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, "").split("=")
    return [k, v ?? "true"]
  }),
)
const CLIENT_COUNT = parseInt(args.clients ?? "50", 10)
const JOB_COUNT = parseInt(args.jobs ?? "200", 10)
const QUOTE_COUNT = parseInt(args.quotes ?? "50", 10)
const REVISION_RATIO = 0.08

const JOB_STATUSES = [
  { label: "New Request", weight: 12 },
  { label: "In Progress", weight: 28 },
  { label: "Requires Checking", weight: 14 },
  { label: "Ready to Send", weight: 11 },
  { label: "Complete", weight: 35 },
]

const ITEM_TYPES = [
  { label: "Design", weight: 72, prefix: "design" },
  { label: "Site Visit", weight: 10, prefix: "sv" },
  { label: "Survey", weight: 8, prefix: "srv" },
  { label: "Inspection", weight: 5, prefix: "ins" },
  { label: "Revision", weight: 5, prefix: "rev" },
]

const WORKS_TYPES = [
  "Access Scaffold", "Bridged Access", "Birdcage (Internal/External)",
  "Temporary Roof", "Loading Bay", "Freestanding Access", "Edge Protection",
  "Staircase / Tower", "Gantry", "Cantilevered Scaffold",
]

const QUOTE_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED"]

const DESIGNERS = ["Sarah Mitchell", "David Oryx", "Helen Shaw", "James Carter", "Remi Okafor"]
const REQUESTERS = ["James Carter", "Helen Shaw", "Site Manager", "Project Lead", "Accounts"]

const STREETS = [
  "Avonmouth Industrial Estate", "Raleigh Road", "Clifton Road", "Temple Way",
  "Harbourside", "Bedminster Parade", "Fishponds Road", "Gloucester Road",
  "Stokes Croft", "Whiteladies Road", "East Street", "North Street",
]

const COMPANY_PREFIXES = [
  "Bristol", "South West", "Avon", "Portway", "Clifton", "Bedminster",
  "Fishponds", "Temple", "Harbourside", "West Country",
]
const COMPANY_SUFFIXES = [
  "Scaffolding Ltd", "Access Solutions", "Construction", "Build Group",
  "Industrial Services", "Property Ltd", "Developments", "Contractors",
]

const GBP_FMT = '"£"#,##0.00'
const PCT_FMT = '0.00"%"'

function pickWeighted(items) {
  const total = items.reduce((s, i) => s + i.weight, 0)
  let r = Math.random() * total
  for (const item of items) {
    r -= item.weight
    if (r <= 0) return item
  }
  return items[items.length - 1]
}

function pad(n, len = 3) {
  return String(n).padStart(len, "0")
}

function fmtDate(d) {
  const dd = pad(d.getDate(), 2)
  const mm = pad(d.getMonth() + 1, 2)
  return `${dd}/${mm}/${d.getFullYear()}`
}

function fmtDateTime(iso) {
  const d = new Date(iso)
  return {
    date: fmtDate(d),
    time: `${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}`,
  }
}

function randomDate(daysBack, daysForward = 0) {
  const now = Date.now()
  const start = now - daysBack * 86400000
  const end = now + daysForward * 86400000
  return new Date(start + Math.random() * (end - start))
}

function styleHeader(sheet) {
  const row = sheet.getRow(1)
  row.font = { bold: true }
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0EFFE" } }
  row.eachCell(cell => {
    cell.border = { bottom: { style: "thin", color: { argb: "FFCCCCCC" } } }
  })
  row.commit()
}

function applyColFmt(sheet, col, fmt, rowCount) {
  for (let r = 2; r <= rowCount + 1; r++) {
    const cell = sheet.getRow(r).getCell(col)
    if (typeof cell.value === "number") cell.numFmt = fmt
  }
}

function buildClients() {
  const clients = []
  for (let i = 1; i <= CLIENT_COUNT; i++) {
    const prefix = COMPANY_PREFIXES[i % COMPANY_PREFIXES.length]
    const suffix = COMPANY_SUFFIXES[(i * 3) % COMPANY_SUFFIXES.length]
    const name = `${prefix} ${suffix}${i > COMPANY_PREFIXES.length ? ` ${i}` : ""}`
    const created = randomDate(400, 0)
    clients.push({
      name,
      accountCode: `CUST-${pad(i, 4)}`,
      contactName: `Contact ${i}`,
      phone: `0117 ${100 + (i % 900)} ${1000 + (i % 9000)}`,
      email: `contact${i}@example-${(i % 20) + 1}.co.uk`,
      billingAddress: `${10 + (i % 90)} ${STREETS[i % STREETS.length]}, Bristol, BS${(i % 9) + 1} ${pad(i % 100, 2)}${String.fromCharCode(65 + (i % 26))}`,
      notes: i % 7 === 0 ? "Preferred client — priority turnaround" : "",
      active: i % 17 === 0 ? "Archived" : "Active",
      added: fmtDate(created),
    })
  }
  return clients
}

function drawingNumberFor(type, seq, year, month, revisionLetter = null) {
  if (type.prefix === "design" || type.prefix === "rev") {
    const base = `${String(year).slice(2)}/ORYX/${pad(month, 2)}/${pad(seq, 3)}`
    return revisionLetter ? `${base}-${revisionLetter}` : base
  }
  if (type.prefix === "sv") return `SV-${year}-${pad(seq, 3)}`
  if (type.prefix === "srv") return `SRV-${year}-${pad(seq, 3)}`
  if (type.prefix === "ins") return `INS-${year}-${pad(seq, 3)}`
  return `${String(year).slice(2)}/ORYX/${pad(month, 2)}/${pad(seq, 3)}`
}

function buildJobs(clients) {
  const jobs = []
  const designParents = []
  const year = new Date().getFullYear()
  const month = new Date().getMonth() + 1
  let designSeq = 0
  let svSeq = 0
  let srvSeq = 0
  let insSeq = 0

  const targetRevisions = Math.floor(JOB_COUNT * REVISION_RATIO)
  let revisionsLeft = targetRevisions
  const mainJobCount = JOB_COUNT - targetRevisions

  for (let i = 0; i < mainJobCount; i++) {
    const client = clients[i % clients.length]
    let type = pickWeighted(ITEM_TYPES.filter(t => t.prefix !== "rev"))
    if (type.prefix === "design") designSeq++
    else if (type.prefix === "sv") svSeq++
    else if (type.prefix === "srv") srvSeq++
    else if (type.prefix === "ins") insSeq++

    const seq = type.prefix === "design" ? designSeq
      : type.prefix === "sv" ? svSeq
      : type.prefix === "srv" ? srvSeq
      : insSeq

    const drawingNumber = drawingNumberFor(type, seq, year, month)
    const status = pickWeighted(JOB_STATUSES).label
    const created = randomDate(180, 30)
    const requiredBy = randomDate(-60, 90)
    const completed = status === "Complete" ? randomDate(30, 0) : null
    const quoteValue = 800 + Math.floor(Math.random() * 9200)

    const job = {
      drawingNumber,
      itemType: type.label,
      address: `${20 + (i % 80)} ${STREETS[i % STREETS.length]}, Bristol, BS${(i % 9) + 1} ${pad(i % 100, 2)}AB`,
      typeOfWorks: WORKS_TYPES[i % WORKS_TYPES.length],
      client: client.name,
      customerId: client.accountCode,
      requestedBy: REQUESTERS[i % REQUESTERS.length],
      status,
      designer: DESIGNERS[i % DESIGNERS.length],
      quoteValue,
      variationFees: i % 9 === 0 ? Math.round(quoteValue * 0.05) : "",
      quoteReference: i % 3 === 0 ? `QT-${year}-${pad(i % 500, 3)}` : "",
      dateCreated: fmtDate(created),
      requiredBy: fmtDate(requiredBy),
      dateCompleted: completed ? fmtDate(completed) : "",
      lastUpdated: fmtDate(randomDate(14, 0)),
      notes: i % 11 === 0 ? "Client requested expedited delivery" : "",
    }
    jobs.push(job)

    if (type.prefix === "design" && revisionsLeft > 0 && i % 12 === 0) {
      designParents.push(drawingNumber)
      revisionsLeft--
    }
  }

  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  for (let r = 0; r < targetRevisions; r++) {
    const parent = designParents[r % designParents.length] ?? jobs[r % jobs.length].drawingNumber
    const client = clients[r % clients.length]
    const status = pickWeighted(JOB_STATUSES).label
    const created = randomDate(90, 14)
    const quoteValue = 400 + Math.floor(Math.random() * 3000)
    jobs.push({
      drawingNumber: `${parent}-${letters[r % letters.length]}`,
      itemType: "Revision",
      address: jobs.find(j => j.drawingNumber === parent)?.address ?? `${15} ${STREETS[0]}, Bristol`,
      typeOfWorks: WORKS_TYPES[r % WORKS_TYPES.length],
      client: client.name,
      customerId: client.accountCode,
      requestedBy: REQUESTERS[r % REQUESTERS.length],
      status,
      designer: DESIGNERS[r % DESIGNERS.length],
      quoteValue,
      variationFees: "",
      quoteReference: `QT-${year}-R${pad(r, 3)}`,
      dateCreated: fmtDate(created),
      requiredBy: fmtDate(randomDate(0, 45)),
      dateCompleted: status === "Complete" ? fmtDate(randomDate(20, 0)) : "",
      lastUpdated: fmtDate(randomDate(7, 0)),
      notes: "Revision to parent drawing",
    })
  }

  return jobs
}

function buildQuotes(clients) {
  const quotes = []
  const year = new Date().getFullYear()
  for (let i = 1; i <= QUOTE_COUNT; i++) {
    const client = clients[i % clients.length]
    const quoteDate = randomDate(120, 0)
    const expiry = new Date(quoteDate.getTime() + 30 * 86400000)
    quotes.push({
      quoteNumber: `QT-${year}-${pad(i, 4)}`,
      status: QUOTE_STATUSES[i % QUOTE_STATUSES.length],
      client: client.name,
      contact: client.contactName,
      address: client.billingAddress,
      description: `${WORKS_TYPES[i % WORKS_TYPES.length]} — design & calculations`,
      quoteValue: 500 + Math.floor(Math.random() * 15000),
      vatRate: 20,
      quoteDate: fmtDate(quoteDate),
      expiryDate: fmtDate(expiry),
      createdBy: DESIGNERS[i % DESIGNERS.length],
      notes: i % 8 === 0 ? "Awaiting client sign-off" : "",
    })
  }
  return quotes
}

function buildInvoicingQueue(jobs) {
  return jobs
    .filter(j => j.status === "Complete")
    .slice(0, Math.min(80, Math.floor(jobs.length * 0.12)))
    .map(j => ({
      drawingNumber: j.drawingNumber,
      type: j.itemType === "Revision" ? "Revision" : "Job",
      client: j.client,
      address: j.address,
      designer: j.designer,
      quoteValue: j.quoteValue,
      quoteReference: j.quoteReference,
      completionDate: j.dateCompleted || j.lastUpdated,
      addedToQueue: j.lastUpdated,
    }))
}

function buildCalendar(jobs, clients) {
  const events = []
  for (let i = 0; i < 40; i++) {
    const job = jobs[i * 7 % jobs.length]
    const client = clients[i % clients.length]
    const start = randomDate(-14, 75)
    const end = new Date(start.getTime() + (2 + (i % 4)) * 3600000)
    const dt = fmtDateTime(start.toISOString())
    const endDt = fmtDateTime(end.toISOString())
    events.push({
      eventType: i % 3 === 0 ? "Teams Meeting" : "Site Visit",
      title: i % 3 === 0 ? `Client review — ${client.name}` : `Site visit — ${job.address.slice(0, 30)}`,
      date: dt.date,
      startTime: dt.time,
      endTime: endDt.time,
      location: job.address,
      staff: DESIGNERS[i % DESIGNERS.length],
      jobNumber: job.drawingNumber,
      client: client.name,
      notes: "",
    })
  }
  return events
}

function buildStatusHistory(jobs) {
  const history = []
  const statusFlow = ["New Request", "In Progress", "Requires Checking", "Ready to Send", "Complete"]
  for (let i = 0; i < Math.min(200, jobs.length); i++) {
    const job = jobs[i]
    const idx = statusFlow.indexOf(job.status)
    if (idx < 0) continue
    const at = randomDate(60, 0)
    const dt = fmtDateTime(at.toISOString())
    history.push({
      drawingNumber: job.drawingNumber,
      date: dt.date,
      time: dt.time,
      changedBy: DESIGNERS[i % DESIGNERS.length],
      fromStatus: idx > 0 ? statusFlow[idx - 1] : "",
      toStatus: statusFlow[idx],
      note: idx === statusFlow.length - 1 ? "Marked complete" : "Status updated",
    })
  }
  return history
}

async function main() {
  console.log(`Generating stress-test export: ${CLIENT_COUNT} clients, ${JOB_COUNT} jobs, ${QUOTE_COUNT} quotes…`)

  const clients = buildClients()
  const jobs = buildJobs(clients)
  const quotes = buildQuotes(clients)
  const handoffs = buildInvoicingQueue(jobs)
  const calendar = buildCalendar(jobs, clients)
  const history = buildStatusHistory(jobs)

  const wb = new ExcelJS.Workbook()
  wb.created = new Date()
  wb.modified = new Date()

  const jobSheet = wb.addWorksheet("Jobs")
  jobSheet.columns = Array(17).fill({ width: 18 })
  jobSheet.getColumn(3).width = 35
  jobSheet.getColumn(5).width = 28
  jobSheet.addRow([
    "Drawing Number", "Item Type", "Site Address", "Type of Works",
    "Client", "Customer ID", "Requested By", "Status", "Designer",
    "Quote Value (£)", "Variation Fees (£)", "Quote Reference",
    "Date Created", "Required By", "Date Completed", "Last Updated", "Notes",
  ])
  styleHeader(jobSheet)
  for (const j of jobs) {
    jobSheet.addRow([
      j.drawingNumber, j.itemType, j.address, j.typeOfWorks,
      j.client, j.customerId, j.requestedBy, j.status, j.designer,
      j.quoteValue, j.variationFees, j.quoteReference,
      j.dateCreated, j.requiredBy, j.dateCompleted, j.lastUpdated, j.notes,
    ])
  }
  applyColFmt(jobSheet, 10, GBP_FMT, jobs.length)
  applyColFmt(jobSheet, 11, GBP_FMT, jobs.length)

  const clientSheet = wb.addWorksheet("Clients")
  clientSheet.columns = Array(9).fill({ width: 22 })
  clientSheet.addRow([
    "Company Name", "Customer ID", "Main Contact", "Phone",
    "Email", "Billing Address", "Notes", "Status", "Added",
  ])
  styleHeader(clientSheet)
  for (const c of clients) {
    clientSheet.addRow([
      c.name, c.accountCode, c.contactName, c.phone,
      c.email, c.billingAddress, c.notes, c.active, c.added,
    ])
  }

  const quoteSheet = wb.addWorksheet("Quotes")
  quoteSheet.columns = Array(12).fill({ width: 18 })
  quoteSheet.addRow([
    "Quote Number", "Status", "Client", "Contact",
    "Site Address", "Description", "Quote Value (£)", "VAT Rate (%)",
    "Quote Date", "Expiry Date", "Created By", "Notes",
  ])
  styleHeader(quoteSheet)
  for (const q of quotes) {
    quoteSheet.addRow([
      q.quoteNumber, q.status, q.client, q.contact,
      q.address, q.description, q.quoteValue, q.vatRate,
      q.quoteDate, q.expiryDate, q.createdBy, q.notes,
    ])
  }
  applyColFmt(quoteSheet, 7, GBP_FMT, quotes.length)
  applyColFmt(quoteSheet, 8, PCT_FMT, quotes.length)

  const invSheet = wb.addWorksheet("Invoicing Queue")
  invSheet.addRow([
    "Drawing Number", "Type", "Client", "Site Address", "Designer",
    "Quote Value (£)", "Quote Reference", "Completion Date", "Added to Queue",
  ])
  styleHeader(invSheet)
  for (const h of handoffs) {
    invSheet.addRow([
      h.drawingNumber, h.type, h.client, h.address, h.designer,
      h.quoteValue, h.quoteReference, h.completionDate, h.addedToQueue,
    ])
  }
  applyColFmt(invSheet, 6, GBP_FMT, handoffs.length)

  const calSheet = wb.addWorksheet("Calendar")
  calSheet.addRow([
    "Event Type", "Title", "Date", "Start Time", "End Time",
    "Location", "Assigned Staff", "Job Number", "Client", "Notes",
  ])
  styleHeader(calSheet)
  for (const e of calendar) {
    calSheet.addRow([
      e.eventType, e.title, e.date, e.startTime, e.endTime,
      e.location, e.staff, e.jobNumber, e.client, e.notes,
    ])
  }

  const histSheet = wb.addWorksheet("Status History")
  histSheet.addRow([
    "Drawing Number", "Date", "Time", "Changed By",
    "From Status", "To Status", "Note",
  ])
  styleHeader(histSheet)
  for (const h of history) {
    histSheet.addRow([
      h.drawingNumber, h.date, h.time, h.changedBy,
      h.fromStatus, h.toStatus, h.note,
    ])
  }

  const userSheet = wb.addWorksheet("Users")
  userSheet.addRow(["Name", "Email", "Role", "Status", "Account Created"])
  styleHeader(userSheet)
  userSheet.addRow(["Admin User", "admin@test.com", "ADMIN", "Active", fmtDate(new Date())])
  userSheet.addRow(["Engineer One", "engineer@test.com", "ENGINEER", "Active", fmtDate(randomDate(200, 0))])

  mkdirSync(OUT_DIR, { recursive: true })
  const buffer = await wb.xlsx.writeBuffer()
  writeFileSync(OUT_FILE, Buffer.from(buffer))

  console.log(`Written: ${OUT_FILE}`)
  console.log(`  Clients: ${clients.length}`)
  console.log(`  Jobs:    ${jobs.length}`)
  console.log(`  Quotes:  ${quotes.length}`)
  console.log(`  Invoicing queue rows: ${handoffs.length} (display only — not re-imported)`)
  console.log("")
  console.log("Import via: Backups page → Import, or POST /api/import/excel")
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
