import { jobDb, sequenceDb, db } from "@/lib/db"
import { createId } from "@paralleldrive/cuid2"

async function main() {
  console.log("🌱  Seeding Oryx job tracker…")

  const existing = db.prepare("SELECT sequence FROM DrawingSequence WHERE yearMonth='2606'").get()
  if (!existing) {
    db.prepare("INSERT INTO DrawingSequence (id,yearMonth,sequence) VALUES (?,?,10)").run(createId(), "2606")
  }

  // Original jobs
  const originals = [
    { n: "001", address: "14 Clifton Road, Bristol, BS8 1AF",             works: "Temporary Roof",       client: "Bristol Scaffolding Ltd", by: "James Carter",    status: "IN_DESIGN",  designer: "Sarah Mitchell", notes: "Grade II listed — confirm heritage officer sign-off.", quote: 1850, quoteRef: "QT-2026-001", quoteDate: "2026-05-20" },
    { n: "002", address: "7 Whiteladies Road, Bristol, BS8 2QH",          works: "Façade Scaffold",      client: "Acme Access Ltd",         by: "Tom Briggs",      status: "CHECKING",   designer: "David Oryx",    notes: null, quote: 2400, quoteRef: "QT-2026-002", quoteDate: "2026-05-28" },
    { n: "003", address: "Unit 4, Avonmouth Industrial Estate, BS11 9YD", works: "Gantry & Loading Bay", client: "Portway Scaffolding",     by: "Helen Shaw",      status: "ISSUED",     designer: "Sarah Mitchell", notes: null,                              completed: "2026-06-08", quote: 3200, quoteRef: "QT-2026-003", quoteDate: "2026-05-15" },
    { n: "004", address: "23 Park Street, Bristol, BS1 5NP",              works: "Birdcage Scaffold",    client: "City Centre Scaff Ltd",   by: "Paul Hughes",     status: "IN_DESIGN",  designer: "David Oryx",    notes: "Awaiting structural drawings from SE." },
    { n: "005", address: "Royal Fort House, University of Bristol",        works: "Cantilever Platform",  client: "University Estates",      by: "Dr Fiona Price",  status: "NEW_REQUEST",designer: "",              notes: "Urgent — works window end of July." },
    { n: "006", address: "The Tobacco Factory, Raleigh Road, BS3 1TF",    works: "Tube & Fitting",       client: "Southville Access",       by: "Remi Okafor",    status: "ISSUED",     designer: "David Oryx",    notes: null,                              completed: "2026-06-02", quote: 1650, quoteRef: "QT-2026-006", quoteDate: "2026-05-10" },
    { n: "007", address: "St Nicholas Market, Corn Street, BS1 1HQ",      works: "Façade Scaffold",      client: "Bristol Heritage Scaff",  by: "Marcus Webb",    status: "NEW_REQUEST",designer: "",              notes: "Client confirmed via phone, awaiting brief." },
    { n: "008", address: "Cabot Circus, Merchant Street, Bristol, BS1 3BX",works: "System Scaffold",     client: "Cabot Access Ltd",        by: "Linda Tran",     status: "CHECKING",   designer: "Sarah Mitchell", notes: null },
  ]

  const jobIdMap: Record<string, string> = {}  // drawing number → job id

  let seeded = 0, skipped = 0
  for (const j of originals) {
    const dn = `26/ORYX/06/${j.n}`
    const existing = db.prepare("SELECT id FROM Job WHERE drawingNumber=?").get(dn) as { id: string } | undefined
    if (existing) {
      console.log(`  ↷  ${dn} already exists — skipped`)
      jobIdMap[dn] = existing.id
      skipped++; continue
    }
    const id = createId()
    const jAny = j as Record<string, unknown>
    jobDb.create({
      id, drawingNumber: dn,
      itemType: 'DESIGN',
      address: j.address, typeOfWorks: j.works,
      clientCompany: j.client, requestedBy: j.by,
      status: j.status, designer: j.designer,
      dateCompleted: "completed" in j ? (j.completed ?? null) : null,
      notes: j.notes,
      quoteValue:     "quote" in jAny     ? (jAny.quote     as number) : null,
      quoteReference: "quoteRef" in jAny  ? (jAny.quoteRef  as string) : null,
      quoteDate:      "quoteDate" in jAny ? (jAny.quoteDate as string) : null,
      commercialNotes: null,
      parentJobId: null, revisionLetter: null,
      changedBy: "Seed",
    })
    jobIdMap[dn] = id
    console.log(`  ✓  ${dn}${!j.designer ? " [unassigned]" : ""}`)
    seeded++
  }

  // Revisions — these are real Job rows linked to their parent
  const revisions = [
    { parentDn: "26/ORYX/06/001", letter: "A", designer: "", notes: "Client requested updated loading calculations and revised bay spacing.", status: "NEW_REQUEST" },
    { parentDn: "26/ORYX/06/003", letter: "A", designer: "David Oryx", notes: "Minor amendment — handrail detail updated.", status: "ISSUED", completed: "2026-06-14" },
    { parentDn: "26/ORYX/06/003", letter: "B", designer: "", notes: "Further client changes to eaves level.", status: "IN_DESIGN" },
  ]

  for (const r of revisions) {
    const parentId = jobIdMap[r.parentDn]
    if (!parentId) { console.log(`  ⚠  Parent ${r.parentDn} not found — skipping Rev ${r.letter}`); continue }
    const revDn = `${r.parentDn} Rev ${r.letter}`
    if (db.prepare("SELECT id FROM Job WHERE drawingNumber=?").get(revDn)) {
      console.log(`  ↷  ${revDn} already exists — skipped`); skipped++; continue
    }
    jobDb.create({
      id: createId(), drawingNumber: revDn,
      itemType: 'REVISION',
      address: originals.find(o => `26/ORYX/06/${o.n}` === r.parentDn)!.address,
      typeOfWorks: originals.find(o => `26/ORYX/06/${o.n}` === r.parentDn)!.works,
      clientCompany: originals.find(o => `26/ORYX/06/${o.n}` === r.parentDn)!.client,
      requestedBy: originals.find(o => `26/ORYX/06/${o.n}` === r.parentDn)!.by,
      status: r.status, designer: r.designer,
      dateCompleted: "completed" in r ? (r.completed ?? null) : null,
      notes: r.notes,
      parentJobId: parentId, revisionLetter: r.letter,
      changedBy: "Seed",
    })
    console.log(`  ✓  ${revDn} [revision]${!r.designer ? " [unassigned]" : ""}`)
    seeded++
  }

  // ── Non-design work items ──────────────────────────────────────────
  const nonDesignItems = [
    { type: 'SITE_VISIT', prefix: 'SV',  n: '2026-001', address: '14 Clifton Road, Bristol, BS8 1AF',              client: 'Bristol Scaffolding Ltd', by: 'James Carter',   status: 'ISSUED',     designer: 'Sarah Mitchell', quote: 250 },
    { type: 'SURVEY',     prefix: 'SRV', n: '2026-001', address: '7 Whiteladies Road, Bristol, BS8 2QH',            client: 'Acme Access Ltd',         by: 'Tom Briggs',     status: 'IN_DESIGN',  designer: 'David Oryx',    quote: 400 },
    { type: 'INSPECTION', prefix: 'INS', n: '2026-001', address: 'Unit 4, Avonmouth Industrial Estate, BS11 9YD',   client: 'Portway Scaffolding',     by: 'Helen Shaw',     status: 'NEW_REQUEST',designer: '',              quote: null },
  ]

  for (const item of nonDesignItems) {
    const dn = `${item.prefix}-${item.n}`
    if (db.prepare("SELECT id FROM Job WHERE drawingNumber=?").get(dn)) {
      console.log(`  ↷  ${dn} already exists — skipped`); skipped++; continue
    }
    jobDb.create({
      id: createId(), drawingNumber: dn,
      itemType: item.type,
      address: item.address, typeOfWorks: '',
      clientCompany: item.client, requestedBy: item.by,
      status: item.status, designer: item.designer,
      dateCompleted: null, notes: null,
      quoteValue: item.quote, quoteReference: null, quoteDate: null, commercialNotes: null,
      parentJobId: null, revisionLetter: null,
      changedBy: 'Seed',
    })
    console.log(`  ✓  ${dn} [${item.type.toLowerCase()}]`)
    seeded++
  }

  console.log(`\n✅  ${seeded} seeded, ${skipped} skipped`)
}

main().catch(e => { console.error("Seed failed:", e); process.exit(1) })
