/**
 * lib/db.ts — SQLite database layer via better-sqlite3.
 *
 * Tables:
 *   Job            — jobs and revisions (revisions have parentJobId set)
 *   DrawingSequence — auto-increment per YYMM for drawing numbers
 *   StatusHistory  — audit log of status transitions + notes
 *   BillingHandoff — one row per billable completion event (a Job reaching
 *                    ISSUED); the "Ready For Invoicing" handoff queue for
 *                    accounts. Replaces the Invoice/ExportBatch workflow
 *                    below — see PROJECT_OVERVIEW.md §19.
 *   Invoice, InvoiceItem, InvoiceSequence, ExportBatch, ExportBatchItem
 *                  — DEPRECATED. Kept only so existing historical data
 *                    isn't destroyed; nothing writes to these anymore.
 */

import Database from "better-sqlite3"
import path from "path"
import fs from "fs"
import { classifyLegacyWorksType } from "@/lib/works-type-migration"
import { WORKS_TYPES } from "@/lib/constants"
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { nanoid } = require("nanoid") as { nanoid: () => string }

// Default path is .data/ instead of prisma/ — Turbopack scans the entire
// project directory and chokes on SQLite's WAL lock files (.db-shm/.db-wal)
// when they're inside the project tree. .data/ is gitignored and outside
// the content paths Turbopack cares about. If upgrading from a prisma/
// location, the migration below moves the file automatically.
const DB_DIR  = process.env.DB_PATH
  ? path.dirname(process.env.DB_PATH)
  : path.join(/* turbopackIgnore: true */ process.cwd(), ".data")
const DB_PATH = process.env.DB_PATH ?? path.join(DB_DIR, "oryx.db")
const DB_EXISTED = fs.existsSync(DB_PATH)
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
console.log(`[db] DB_PATH=${DB_PATH} | existed=${DB_EXISTED} | DB_PATH env=${process.env.DB_PATH ?? "(not set)"}`)

// Auto-migrate: move database from old prisma/ location to new .data/ location
if (!process.env.DB_PATH) {
  const oldPath = path.join(/* turbopackIgnore: true */ process.cwd(), "prisma", "oryx.db")
  if (fs.existsSync(oldPath) && !fs.existsSync(DB_PATH)) {
    for (const suffix of ["", "-shm", "-wal"]) {
      const src = oldPath + suffix
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, DB_PATH + suffix)
      }
    }
    console.log(`[db] Migrated database from prisma/oryx.db to .data/oryx.db`)
  }
}

function openDb(): InstanceType<typeof Database> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const conn = new Database(DB_PATH)
      conn.pragma("journal_mode = WAL")
      conn.pragma("foreign_keys = ON")
      conn.pragma("busy_timeout = 10000")
      conn.pragma("synchronous  = NORMAL")
      return conn
    } catch (err: unknown) {
      if (attempt < 4 && err instanceof Error && err.message.includes("locked")) {
        const ms = 1000 * (attempt + 1)
        console.log(`[db] Database locked, retrying in ${ms}ms (attempt ${attempt + 1}/5)`)
        const start = Date.now(); while (Date.now() - start < ms) { /* busy wait — no async in module init */ }
        continue
      }
      throw err
    }
  }
  throw new Error("Failed to open database after 5 attempts")
}
const db = openDb()

// ── Schema ─────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS Job (
    id              TEXT PRIMARY KEY,
    drawingNumber   TEXT UNIQUE NOT NULL,
    itemType        TEXT NOT NULL DEFAULT 'DESIGN',
    address         TEXT NOT NULL,
    typeOfWorks     TEXT NOT NULL,
    clientCompany   TEXT NOT NULL,
    requestedBy     TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'NEW_REQUEST',
    designer        TEXT NOT NULL DEFAULT '',
    dateCreated     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    dateCompleted   TEXT,
    notes           TEXT,
    parentJobId     TEXT REFERENCES Job(id) ON DELETE SET NULL,
    revisionLetter  TEXT,
    quoteValue      REAL,
    quoteReference  TEXT,
    quoteDate       TEXT,
    commercialNotes TEXT,
    invoiceId       TEXT,
    billingStatus   TEXT,
    billingBatchId  TEXT,
    requestedDate   TEXT,
    requiredByDate  TEXT,
    createdAt       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updatedAt       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE INDEX IF NOT EXISTS idx_job_status    ON Job(status);
  CREATE INDEX IF NOT EXISTS idx_job_client    ON Job(clientCompany);
  CREATE INDEX IF NOT EXISTS idx_job_designer  ON Job(designer);
  CREATE INDEX IF NOT EXISTS idx_job_created   ON Job(createdAt);
  CREATE TABLE IF NOT EXISTS DrawingSequence (
    id        TEXT PRIMARY KEY,
    yearMonth TEXT UNIQUE NOT NULL,
    sequence  INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS StatusHistory (
    id         TEXT PRIMARY KEY,
    jobId      TEXT NOT NULL REFERENCES Job(id) ON DELETE CASCADE,
    fromStatus TEXT,
    toStatus   TEXT NOT NULL,
    changedBy  TEXT NOT NULL DEFAULT 'System',
    changedAt  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    note       TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_history_job     ON StatusHistory(jobId);
  CREATE INDEX IF NOT EXISTS idx_history_changed ON StatusHistory(changedAt);

  -- Permanent audit trail for the controlled Type of Works migration (see
  -- migrateTypeOfWorksValues() below and PROJECT_OVERVIEW.md §22). One row
  -- per job whose typeOfWorks value needed remapping when the controlled
  -- list was introduced — never deleted or modified afterward, same
  -- philosophy as StatusHistory/ExportBatch/ClientHold. This is the actual,
  -- queryable record of "what got mapped to what" — not just a console log.
  CREATE TABLE IF NOT EXISTS TypeOfWorksMigrationLog (
    id                TEXT PRIMARY KEY,
    jobId             TEXT NOT NULL REFERENCES Job(id),
    drawingNumber     TEXT NOT NULL,
    originalValue     TEXT NOT NULL,
    mappedTo          TEXT NOT NULL,
    customDescription TEXT,
    matchType         TEXT NOT NULL,   -- EXACT | ALIAS | FLAGGED
    needsReview       INTEGER NOT NULL DEFAULT 0,
    reviewedAt        TEXT,
    reviewedBy        TEXT,
    migratedAt        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE INDEX IF NOT EXISTS idx_towml_job    ON TypeOfWorksMigrationLog(jobId);
  CREATE INDEX IF NOT EXISTS idx_towml_review ON TypeOfWorksMigrationLog(needsReview);

  -- ── DEPRECATED ──────────────────────────────────────────────────
  -- Invoice / InvoiceItem / InvoiceSequence / ExportBatch / ExportBatchItem
  -- (below, through line ~153) are no longer written to or read from
  -- anywhere in the app. The business decided to stop managing invoicing
  -- internally — see PROJECT_OVERVIEW.md §19. These tables are kept
  -- in place rather than dropped, purely so any historical data already in
  -- a deployed database isn't destroyed; nothing in the current codebase
  -- creates new rows here. BillingHandoff (below) is the replacement.
  CREATE TABLE IF NOT EXISTS Invoice (
    id            TEXT PRIMARY KEY,
    invoiceNumber TEXT UNIQUE NOT NULL,
    invoiceDate   TEXT NOT NULL,
    invoiceValue  REAL NOT NULL DEFAULT 0,
    clientCompany TEXT NOT NULL,
    paymentStatus TEXT NOT NULL DEFAULT 'DRAFT',
    notes         TEXT,
    createdBy     TEXT NOT NULL DEFAULT 'System',
    createdAt     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updatedAt     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    sentAt        TEXT,
    paidAt        TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_invoice_client  ON Invoice(clientCompany);
  CREATE INDEX IF NOT EXISTS idx_invoice_status  ON Invoice(paymentStatus);
  CREATE INDEX IF NOT EXISTS idx_invoice_date    ON Invoice(invoiceDate);

  CREATE TABLE IF NOT EXISTS InvoiceItem (
    id            TEXT PRIMARY KEY,
    invoiceId     TEXT NOT NULL REFERENCES Invoice(id) ON DELETE CASCADE,
    jobId         TEXT NOT NULL REFERENCES Job(id) ON DELETE CASCADE,
    drawingNumber TEXT NOT NULL,
    description   TEXT,
    value         REAL NOT NULL DEFAULT 0,
    UNIQUE(invoiceId, jobId)
  );

  CREATE INDEX IF NOT EXISTS idx_item_invoice ON InvoiceItem(invoiceId);
  CREATE INDEX IF NOT EXISTS idx_item_job     ON InvoiceItem(jobId);

  CREATE TABLE IF NOT EXISTS InvoiceSequence (
    id   TEXT PRIMARY KEY,
    year INTEGER UNIQUE NOT NULL,
    seq  INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS RefSequence (
    id     TEXT PRIMARY KEY,
    prefix TEXT NOT NULL,
    year   INTEGER NOT NULL,
    seq    INTEGER NOT NULL DEFAULT 0,
    UNIQUE(prefix, year)
  );

  CREATE TABLE IF NOT EXISTS ExportBatch (
    id          TEXT PRIMARY KEY,
    batchNumber TEXT UNIQUE NOT NULL,
    exportDate  TEXT NOT NULL,
    exportedBy  TEXT NOT NULL DEFAULT 'System',
    itemCount   INTEGER NOT NULL DEFAULT 0,
    totalValue  REAL NOT NULL DEFAULT 0,
    notes       TEXT,
    createdAt   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE INDEX IF NOT EXISTS idx_batch_date ON ExportBatch(exportDate);

  CREATE TABLE IF NOT EXISTS ExportBatchItem (
    id            TEXT PRIMARY KEY,
    batchId       TEXT NOT NULL REFERENCES ExportBatch(id),
    jobId         TEXT NOT NULL REFERENCES Job(id),
    drawingNumber TEXT NOT NULL,
    clientCompany TEXT NOT NULL,
    itemType      TEXT NOT NULL,
    address       TEXT NOT NULL,
    quoteValue    REAL,
    exportedAt    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE INDEX IF NOT EXISTS idx_batchitem_batch ON ExportBatchItem(batchId);
  CREATE INDEX IF NOT EXISTS idx_batchitem_job   ON ExportBatchItem(jobId);

  -- One row per Accounts Handover export. Reuses the same BATCH-YYYY-NNN
  -- sequence the deprecated ExportBatch system used (sequenceDb.nextRefNumber,
  -- RefSequence WHERE prefix='BATCH') so numbers never collide with any
  -- historical batches already in a deployed database.
  CREATE TABLE IF NOT EXISTS BillingExportBatch (
    id          TEXT PRIMARY KEY,
    batchNumber TEXT UNIQUE NOT NULL,
    exportDate  TEXT NOT NULL,
    exportedBy  TEXT NOT NULL DEFAULT 'System',
    recordCount INTEGER NOT NULL DEFAULT 0,
    notes       TEXT,
    createdAt   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE INDEX IF NOT EXISTS idx_exportbatch_date ON BillingExportBatch(exportDate);

  -- ── BillingHandoff ──────────────────────────────────────────────
  -- Replaces the Invoice/ExportBatch workflow above (kept, but deprecated —
  -- see the comment above the Invoice table). This is a handoff queue, not
  -- an invoicing system: one row per billable completion event, created
  -- automatically when a Job (original or revision) reaches ISSUED, and
  -- cleared by an accounts user once they've raised the invoice externally.
  -- Duplicate prevention is enforced by a *partial* unique index on
  -- sourceJobId (added right after the live migrations below), scoped to
  -- only uncleared rows — at most one *active* handoff per Job at a time,
  -- but a job that's billed, cleared, reverted, reworked, and completed
  -- again legitimately produces a second, later handoff once the first is
  -- a closed historical record. A revision is its own Job row with its own
  -- id, so it naturally gets its own handoff when it reaches ISSUED — no
  -- special-casing needed.
  CREATE TABLE IF NOT EXISTS BillingHandoff (
    id                    TEXT PRIMARY KEY,
    sourceJobId           TEXT NOT NULL REFERENCES Job(id),
    billingEventType      TEXT NOT NULL DEFAULT 'JOB_COMPLETED',  -- JOB_COMPLETED | REVISION_COMPLETED
    -- Snapshot fields — frozen at handoff creation, same pattern as
    -- ExportBatchItem, so a later edit to the Job (or a rename cascading
    -- from clientDb.update()) can't shift what accounts already see.
    drawingNumber         TEXT NOT NULL,
    itemType              TEXT NOT NULL,
    typeOfWorks           TEXT,
    customTypeDescription TEXT,
    clientCompany         TEXT NOT NULL,
    address               TEXT NOT NULL,
    designer              TEXT,
    quoteValue            REAL,
    quoteReference        TEXT,
    completionDate        TEXT NOT NULL,
    addedToBillingQueueAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    clearedByAccountsAt   TEXT,
    clearedBy             TEXT,
    exportBatchId         TEXT REFERENCES BillingExportBatch(id),
    notes                 TEXT,
    createdAt             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updatedAt             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE INDEX IF NOT EXISTS idx_handoff_job     ON BillingHandoff(sourceJobId);
  CREATE INDEX IF NOT EXISTS idx_handoff_cleared ON BillingHandoff(clearedByAccountsAt);
  CREATE INDEX IF NOT EXISTS idx_handoff_batch   ON BillingHandoff(exportBatchId);

  -- A full point-in-time copy of everything that went into the Accounts
  -- Handover workbook for one handoff — client info, project info,
  -- commercial info, operational info, revision history, audit trail.
  -- Stored as JSON rather than dozens of flat columns: revision history is a
  -- variable-length list, and several requested fields (priority, surveyor,
  -- PO number, cost centre, attachments) don't exist as tracked data yet —
  -- the JSON shape can record "not tracked" for those without a schema
  -- migration every time the export's content changes. Once written, a
  -- snapshot is never modified — later edits to the Job must not be able to
  -- alter a historical exported record.
  CREATE TABLE IF NOT EXISTS BillingExportSnapshot (
    id           TEXT PRIMARY KEY,
    batchId      TEXT NOT NULL REFERENCES BillingExportBatch(id),
    handoffId    TEXT NOT NULL REFERENCES BillingHandoff(id),
    snapshotJson TEXT NOT NULL,
    createdAt    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(handoffId)
  );

  CREATE INDEX IF NOT EXISTS idx_snapshot_batch ON BillingExportSnapshot(batchId);

  CREATE TABLE IF NOT EXISTS Client (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    nameLower      TEXT NOT NULL,
    contactName    TEXT,
    email          TEXT,
    phone          TEXT,
    billingAddress TEXT,
    notes          TEXT,
    active         INTEGER NOT NULL DEFAULT 1,
    createdAt      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updatedAt      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(nameLower)
  );

  CREATE INDEX IF NOT EXISTS idx_client_name   ON Client(nameLower);
  CREATE INDEX IF NOT EXISTS idx_client_active ON Client(active);

  CREATE TABLE IF NOT EXISTS ClientHold (
    id            TEXT PRIMARY KEY,
    clientId      TEXT NOT NULL REFERENCES Client(id) ON DELETE CASCADE,
    status        TEXT NOT NULL DEFAULT 'ACTIVE',
    reason        TEXT NOT NULL,
    notes         TEXT,
    addedBy       TEXT NOT NULL DEFAULT 'System',
    addedAt       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    removedBy     TEXT,
    removedAt     TEXT,
    removedReason TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_hold_client ON ClientHold(clientId);
  CREATE INDEX IF NOT EXISTS idx_hold_status ON ClientHold(status);

  CREATE TABLE IF NOT EXISTS Quote (
    id            TEXT PRIMARY KEY,
    quoteNumber   TEXT UNIQUE NOT NULL,
    clientId      TEXT REFERENCES Client(id) ON DELETE SET NULL,
    clientCompany TEXT NOT NULL,
    contactName   TEXT,
    address       TEXT NOT NULL,
    description   TEXT NOT NULL,
    quoteValue    REAL NOT NULL DEFAULT 0,
    quoteDate     TEXT NOT NULL,
    expiryDate    TEXT,
    status        TEXT NOT NULL DEFAULT 'DRAFT',
    notes         TEXT,
    jobId         TEXT REFERENCES Job(id) ON DELETE SET NULL,
    createdBy     TEXT NOT NULL DEFAULT 'System',
    createdAt     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updatedAt     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE INDEX IF NOT EXISTS idx_quote_client ON Quote(clientId);
  CREATE INDEX IF NOT EXISTS idx_quote_status ON Quote(status);
  CREATE INDEX IF NOT EXISTS idx_quote_date   ON Quote(quoteDate);

  -- Optional itemised lines for the PDF's Description/VAT/Amount table. A
  -- quote with zero rows here is not a broken or incomplete quote — it
  -- means "use the single description+quoteValue exactly as before,"
  -- preserving every existing quote's behaviour untouched. Only quotes that
  -- explicitly need a multi-line breakdown (matching the reference
  -- template's two-line example) get rows here. sortOrder is plain integer
  -- position, not a timestamp, so reordering is a simple renumber.
  CREATE TABLE IF NOT EXISTS QuoteLineItem (
    id            TEXT PRIMARY KEY,
    quoteId       TEXT NOT NULL REFERENCES Quote(id) ON DELETE CASCADE,
    description   TEXT NOT NULL,
    amount        REAL NOT NULL DEFAULT 0,
    vatApplicable INTEGER NOT NULL DEFAULT 1,
    sortOrder     INTEGER NOT NULL DEFAULT 0,
    createdAt     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE INDEX IF NOT EXISTS idx_quotelineitem_quote ON QuoteLineItem(quoteId);

  CREATE TABLE IF NOT EXISTS User (
    id        TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    email     TEXT,
    emailLower TEXT,
    role      TEXT NOT NULL DEFAULT 'ENGINEER',
    active    INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE INDEX IF NOT EXISTS idx_user_role   ON User(role);
  CREATE INDEX IF NOT EXISTS idx_user_active ON User(active);

  -- Permanent, append-only audit trail of every identity-switch event —
  -- cold-start session selection, an admin starting or ending
  -- impersonation, and rejected attempts by a non-admin to switch away
  -- from themselves. Never deleted, same philosophy as StatusHistory /
  -- ExportBatch / ClientHold elsewhere in this schema. See
  -- PROJECT_OVERVIEW.md §27 and lib/auth.ts.
  CREATE TABLE IF NOT EXISTS IdentitySwitchLog (
    id            TEXT PRIMARY KEY,
    action        TEXT NOT NULL,  -- SESSION_STARTED | IMPERSONATION_STARTED | IMPERSONATION_ENDED | IMPERSONATION_REJECTED | LOGOUT
    realUserId    TEXT,           -- the genuinely authenticated identity at the time of this event (null only for a from-scratch SESSION_STARTED, before any identity existed)
    realUserName  TEXT,
    targetUserId  TEXT,           -- who was being switched to / acted as (null for LOGOUT)
    targetUserName TEXT,
    detail        TEXT,
    createdAt     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE INDEX IF NOT EXISTS idx_identityswitch_real   ON IdentitySwitchLog(realUserId);
  CREATE INDEX IF NOT EXISTS idx_identityswitch_action ON IdentitySwitchLog(action);

  -- ── Backup system ─────────────────────────────────────────────────
  -- One row per backup attempt, permanent — never deleted even once the
  -- underlying file is pruned by the retention policy (fileDeletedAt marks
  -- that separately). This is the "store reference permanently" guarantee:
  -- the historical record that a backup ran, when, by whom, and whether it
  -- succeeded outlives the actual file on disk. See lib/backup-service.ts
  -- and PROJECT_OVERVIEW.md §23.
  CREATE TABLE IF NOT EXISTS BackupJob (
    id              TEXT PRIMARY KEY,
    status          TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING | RUNNING | COMPLETED | FAILED
    trigger         TEXT NOT NULL DEFAULT 'MANUAL',   -- MANUAL | SCHEDULED | PRE_RESTORE_SAFETY | RETRY
    triggeredBy     TEXT NOT NULL,                    -- User.id — not a FK; must survive that user later being deleted
    triggeredByName TEXT NOT NULL,                     -- snapshot of the name at trigger time, same reasoning
    folderName      TEXT NOT NULL UNIQUE,              -- backup_YYYY-MM-DD_HH-MM-SS — also the on-disk directory name
    startedAt       TEXT NOT NULL,
    completedAt     TEXT,
    durationMs      INTEGER,
    sizeBytes       INTEGER,
    checksum        TEXT,                              -- sha256 of data.json
    rowCountsJson   TEXT,                               -- {"Job": 154, "Client": 50, ...}
    errorMessage    TEXT,
    retryOfId       TEXT REFERENCES BackupJob(id),
    fileDeletedAt   TEXT,                               -- set when retention policy removes the on-disk files
    createdAt       TEXT NOT NULL,
    updatedAt       TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_backupjob_status    ON BackupJob(status);
  CREATE INDEX IF NOT EXISTS idx_backupjob_createdat ON BackupJob(createdAt);

  -- Append-only audit trail for every backup/restore action — distinct from
  -- BackupJob itself so a download or a restore *attempt* (including a
  -- rejected one, e.g. wrong confirmation phrase) is logged even when no
  -- BackupJob row changes as a result.
  CREATE TABLE IF NOT EXISTS BackupAuditLog (
    id        TEXT PRIMARY KEY,
    action    TEXT NOT NULL,    -- CREATE_TRIGGERED | CREATE_COMPLETED | CREATE_FAILED | DOWNLOAD_LINK_ISSUED | DOWNLOAD_SERVED | RESTORE_TRIGGERED | RESTORE_REJECTED | RESTORE_COMPLETED | RESTORE_FAILED | RETRY_TRIGGERED | RETENTION_CLEANUP
    backupId  TEXT,             -- loosely associated — BackupJob rows are permanent so this usually resolves, but no FK so the log is never blocked by it
    userId    TEXT NOT NULL,
    userName  TEXT NOT NULL,
    detail    TEXT,
    createdAt TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_backupaudit_backup ON BackupAuditLog(backupId);
  CREATE INDEX IF NOT EXISTS idx_backupaudit_action ON BackupAuditLog(action);

  -- ── Calendar ──────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS EventCategory (
    id    TEXT PRIMARY KEY,
    name  TEXT UNIQUE NOT NULL,
    color TEXT NOT NULL,
    icon  TEXT
  );

  CREATE TABLE IF NOT EXISTS CalendarEvent (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    description TEXT,
    categoryId  TEXT NOT NULL REFERENCES EventCategory(id),
    startDate   TEXT NOT NULL,
    endDate     TEXT NOT NULL,
    allDay      INTEGER NOT NULL DEFAULT 1,
    location    TEXT,
    priority    TEXT NOT NULL DEFAULT 'MEDIUM',
    status      TEXT NOT NULL DEFAULT 'SCHEDULED',
    jobId       TEXT REFERENCES Job(id) ON DELETE SET NULL,
    clientId    TEXT REFERENCES Client(id) ON DELETE SET NULL,
    createdBy   TEXT NOT NULL,
    createdAt   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updatedAt   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE INDEX IF NOT EXISTS idx_cal_event_start    ON CalendarEvent(startDate);
  CREATE INDEX IF NOT EXISTS idx_cal_event_end      ON CalendarEvent(endDate);
  CREATE INDEX IF NOT EXISTS idx_cal_event_category ON CalendarEvent(categoryId);
  CREATE INDEX IF NOT EXISTS idx_cal_event_job      ON CalendarEvent(jobId);
  CREATE INDEX IF NOT EXISTS idx_cal_event_client   ON CalendarEvent(clientId);

  CREATE TABLE IF NOT EXISTS CalendarAssignment (
    id      TEXT PRIMARY KEY,
    eventId TEXT NOT NULL REFERENCES CalendarEvent(id) ON DELETE CASCADE,
    userId  TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
    UNIQUE(eventId, userId)
  );

  CREATE INDEX IF NOT EXISTS idx_cal_assign_event ON CalendarAssignment(eventId);
  CREATE INDEX IF NOT EXISTS idx_cal_assign_user  ON CalendarAssignment(userId);
`)

// ── Seed calendar categories ────────────────────────────────────────
db.exec(`
  INSERT OR IGNORE INTO EventCategory (id, name, color, icon) VALUES
    ('cat_site_visit',       'Site Visit',       '#3B82F6', 'map-pin'),
    ('cat_teams_meeting',    'Teams Meeting',    '#A855F7', 'video'),
    ('cat_survey',           'Survey',           '#F97316', 'clipboard'),
    ('cat_installation',     'Installation',     '#22C55E', 'wrench'),
    ('cat_client_meeting',   'Client Meeting',   '#A855F7', 'users'),
    ('cat_deadline',         'Deadline',         '#EF4444', 'alert-circle'),
    ('cat_leave',            'Leave',            '#6B7280', 'calendar-off'),
    ('cat_internal_meeting', 'Internal Meeting', '#14B8A6', 'message-square');
`)

// ── Live migrations ─────────────────────────────────────────────────

// 1. designer empty-string probe / full table rebuild for very old schemas
try {
  db.transaction(() => {
    db.prepare("INSERT INTO Job (id,drawingNumber,address,typeOfWorks,clientCompany,requestedBy,designer) VALUES ('__probe__','__probe__','a','b','c','d','')").run()
    db.prepare("DELETE FROM Job WHERE id='__probe__'").run()
  })()
} catch {
  db.exec(`
    PRAGMA foreign_keys = OFF;
    CREATE TABLE IF NOT EXISTS Job_migrate (
      id TEXT PRIMARY KEY, drawingNumber TEXT UNIQUE NOT NULL,
      address TEXT NOT NULL, typeOfWorks TEXT NOT NULL,
      clientCompany TEXT NOT NULL, requestedBy TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'NEW_REQUEST', designer TEXT NOT NULL DEFAULT '',
      dateCreated TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      dateCompleted TEXT, notes TEXT, parentJobId TEXT, revisionLetter TEXT,
      quoteValue REAL, quoteReference TEXT, quoteDate TEXT, commercialNotes TEXT,
      invoiceId TEXT,
      createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    INSERT INTO Job_migrate (id,drawingNumber,address,typeOfWorks,clientCompany,requestedBy,
      status,designer,dateCreated,dateCompleted,notes,createdAt,updatedAt)
      SELECT id,drawingNumber,address,typeOfWorks,clientCompany,requestedBy,
             status,COALESCE(designer,''),dateCreated,dateCompleted,notes,createdAt,updatedAt FROM Job;
    DROP TABLE Job; ALTER TABLE Job_migrate RENAME TO Job;
    CREATE INDEX IF NOT EXISTS idx_job_status   ON Job(status);
    CREATE INDEX IF NOT EXISTS idx_job_client   ON Job(clientCompany);
    CREATE INDEX IF NOT EXISTS idx_job_designer ON Job(designer);
    CREATE INDEX IF NOT EXISTS idx_job_created  ON Job(createdAt);
    PRAGMA foreign_keys = ON;
  `)
}

// 2. Add columns to Job that may be missing on existing databases
;(function addMissingJobColumns() {
  const existing = new Set(
    (db.prepare("PRAGMA table_info(Job)").all() as { name: string }[]).map(c => c.name)
  )
  const add = (col: string, def: string) => {
    if (!existing.has(col)) db.exec(`ALTER TABLE Job ADD COLUMN ${col} ${def}`)
  }
  add("itemType",       "TEXT NOT NULL DEFAULT 'DESIGN'")
  add("parentJobId",    "TEXT REFERENCES Job(id) ON DELETE SET NULL")
  add("revisionLetter", "TEXT")
  add("quoteValue",     "REAL")
  add("quoteReference", "TEXT")
  add("quoteDate",      "TEXT")
  add("commercialNotes","TEXT")
  add("invoiceId",      "TEXT")
  add("clientId",       "TEXT")
  add("billingStatus",  "TEXT")
  add("billingBatchId", "TEXT")
  add("requestedDate",  "TEXT")
  add("requiredByDate", "TEXT")
  // Controlled Type of Works system — typeOfWorks now holds one of the
  // approved WORKS_TYPES values (or 'Other'). customTypeDescription holds
  // the free-text description when typeOfWorks = 'Other'. legacyTypeOfWorks
  // preserves whatever free-text value was actually entered before this
  // migration ran, for any row whose original value needed remapping — see
  // migrateTypeOfWorksValues() below and PROJECT_OVERVIEW.md §22. NULL on
  // any row created after the migration (nothing to preserve).
  add("customTypeDescription", "TEXT")
  add("legacyTypeOfWorks",      "TEXT")
  db.exec("CREATE INDEX IF NOT EXISTS idx_job_deadline ON Job(requiredByDate)")
  db.exec("CREATE INDEX IF NOT EXISTS idx_job_clientid ON Job(clientId)")
  db.exec("CREATE INDEX IF NOT EXISTS idx_job_itemtype ON Job(itemType)")
  db.exec("CREATE INDEX IF NOT EXISTS idx_job_parent   ON Job(parentJobId)")
  db.exec("CREATE INDEX IF NOT EXISTS idx_job_invoice ON Job(invoiceId)")
  db.exec("CREATE INDEX IF NOT EXISTS idx_job_status  ON Job(status)")
  db.exec("CREATE INDEX IF NOT EXISTS idx_job_client  ON Job(clientCompany)")
  db.exec("CREATE INDEX IF NOT EXISTS idx_job_designer ON Job(designer)")
  db.exec("CREATE INDEX IF NOT EXISTS idx_job_created ON Job(createdAt)")
  db.exec("CREATE INDEX IF NOT EXISTS idx_job_typeofworks ON Job(typeOfWorks)")
})()

// 2b. Add columns to Quote that may be missing on existing databases
;(function addMissingQuoteColumns() {
  const tableExists = (db.prepare(
    "SELECT COUNT(*) as n FROM sqlite_master WHERE type='table' AND name='Quote'"
  ).get() as { n: number }).n > 0
  if (!tableExists) return
  const existing = new Set(
    (db.prepare("PRAGMA table_info(Quote)").all() as { name: string }[]).map(c => c.name)
  )
  const add = (col: string, def: string) => {
    if (!existing.has(col)) db.exec(`ALTER TABLE Quote ADD COLUMN ${col} ${def}`)
  }
  add("pdfPath",        "TEXT")
  add("preparedBy",     "TEXT")
  // NULL (the default for every existing quote) means "no VAT breakdown on
  // the PDF, just a single total" — exactly the old behaviour, untouched.
  // A numeric value (e.g. 20 for standard UK VAT) switches the PDF to the
  // Subtotal/Taxable/VAT rate/VAT due/TOTAL breakdown matching the
  // reference template. Nothing about quoteValue's existing meaning
  // changes — see PROJECT_OVERVIEW.md for the explicit assumption this
  // rests on.
  add("vatRate",        "REAL")
})()

// Add columns to Client that may be missing on existing databases
;(function addMissingClientColumns() {
  const tableExists = (db.prepare(
    "SELECT COUNT(*) as n FROM sqlite_master WHERE type='table' AND name='Client'"
  ).get() as { n: number }).n > 0
  if (!tableExists) return
  const existing = new Set(
    (db.prepare("PRAGMA table_info(Client)").all() as { name: string }[]).map(c => c.name)
  )
  const add = (col: string, def: string) => {
    if (!existing.has(col)) db.exec(`ALTER TABLE Client ADD COLUMN ${col} ${def}`)
  }
  // Short internal reference code (e.g. "RECPM") shown as "Customer ID" on
  // quote/invoice PDFs — optional, free text, no format enforced. Distinct
  // from Client.id (the internal cuid primary key), which is never shown
  // to a client.
  add("accountCode", "TEXT")
})()

// 2c. Add columns to BillingHandoff that may be missing on existing databases
;(function addMissingBillingHandoffColumns() {
  const tableExists = (db.prepare(
    "SELECT COUNT(*) as n FROM sqlite_master WHERE type='table' AND name='BillingHandoff'"
  ).get() as { n: number }).n > 0
  if (!tableExists) return
  const existing = new Set(
    (db.prepare("PRAGMA table_info(BillingHandoff)").all() as { name: string }[]).map(c => c.name)
  )
  if (!existing.has("exportBatchId")) {
    db.exec("ALTER TABLE BillingHandoff ADD COLUMN exportBatchId TEXT REFERENCES BillingExportBatch(id)")
    db.exec("CREATE INDEX IF NOT EXISTS idx_handoff_batch ON BillingHandoff(exportBatchId)")
  }
  if (!existing.has("customTypeDescription")) {
    db.exec("ALTER TABLE BillingHandoff ADD COLUMN customTypeDescription TEXT")
  }
})()

// 2e. Add password columns to User table
;(function addMissingUserColumns() {
  const existing = new Set(
    (db.prepare("PRAGMA table_info(User)").all() as { name: string }[]).map(c => c.name)
  )
  const add = (col: string, def: string) => {
    if (!existing.has(col)) db.exec(`ALTER TABLE User ADD COLUMN ${col} ${def}`)
  }
  add("passwordHash",      "TEXT")
  add("mustChangePassword", "INTEGER NOT NULL DEFAULT 0")
})()

// 2d. Controlled Type of Works migration — see lib/works-type-migration.ts
// and PROJECT_OVERVIEW.md §22. Only Design/Revision rows are in scope: every
// other itemType skips the typeOfWorks field entirely in the UI
// (isNonDrawingType() in lib/constants.ts), so an empty/non-list value there
// reflects "doesn't apply", not a legacy data-quality issue, and shouldn't
// be flagged for review. Idempotent by construction: once a row's
// typeOfWorks is one of the approved values, it's excluded from the
// candidate set below on every subsequent startup, so this naturally
// becomes a no-op after the first real run and is always safe to re-run.
;(function migrateTypeOfWorksValues() {
  const placeholders = WORKS_TYPES.map(() => "?").join(",")
  const candidates = db.prepare(`
    SELECT id, drawingNumber, typeOfWorks FROM Job
    WHERE itemType IN ('DESIGN','REVISION')
      AND typeOfWorks NOT IN (${placeholders})
  `).all(...WORKS_TYPES) as { id: string; drawingNumber: string; typeOfWorks: string }[]

  if (candidates.length === 0) return

  const now = nowIso()
  db.transaction(() => {
    for (const job of candidates) {
      const result = classifyLegacyWorksType(job.typeOfWorks)
      db.prepare(`
        UPDATE Job SET typeOfWorks = ?, customTypeDescription = ?, legacyTypeOfWorks = ?, "updatedAt" = ?
        WHERE id = ?
      `).run(result.mappedTo, result.customDescription, job.typeOfWorks || null, now, job.id)
      db.prepare(`
        INSERT INTO TypeOfWorksMigrationLog
          (id, jobId, drawingNumber, originalValue, mappedTo, customDescription, matchType, needsReview, migratedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        nanoid(), job.id, job.drawingNumber, job.typeOfWorks || "(empty)",
        result.mappedTo, result.customDescription, result.matchType, result.needsReview ? 1 : 0, now,
      )
    }
  })()

  const reviewCount = (db.prepare(
    "SELECT COUNT(*) as n FROM TypeOfWorksMigrationLog WHERE needsReview = 1 AND migratedAt = ?"
  ).get(now) as { n: number }).n
  console.log(`[migrateTypeOfWorksValues] Migrated ${candidates.length} job(s); ${reviewCount} flagged for manual review. See TypeOfWorksMigrationLog (WHERE needsReview = 1) for details.`)
})()

// Recover any BackupJob left stuck in RUNNING from a previous process
// lifetime. Backups run as a fire-and-forget async task on the same Node
// process (see lib/backup-service.ts) — there's no separate worker that
// could ever come back and finish or fail one if the server crashes or
// restarts mid-backup. Without this, such a job stays "RUNNING" forever and
// the admin UI would show a backup that's perpetually "in progress" but is
// actually long dead. Runs on every startup; harmless no-op once nothing is
// stuck.
;(function recoverStuckBackupJobs() {
  const stuck = db.prepare("SELECT id, folderName FROM BackupJob WHERE status = 'RUNNING'").all() as { id: string; folderName: string }[]
  if (!stuck.length) return
  const now = nowIso()
  for (const job of stuck) {
    db.prepare("UPDATE BackupJob SET status = 'FAILED', errorMessage = ?, completedAt = ?, updatedAt = ? WHERE id = ?")
      .run("Interrupted by server restart before completion", now, now, job.id)
  }
  console.log(`[recoverStuckBackupJobs] Marked ${stuck.length} stuck backup job(s) as FAILED (server restarted mid-backup).`)
})()

// Replace BillingHandoff's blanket UNIQUE(sourceJobId) with a *partial*
// unique index that only applies to uncleared rows (CREATE UNIQUE INDEX ...
// WHERE clearedByAccountsAt IS NULL). A job can legitimately go through
// Complete -> reverted -> reworked -> Complete again, and once accounts
// has already cleared the first completion, that cleared row is a
// permanent audit record (it's linked into a real BillingExportBatch
// snapshot) — it must never be deleted just because the job's current
// status changed. But the blanket UNIQUE constraint this table started
// with does not distinguish cleared from uncleared, so re-completing a job
// whose only existing handoff was already cleared would silently fail to
// create a new one (INSERT OR IGNORE swallowing the conflict), and that
// job would never re-enter the billing queue for its new completion. A
// partial index is exactly the right shape for "at most one *active*
// handoff per job, but as many historical cleared ones as its lifecycle
// actually produces."
//
// SQLite can't ALTER TABLE to drop an inline table constraint, so — same
// pattern as the Job table rebuild above — this probes for the old
// behaviour (two rows, same sourceJobId, one cleared one not, should both
// be insertable once migrated) and rebuilds the table only if the probe
// shows the blanket constraint is still in effect. Foreign keys are
// disabled only for the probe's own duration since it uses a fabricated
// job id that doesn't need to reference anything real.
;(function migrateBillingHandoffUniqueConstraint() {
  let probeNeedsRebuild = false
  db.pragma("foreign_keys = OFF")
  try {
    db.transaction(() => {
      const probeJobId = "__handoff_unique_probe__"
      db.prepare(`
        INSERT INTO BillingHandoff (id, sourceJobId, drawingNumber, itemType, clientCompany, address, completionDate, clearedByAccountsAt, createdAt, updatedAt)
        VALUES ('__probe_cleared__', ?, 'x', 'DESIGN', 'x', 'x', ?, ?, ?, ?)
      `).run(probeJobId, nowIso(), nowIso(), nowIso(), nowIso())
      db.prepare(`
        INSERT INTO BillingHandoff (id, sourceJobId, drawingNumber, itemType, clientCompany, address, completionDate, clearedByAccountsAt, createdAt, updatedAt)
        VALUES ('__probe_active__', ?, 'x', 'DESIGN', 'x', 'x', ?, NULL, ?, ?)
      `).run(probeJobId, nowIso(), nowIso(), nowIso())
    })()
  } catch {
    probeNeedsRebuild = true
  } finally {
    db.exec("DELETE FROM BillingHandoff WHERE sourceJobId = '__handoff_unique_probe__'")
    db.pragma("foreign_keys = ON")
  }

  if (probeNeedsRebuild) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      DROP TABLE IF EXISTS BillingHandoff_migrate;
      CREATE TABLE BillingHandoff_migrate (
        id                    TEXT PRIMARY KEY,
        sourceJobId           TEXT NOT NULL REFERENCES Job(id),
        billingEventType      TEXT NOT NULL DEFAULT 'JOB_COMPLETED',
        drawingNumber         TEXT NOT NULL,
        itemType              TEXT NOT NULL,
        typeOfWorks           TEXT,
        customTypeDescription TEXT,
        clientCompany         TEXT NOT NULL,
        address               TEXT NOT NULL,
        designer              TEXT,
        quoteValue            REAL,
        quoteReference        TEXT,
        completionDate        TEXT NOT NULL,
        addedToBillingQueueAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        clearedByAccountsAt   TEXT,
        clearedBy             TEXT,
        exportBatchId         TEXT REFERENCES BillingExportBatch(id),
        notes                 TEXT,
        createdAt             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updatedAt             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      INSERT INTO BillingHandoff_migrate SELECT
        id, sourceJobId, billingEventType, drawingNumber, itemType, typeOfWorks,
        customTypeDescription, clientCompany, address, designer, quoteValue,
        quoteReference, completionDate, addedToBillingQueueAt, clearedByAccountsAt,
        clearedBy, exportBatchId, notes, createdAt, updatedAt
      FROM BillingHandoff;
      DROP TABLE BillingHandoff;
      ALTER TABLE BillingHandoff_migrate RENAME TO BillingHandoff;
      CREATE INDEX IF NOT EXISTS idx_handoff_job     ON BillingHandoff(sourceJobId);
      CREATE INDEX IF NOT EXISTS idx_handoff_cleared ON BillingHandoff(clearedByAccountsAt);
      CREATE INDEX IF NOT EXISTS idx_handoff_batch   ON BillingHandoff(exportBatchId);
      PRAGMA foreign_keys = ON;
    `)
    console.log("[migrateBillingHandoffUniqueConstraint] Rebuilt BillingHandoff without the blanket UNIQUE(sourceJobId) constraint.")
  }

  // Whether freshly created or just rebuilt, ensure the partial index
  // exists — this is the actual enforced invariant going forward: at most
  // one *uncleared* handoff per job, any number of cleared (historical)
  // ones.
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_handoff_active_unique ON BillingHandoff(sourceJobId) WHERE clearedByAccountsAt IS NULL")
})()

export interface TypeOfWorksMigrationLogRow {
  id: string; jobId: string; drawingNumber: string
  originalValue: string; mappedTo: string; customDescription: string | null
  matchType: string; needsReview: number
  reviewedAt: string | null; reviewedBy: string | null
  migratedAt: string
}

export const typeOfWorksMigrationLogDb = {
  findMany(opts: { needsReview?: boolean } = {}): TypeOfWorksMigrationLogRow[] {
    const w = opts.needsReview !== undefined ? `WHERE needsReview = ${opts.needsReview ? 1 : 0}` : ""
    return db.prepare(`SELECT * FROM TypeOfWorksMigrationLog ${w} ORDER BY needsReview DESC, migratedAt DESC`).all() as TypeOfWorksMigrationLogRow[]
  },
  stats(): { total: number; needsReview: number; exact: number; alias: number; flagged: number } {
    const row = db.prepare(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN needsReview = 1 THEN 1 ELSE 0 END) as needsReview,
             SUM(CASE WHEN matchType = 'EXACT' THEN 1 ELSE 0 END) as exact,
             SUM(CASE WHEN matchType = 'ALIAS' THEN 1 ELSE 0 END) as alias,
             SUM(CASE WHEN matchType = 'FLAGGED' THEN 1 ELSE 0 END) as flagged
      FROM TypeOfWorksMigrationLog
    `).get() as { total: number; needsReview: number; exact: number; alias: number; flagged: number }
    return row
  },
  /** Marks a flagged entry as reviewed — doesn't change the job itself (do
   *  that via the normal job-edit form if the mapping needs correcting),
   *  just closes the loop on "someone looked at this." */
  markReviewed(id: string, reviewedBy: string): TypeOfWorksMigrationLogRow | null {
    const existing = db.prepare("SELECT * FROM TypeOfWorksMigrationLog WHERE id = ?").get(id) as TypeOfWorksMigrationLogRow | undefined
    if (!existing) return null
    db.prepare("UPDATE TypeOfWorksMigrationLog SET needsReview = 0, reviewedAt = ?, reviewedBy = ? WHERE id = ?")
      .run(nowIso(), reviewedBy, id)
    return db.prepare("SELECT * FROM TypeOfWorksMigrationLog WHERE id = ?").get(id) as TypeOfWorksMigrationLogRow
  },
}

// 3. Migrate old JobRevision rows → child Job rows, then drop the table
if ((db.prepare("SELECT COUNT(*) as n FROM sqlite_master WHERE type='table' AND name='JobRevision'").get() as { n: number }).n > 0) {
  const revs = db.prepare("SELECT * FROM JobRevision ORDER BY jobId, letter").all() as {
    id: string; jobId: string; letter: string; date: string
    description: string; designer: string; checker: string; createdAt: string
  }[]
  if (revs.length > 0) {
    db.transaction(() => {
      for (const rev of revs) {
        const parent = db.prepare("SELECT * FROM Job WHERE id = ?").get(rev.jobId) as { id: string; drawingNumber: string; address: string; typeOfWorks: string; clientCompany: string; requestedBy: string } | undefined
        if (!parent) continue
        const revDn = `${parent.drawingNumber} Rev ${rev.letter}`
        if (db.prepare("SELECT id FROM Job WHERE drawingNumber = ?").get(revDn)) continue
        const now = rev.createdAt ?? new Date().toISOString()
        db.prepare(`INSERT INTO Job (id,drawingNumber,address,typeOfWorks,clientCompany,requestedBy,status,designer,dateCreated,notes,parentJobId,revisionLetter,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(nanoid(), revDn, parent.address, parent.typeOfWorks, parent.clientCompany, parent.requestedBy, "NEW_REQUEST", rev.designer ?? "", now, rev.description || null, rev.jobId, rev.letter, now, now)
      }
    })()
  }
  db.exec("DROP TABLE IF EXISTS JobRevision")
}

// 4. Bootstrap a default Admin user if the User table is empty.
//    Guarantees there is always at least one active Admin able to manage
//    other users — this is the seam future real authentication plugs into:
//    once real login exists, this becomes the first account an installer
//    sets a password for, instead of a no-op placeholder.
// Log user state before bootstrap for debugging
;(function logUserState() {
  const users = db.prepare("SELECT id, name, email, role FROM User").all() as { id: string; name: string; email: string | null; role: string }[]
  console.log(`[db] Users before bootstrap: ${users.length} — ${users.map(u => `${u.name} (${u.email ?? "no email"}, ${u.role})`).join(", ") || "none"}`)
  console.log(`[db] Database was ${DB_EXISTED ? "existing" : "NEWLY CREATED"} at startup`)
})()

// Ensure the admin@test.com and engineer@test.com accounts always exist
// with working passwords. Runs on every startup — idempotent.
;(function bootstrapAccounts() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { hashPassword } = require("@/lib/password") as typeof import("@/lib/password")
  const now = nowIso()

  const accounts = [
    { email: "admin@test.com",    name: "Admin",    role: "ADMIN",    password: "admin123" },
    { email: "engineer@test.com", name: "Engineer", role: "ENGINEER", password: "engineer123" },
  ]

  for (const acct of accounts) {
    const existing = db.prepare("SELECT id, passwordHash FROM User WHERE emailLower = ?").get(acct.email) as { id: string; passwordHash: string | null } | undefined
    if (!existing) {
      db.prepare(`
        INSERT INTO User (id,name,email,emailLower,role,active,passwordHash,mustChangePassword,createdAt,updatedAt)
        VALUES (?,?,?,?,?,1,?,0,?,?)
      `).run(nanoid(), acct.name, acct.email, acct.email, acct.role, hashPassword(acct.password), now, now)
      console.log(`[bootstrapAccounts] Created ${acct.email} (password: ${acct.password})`)
    } else if (!existing.passwordHash) {
      db.prepare("UPDATE User SET passwordHash = ?, mustChangePassword = 0 WHERE id = ?")
        .run(hashPassword(acct.password), existing.id)
      console.log(`[bootstrapAccounts] Set password for ${acct.email}`)
    }
  }

  // Any other users without a password get a temp one
  const noPassword = db.prepare(
    "SELECT id, name FROM User WHERE passwordHash IS NULL"
  ).all() as { id: string; name: string }[]
  for (const u of noPassword) {
    db.prepare("UPDATE User SET passwordHash = ?, mustChangePassword = 1 WHERE id = ?")
      .run(hashPassword("changeme"), u.id)
    console.log(`[bootstrapAccounts] Set temp password for ${u.name} (must change on login)`)
  }
})()

// ── Helpers ─────────────────────────────────────────────────────────

function nowIso() { return new Date().toISOString() }

function buildWhere(where: WhereClause = {}): { sql: string; params: unknown[] } {
  const clauses: string[] = []
  const params:  unknown[] = []
  if (where.search) {
    const s = `%${where.search}%`
    // customTypeDescription included so an "Other"-type job (where the real
    // descriptive text lives in that field, not typeOfWorks) stays findable
    // by what was actually typed — searching just typeOfWorks would only
    // ever match the literal word "Other" for those rows.
    clauses.push("(drawingNumber LIKE ? OR address LIKE ? OR clientCompany LIKE ? OR requestedBy LIKE ? OR typeOfWorks LIKE ? OR customTypeDescription LIKE ? OR designer LIKE ?)")
    params.push(s, s, s, s, s, s, s)
  }
  if (where.typeOfWorks)      { clauses.push("typeOfWorks = ?");                    params.push(where.typeOfWorks) }
  if (where.itemType)         { clauses.push("itemType = ?");                       params.push(where.itemType) }
  if (where.clientId)         { clauses.push("clientId = ?");                        params.push(where.clientId) }
  if (where.billingExported)  { clauses.push("billingStatus = 'EXPORTED_TO_ACCOUNTS'") }
  if (where.billingPending)   { clauses.push("status = 'ISSUED' AND invoiceId IS NULL AND (billingStatus IS NULL OR billingStatus != 'EXPORTED_TO_ACCOUNTS')") }
  if (where.overdue)          { clauses.push("requiredByDate IS NOT NULL AND requiredByDate < date('now') AND status != 'ISSUED'") }
  if (where.dueToday)         { clauses.push("requiredByDate IS NOT NULL AND requiredByDate = date('now')") }
  if (where.dueThisWeek)      { clauses.push("requiredByDate IS NOT NULL AND requiredByDate >= date('now') AND requiredByDate <= date('now','+7 days')") }
  if (where.hasDeadline)      { clauses.push("requiredByDate IS NOT NULL") }
  if (where.status)           { clauses.push("status = ?");                        params.push(where.status) }
  if (where.unassigned)       { clauses.push("(designer = '' OR designer IS NULL)") }
  if (where.hasQuote)         { clauses.push("(quoteValue IS NOT NULL AND quoteValue > 0)") }
  if (where.invoiced)         { clauses.push("invoiceId IS NOT NULL") }
  if (where.notInvoiced)      { clauses.push("invoiceId IS NULL") }
  if (where.parentJobId)      { clauses.push("parentJobId = ?");  params.push(where.parentJobId) }
  if (where.onlyOriginals)    { clauses.push("parentJobId IS NULL") }
  if (where.onlyRevisions)    { clauses.push("parentJobId IS NOT NULL") }
  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params }
}

const SORT_WHITELIST = new Set(["createdAt","drawingNumber","clientCompany","designer","status","dateCreated","quoteValue","itemType","requiredByDate","requestedDate","address"])
function safeOrder(field: string, dir: string) {
  const f = SORT_WHITELIST.has(field) ? field : "createdAt"
  return `ORDER BY "${f}" ${dir === "asc" ? "ASC" : "DESC"}`
}

// ── Job row type ───────────────────────────────────────────────────

export interface JobRow {
  id: string; drawingNumber: string; itemType: string; address: string; typeOfWorks: string
  customTypeDescription: string | null; legacyTypeOfWorks: string | null
  clientCompany: string; clientId: string | null; requestedBy: string; status: string; designer: string
  dateCreated: string; dateCompleted: string | null; notes: string | null
  quoteValue: number | null; quoteReference: string | null
  quoteDate: string | null; commercialNotes: string | null
  invoiceId:      string | null
  billingStatus:  string | null
  billingBatchId: string | null
  requestedDate:  string | null
  requiredByDate: string | null
  parentJobId: string | null; revisionLetter: string | null
  createdAt: string; updatedAt: string
}

export interface InvoiceRow {
  id: string; invoiceNumber: string; invoiceDate: string
  invoiceValue: number; clientCompany: string
  paymentStatus: string   // DRAFT | SENT | PAID
  notes: string | null
  createdBy: string; createdAt: string; updatedAt: string
  sentAt: string | null; paidAt: string | null
}

export interface InvoiceItemRow {
  id: string; invoiceId: string; jobId: string
  drawingNumber: string; description: string | null; value: number
}

/** One row per billable completion event — the Ready For Invoicing queue. */
export interface BillingHandoffRow {
  id: string; sourceJobId: string
  billingEventType: string   // JOB_COMPLETED | REVISION_COMPLETED
  drawingNumber: string; itemType: string; typeOfWorks: string | null
  customTypeDescription: string | null
  clientCompany: string; address: string; designer: string | null
  quoteValue: number | null; quoteReference: string | null
  completionDate: string; addedToBillingQueueAt: string
  clearedByAccountsAt: string | null; clearedBy: string | null
  exportBatchId: string | null
  notes: string | null
  createdAt: string; updatedAt: string
}

export interface BillingExportBatchRow {
  id: string; batchNumber: string; exportDate: string; exportedBy: string
  recordCount: number; notes: string | null; createdAt: string
}

export interface BillingExportSnapshotRow {
  id: string; batchId: string; handoffId: string; snapshotJson: string; createdAt: string
}

/** The full Accounts Handover payload built for one handoff at export time —
 *  see billingHandoffDb.buildAccountsHandoverSnapshot(). Named explicitly
 *  (rather than inferred via ReturnType<typeof ...>) so it can be referenced
 *  from createExportBatch()'s signature without a self-referential type error. */
/**
 * The full Accounts Handover payload built for one handoff at export time —
 * see billingHandoffDb.buildAccountsHandoverSnapshot(). Named explicitly
 * (rather than inferred via ReturnType<typeof ...>) so it can be referenced
 * from createExportBatch()'s signature without a self-referential type error.
 *
 * Structure mirrors the 8-sheet workbook exactly (lib/billing-export.ts):
 * client / project / request / commercial / design / survey / revisions /
 * audit / attachments. "Job Number" and "Drawing Number" are kept as twin
 * fields under client request even though they're the same underlying
 * value (`Job.drawingNumber`) — there's no second number to report, but
 * both names were asked for explicitly, so both are populated from the one
 * real field rather than omitting either. Same reasoning for Client Name /
 * Company Name (`Client.name` is both, in this domain).
 */
export interface AccountsHandoverSnapshot {
  handoffId: string
  billingEventType: string
  client: {
    clientName: string; companyName: string
    contactName: string | null; contactEmail: string | null; contactTelephone: string | null
    billingContact: string | null; billingAddress: string | null
    clientNotes: string | null
  }
  project: {
    jobNumber: string; drawingNumber: string
    projectName: string | null; projectDescription: string | null
    siteAddress: string; typeOfWorks: string | null
    otherTypeDescription: string | null; allNotes: string | null
    jobStatus: string; priority: string | null
    creationDate: string; dueDate: string | null; completionDate: string
  }
  request: {
    requestedBy: string | null; companyRequestingWorks: string
    requestDate: string | null; requestSource: string | null
    internalReferences: string | null
    purchaseOrderNumber: string | null; costCentre: string | null
  }
  commercial: {
    agreedFee: number | null; quotedFee: number | null; quoteReference: string | null
    variationFees: string | null; additionalCharges: string | null
    revisionCharges: number | null; commercialNotes: string | null
    paymentTerms: string | null
  }
  design: {
    assignedDesigner: string | null; completedBy: string | null
    designCompletionDate: string; designNotes: string | null; designReference: string
  }
  survey: {
    assignedSurveyor: string | null; surveyDate: string | null
    surveyNotes: string | null; surveyReferences: string | null
  }
  revisions: {
    revisionCount: number
    history: {
      drawingNumber: string; revisionLetter: string | null; status: string
      requestedDate: string | null; completionDate: string | null
      description: string | null; charge: number | null
    }[]
  }
  audit: {
    createdBy: string | null; createdDate: string
    lastModifiedBy: string | null; lastModifiedDate: string
    addedToQueueAt: string
    fullHistory: { fromStatus: string | null; toStatus: string; changedBy: string; changedAt: string; note: string | null }[]
  }
  attachments: { note: string; items: { fileName: string; reference: string; uploadedAt: string }[] }
  notTracked: string[]
}

export interface StatusHistoryRow {
  id: string; jobId: string; fromStatus: string | null; toStatus: string
  changedBy: string; changedAt: string; note: string | null
}

export type Role = "ADMIN" | "ENGINEER"

export interface UserRow {
  id: string; name: string; email: string | null; emailLower: string | null
  role: Role; active: number   // 1 = active, 0 = disabled
  passwordHash: string | null
  mustChangePassword: number   // 1 = must set new password before using the app
  createdAt: string; updatedAt: string
}

export interface CreateUserData {
  id: string; name: string; email?: string | null; role?: Role
  passwordHash?: string | null
  mustChangePassword?: number
}

export interface UpdateUserData {
  name?: string; email?: string | null; role?: Role; active?: number
  passwordHash?: string | null
  mustChangePassword?: number
}

export interface CreateJobData {
  id: string; drawingNumber: string; itemType?: string; address: string; typeOfWorks: string
  customTypeDescription?: string | null
  clientCompany: string; requestedBy: string; status: string; designer: string
  dateCompleted: string | null; notes: string | null
  quoteValue?: number | null; quoteReference?: string | null
  quoteDate?: string | null; commercialNotes?: string | null
  parentJobId?: string | null; revisionLetter?: string | null
  clientId?: string | null
  requestedDate?:  string | null
  requiredByDate?: string | null
  changedBy?: string
}

export interface UpdateJobData {
  address?: string; typeOfWorks?: string; customTypeDescription?: string | null; clientCompany?: string
  requestedBy?: string; status?: string; designer?: string
  dateCompleted?: string | null; notes?: string | null
  quoteValue?: number | null; quoteReference?: string | null
  quoteDate?: string | null; commercialNotes?: string | null
  clientId?: string | null
  requestedDate?:  string | null
  requiredByDate?: string | null
  changedBy?: string
}

export interface WhereClause {
  search?: string; status?: string
  unassigned?: boolean; hasQuote?: boolean
  itemType?: string; clientId?: string
  typeOfWorks?: string
  invoiced?: boolean; notInvoiced?: boolean
  billingExported?: boolean
  billingPending?:  boolean
  dueToday?:        boolean    // requiredByDate = today
  dueThisWeek?:     boolean    // requiredByDate within next 7 days
  overdue?:         boolean    // requiredByDate < today AND status != ISSUED
  hasDeadline?:     boolean    // requiredByDate IS NOT NULL
  parentJobId?: string; onlyOriginals?: boolean; onlyRevisions?: boolean
}

export interface FindManyOptions {
  where?: WhereClause
  orderBy?: { field: string; dir: "asc" | "desc" }
  skip?: number; take?: number
}

// ── Job queries ───────────────────────────────────────────────────

export const jobDb = {
  /**
   * Records a billing handoff for a job that has just reached ISSUED — but only
   * if one doesn't already exist for it. The UNIQUE(sourceJobId) constraint on
   * BillingHandoff is the actual guarantee; INSERT OR IGNORE just means a repeat
   * call (e.g. a job bouncing CHECKING → ISSUED → CHECKING → ISSUED again) is a
   * silent no-op instead of a thrown constraint error. Must be called from
   * inside the same transaction as the status write, so the two can never
   * disagree about whether a job is "ISSUED with a handoff" or "ISSUED without one".
   */
  _recordBillingHandoffIfIssued(job: JobRow) {
    if (job.status !== "ISSUED") return
    const billingEventType = job.parentJobId ? "REVISION_COMPLETED" : "JOB_COMPLETED"
    const completionDate   = job.dateCompleted ?? nowIso().slice(0, 10)
    db.prepare(`
      INSERT OR IGNORE INTO BillingHandoff
        (id, sourceJobId, billingEventType, drawingNumber, itemType, typeOfWorks, customTypeDescription,
         clientCompany, address, designer, quoteValue, quoteReference, completionDate,
         addedToBillingQueueAt, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      nanoid(), job.id, billingEventType, job.drawingNumber, job.itemType, job.typeOfWorks, job.customTypeDescription,
      job.clientCompany, job.address, job.designer || null, job.quoteValue, job.quoteReference,
      completionDate, nowIso(), nowIso(), nowIso(),
    )
  },

  findMany(opts: FindManyOptions = {}): JobRow[] {
    const { sql: w, params } = buildWhere(opts.where)
    const order  = opts.orderBy ? safeOrder(opts.orderBy.field, opts.orderBy.dir) : "ORDER BY dateCreated DESC"
    const limit  = opts.take != null ? `LIMIT ${opts.take}` : ""
    const offset = opts.skip != null ? `OFFSET ${opts.skip}` : ""
    return db.prepare(`SELECT * FROM Job ${w} ${order} ${limit} ${offset}`).all(...params) as JobRow[]
  },

  count(where: WhereClause = {}): number {
    const { sql: w, params } = buildWhere(where)
    return (db.prepare(`SELECT COUNT(*) as n FROM Job ${w}`).get(...params) as { n: number }).n
  },

  findUnique(id: string): JobRow | null {
    return (db.prepare("SELECT * FROM Job WHERE id = ?").get(id) as JobRow) ?? null
  },

  /** Batched version of findUnique for a list of ids — one query instead of N. Results
   *  are not guaranteed to preserve the input order; callers needing a specific order
   *  (e.g. the billing export, which preserves selection order) should re-sort by id. */
  findManyByIds(ids: string[]): JobRow[] {
    if (!ids.length) return []
    const placeholders = ids.map(() => "?").join(",")
    return db.prepare(`SELECT * FROM Job WHERE id IN (${placeholders})`).all(...ids) as JobRow[]
  },

  revisionsForJob(parentId: string): JobRow[] {
    return db.prepare("SELECT * FROM Job WHERE parentJobId = ? ORDER BY revisionLetter ASC").all(parentId) as JobRow[]
  },

  create(data: CreateJobData): JobRow {
    const now = nowIso(); const changedBy = data.changedBy ?? "System"
    db.transaction(() => {
      db.prepare(`
        INSERT INTO Job (id,drawingNumber,itemType,address,typeOfWorks,customTypeDescription,clientCompany,clientId,requestedBy,
          status,designer,dateCompleted,notes,quoteValue,quoteReference,quoteDate,commercialNotes,
          parentJobId,revisionLetter,requestedDate,requiredByDate,dateCreated,createdAt,updatedAt)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(data.id, data.drawingNumber, data.itemType ?? "DESIGN", data.address, data.typeOfWorks,
             data.customTypeDescription ?? null,
             data.clientCompany, data.clientId ?? null, data.requestedBy, data.status, data.designer ?? "",
             data.dateCompleted ?? null, data.notes ?? null,
             data.quoteValue ?? null, data.quoteReference ?? null,
             data.quoteDate ?? null, data.commercialNotes ?? null,
             data.parentJobId ?? null, data.revisionLetter ?? null,
             data.requestedDate ?? null, data.requiredByDate ?? null,
             now, now, now)
      db.prepare("INSERT INTO StatusHistory (id,jobId,fromStatus,toStatus,changedBy,changedAt) VALUES (?,?,NULL,?,?,?)")
        .run(nanoid(), data.id, data.status, changedBy, now)
      this._recordBillingHandoffIfIssued(this.findUnique(data.id)!)
    })()
    return this.findUnique(data.id)!
  },

  update(id: string, data: UpdateJobData): JobRow | null {
    const existing = this.findUnique(id)
    if (!existing) return null
    const changedBy = data.changedBy ?? "System"
    const statusChanged = data.status !== undefined && data.status !== existing.status
    const oldStatus = existing.status
    const fields: string[] = []; const params: unknown[] = []
    const colData = { ...data } as Record<string, unknown>; delete colData.changedBy
    for (const [key, val] of Object.entries(colData)) {
      if (val !== undefined) { fields.push(`"${key}" = ?`); params.push(val) }
    }
    if (fields.length === 0 && !statusChanged) return existing
    db.transaction(() => {
      if (fields.length > 0) {
        fields.push('"updatedAt" = ?'); params.push(nowIso(), id)
        db.prepare(`UPDATE Job SET ${fields.join(", ")} WHERE id = ?`).run(...params)
      }
      if (statusChanged) {
        // Reverting away from Complete must undo the automatic billing
        // handoff that reaching Complete created — otherwise a job
        // bounced back to an earlier status (by mistake or otherwise)
        // stays permanently visible in the billing queue and flagged as
        // sent to accounts, which is exactly the bug this exists to fix.
        // Going the other way (-> ISSUED) is unaffected; that path already
        // worked correctly.
        let historyNote: string | null = null
        if (oldStatus === "ISSUED" && data.status !== "ISSUED") {
          historyNote = this._retractBillingHandoffOnRevert(id)
        }
        db.prepare("INSERT INTO StatusHistory (id,jobId,fromStatus,toStatus,changedBy,changedAt,note) VALUES (?,?,?,?,?,?,?)")
          .run(nanoid(), id, oldStatus, data.status, changedBy, nowIso(), historyNote)
        if (data.status === "ISSUED") {
          this._recordBillingHandoffIfIssued(this.findUnique(id)!)
        }
      }
    })()
    return this.findUnique(id)
  },

  /**
   * Called when a job's status changes away from ISSUED. Looks up the
   * job's current *active* (uncleared) billing handoff:
   *   - If one exists, it's deleted outright — nothing irreversible has
   *     happened to an uncleared handoff (no export batch references it,
   *     accounts hasn't actioned it), so removing it is safe and is
   *     exactly what "must not appear in the Billing tab" requires.
   *   - If the job's most recent handoff is already *cleared*, it is
   *     never touched — it's a permanent audit record, already linked
   *     into a real BillingExportBatch snapshot, and this codebase's
   *     standing rule is that audit trails (StatusHistory, ExportBatch,
   *     ClientHold, and now this) are never deleted. Returns a note
   *     string in that case so the discrepancy is visible in the job's
   *     own status history rather than silently invisible.
   * Returns the note to attach to the status-change history row being
   * written by the caller (null in the common case — nothing to flag).
   */
  _retractBillingHandoffOnRevert(jobId: string): string | null {
    const active = billingHandoffDb.findBySourceJobId(jobId)
    if (active) {
      db.prepare("DELETE FROM BillingHandoff WHERE id = ?").run(active.id)
      return null
    }
    const [mostRecent] = billingHandoffDb.findHistoryBySourceJobId(jobId)
    if (mostRecent && mostRecent.clearedByAccountsAt) {
      return `Note: this job had already been cleared for accounts (${mostRecent.exportBatchId ? `batch ${mostRecent.exportBatchId}` : "no batch reference"}) before being reverted from Complete. That historical billing record was not deleted.`
    }
    return null
  },

  assignDesigner(id: string, designer: string, changedBy: string): { job: JobRow } | null {
    const existing = this.findUnique(id)
    if (!existing) return null
    const now = nowIso()
    db.transaction(() => {
      db.prepare('UPDATE Job SET designer = ?, "updatedAt" = ? WHERE id = ?').run(designer.trim(), now, id)
      db.prepare("INSERT INTO StatusHistory (id,jobId,fromStatus,toStatus,changedBy,changedAt,note) VALUES (?,?,?,?,?,?,?)")
        .run(nanoid(), id, existing.status, existing.status, changedBy, now, `Designer assigned: ${designer.trim()}`)
    })()
    return { job: this.findUnique(id)! }
  },

  /**
   * Checks whether a job is safe to hard-delete. Returns a list of human-readable
   * reasons it can't be (empty array = safe to delete). Without this, deleting a
   * job could: silently orphan its revisions (parentJobId is ON DELETE SET NULL,
   * so the revision survives but loses its link to the parent and starts being
   * counted as an "original" job); leave a deprecated Invoice's stored
   * invoiceValue stale; throw a raw, uncaught SQLite FK error if it's already in
   * a deprecated ExportBatch; or destroy a BillingHandoff record accounts may
   * already be relying on (or have already cleared) for that completion event.
   */
  deletionBlockers(id: string): string[] {
    const reasons: string[] = []
    const revisionCount = (db.prepare("SELECT COUNT(*) as n FROM Job WHERE parentJobId = ?").get(id) as { n: number }).n
    if (revisionCount > 0) {
      reasons.push(`This job has ${revisionCount} revision${revisionCount === 1 ? "" : "s"} — delete ${revisionCount === 1 ? "it" : "them"} first.`)
    }
    const job = this.findUnique(id)
    if (job?.invoiceId) {
      reasons.push("This job has already been invoiced.")
    }
    if (job?.billingStatus === "EXPORTED_TO_ACCOUNTS") {
      reasons.push("This job has already been exported to accounts.")
    }
    const handoff = (db.prepare("SELECT id, clearedByAccountsAt FROM BillingHandoff WHERE sourceJobId = ?").get(id) as { id: string; clearedByAccountsAt: string | null } | undefined)
    if (handoff) {
      reasons.push(handoff.clearedByAccountsAt
        ? "This job has already been cleared for invoicing by accounts."
        : "This job is in the Ready For Invoicing queue.")
    }
    return reasons
  },

  delete(id: string): boolean {
    return db.prepare("DELETE FROM Job WHERE id = ?").run(id).changes > 0
  },

  groupByItemType(): { itemType: string; count: number }[] {
    return db.prepare("SELECT itemType, COUNT(*) as count FROM Job GROUP BY itemType").all() as { itemType: string; count: number }[]
  },

  deadlineStats(): { overdueCount: number; dueTodayCount: number; dueThisWeekCount: number } {
    const overdueCount    = (db.prepare("SELECT COUNT(*) as n FROM Job WHERE requiredByDate IS NOT NULL AND requiredByDate < date('now') AND status != 'ISSUED'").get() as { n: number }).n
    const dueTodayCount   = (db.prepare("SELECT COUNT(*) as n FROM Job WHERE requiredByDate IS NOT NULL AND requiredByDate = date('now')").get() as { n: number }).n
    const dueThisWeekCount= (db.prepare("SELECT COUNT(*) as n FROM Job WHERE requiredByDate IS NOT NULL AND requiredByDate >= date('now') AND requiredByDate <= date('now','+7 days')").get() as { n: number }).n
    return { overdueCount, dueTodayCount, dueThisWeekCount }
  },

  /** Overdue jobs for dashboard alert — all non-issued jobs past their deadline */
  overdueJobs(): JobRow[] {
    return db.prepare(
      "SELECT * FROM Job WHERE requiredByDate IS NOT NULL AND requiredByDate < date('now') AND status != 'ISSUED' ORDER BY requiredByDate ASC LIMIT 20"
    ).all() as JobRow[]
  },

  groupByStatus(): { status: string; count: number }[] {
    return db.prepare("SELECT status, COUNT(*) as count FROM Job GROUP BY status").all() as { status: string; count: number }[]
  },

  /** Distinct designer names already used on jobs — feeds the inline assign picker so reassigning to
   *  someone who's worked a job before is a single click instead of re-typing their name. */
  distinctDesigners(): string[] {
    const rows = db.prepare(
      "SELECT DISTINCT designer FROM Job WHERE designer IS NOT NULL AND designer != '' ORDER BY designer COLLATE NOCASE ASC"
    ).all() as { designer: string }[]
    return rows.map(r => r.designer)
  },

  countWhere(where: WhereClause & { createdAfter?: string }): number {
    const clauses: string[] = []; const params: unknown[] = []
    if (where.status)        { clauses.push("status = ?");                        params.push(where.status) }
    if (where.createdAfter)  { clauses.push("createdAt >= ?");                    params.push(where.createdAfter) }
    if (where.unassigned)    { clauses.push("(designer = '' OR designer IS NULL)") }
    if (where.onlyOriginals) { clauses.push("parentJobId IS NULL") }
    if (where.onlyRevisions) { clauses.push("parentJobId IS NOT NULL") }
    if (where.notInvoiced)   { clauses.push("invoiceId IS NULL") }
    if (where.invoiced)      { clauses.push("invoiceId IS NOT NULL") }
    if (where.overdue)       { clauses.push("requiredByDate IS NOT NULL AND requiredByDate < date('now') AND status != 'ISSUED'") }
    if (where.dueToday)      { clauses.push("requiredByDate IS NOT NULL AND requiredByDate = date('now')") }
    if (where.dueThisWeek)   { clauses.push("requiredByDate IS NOT NULL AND requiredByDate >= date('now') AND requiredByDate <= date('now','+7 days')") }
    const sql = clauses.length ? `SELECT COUNT(*) as n FROM Job WHERE ${clauses.join(" AND ")}` : "SELECT COUNT(*) as n FROM Job"
    return (db.prepare(sql).get(...params) as { n: number }).n
  },

  findRecent(take: number) {
    return db.prepare(
      `SELECT id,drawingNumber,itemType,address,status,clientCompany,designer,quoteValue,invoiceId,parentJobId,revisionLetter,dateCreated,createdAt
       FROM Job ORDER BY dateCreated DESC LIMIT ?`
    ).all(take) as Pick<JobRow, "id"|"drawingNumber"|"itemType"|"address"|"status"|"clientCompany"|"designer"|"quoteValue"|"invoiceId"|"parentJobId"|"revisionLetter"|"createdAt">[]
  },

  /** All ISSUED jobs not yet invoiced — the invoice queue */
  invoiceQueue(): JobRow[] {
    return db.prepare(
      "SELECT * FROM Job WHERE status = 'ISSUED' AND (invoiceId IS NULL) ORDER BY clientCompany ASC, createdAt ASC"
    ).all() as JobRow[]
  },

  /** Billing queue: ISSUED, not invoiced, not already exported */
  billingQueue(): JobRow[] {
    return db.prepare(
      `SELECT * FROM Job
       WHERE status = 'ISSUED'
         AND (invoiceId IS NULL)
         AND (billingStatus IS NULL OR billingStatus != 'EXPORTED_TO_ACCOUNTS')
       ORDER BY clientCompany ASC, createdAt ASC`
    ).all() as JobRow[]
  },
}

// ── Invoice queries ───────────────────────────────────────────────

export interface CreateInvoiceData {
  invoiceDate:   string
  clientCompany: string
  paymentStatus?: string
  notes?:        string | null
  createdBy?:    string
  /** job ids + optional per-line values */
  items: { jobId: string; value?: number | null; description?: string | null }[]
}

export const invoiceDb = {
  findMany(opts: { status?: string; clientCompany?: string; skip?: number; take?: number } = {}): InvoiceRow[] {
    const clauses: string[] = []; const params: unknown[] = []
    if (opts.status)        { clauses.push("paymentStatus = ?"); params.push(opts.status) }
    if (opts.clientCompany) { clauses.push("clientCompany = ?"); params.push(opts.clientCompany) }
    const w     = clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
    const limit  = opts.take != null ? `LIMIT ${opts.take}` : ""
    const offset = opts.skip != null ? `OFFSET ${opts.skip}` : ""
    return db.prepare(`SELECT * FROM Invoice ${w} ORDER BY invoiceDate DESC, createdAt DESC ${limit} ${offset}`).all(...params) as InvoiceRow[]
  },

  count(opts: { status?: string } = {}): number {
    const clauses: string[] = []; const params: unknown[] = []
    if (opts.status) { clauses.push("paymentStatus = ?"); params.push(opts.status) }
    const w = clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
    return (db.prepare(`SELECT COUNT(*) as n FROM Invoice ${w}`).get(...params) as { n: number }).n
  },

  findUnique(id: string): InvoiceRow | null {
    return (db.prepare("SELECT * FROM Invoice WHERE id = ?").get(id) as InvoiceRow) ?? null
  },

  findByNumber(num: string): InvoiceRow | null {
    return (db.prepare("SELECT * FROM Invoice WHERE invoiceNumber = ?").get(num) as InvoiceRow) ?? null
  },

  /** Items (line rows) for a given invoice, joined with job data */
  itemsForInvoice(invoiceId: string): (InvoiceItemRow & Pick<JobRow, "address"|"typeOfWorks"|"clientCompany"|"status">)[] {
    return db.prepare(`
      SELECT ii.*, j.address, j.typeOfWorks, j.clientCompany, j.status
      FROM InvoiceItem ii
      JOIN Job j ON j.id = ii.jobId
      WHERE ii.invoiceId = ?
      ORDER BY ii.drawingNumber ASC
    `).all(invoiceId) as (InvoiceItemRow & Pick<JobRow, "address"|"typeOfWorks"|"clientCompany"|"status">)[]
  },

  /** Generate next invoice number: INV-YYYY-NNN */
  nextNumber(): string {
    const year = new Date().getFullYear()
    const run = db.transaction((): number => {
      const existing = db.prepare("SELECT seq FROM InvoiceSequence WHERE year = ?").get(year) as { seq: number } | undefined
      if (existing) {
        const next = existing.seq + 1
        db.prepare("UPDATE InvoiceSequence SET seq = ? WHERE year = ?").run(next, year)
        return next
      } else {
        db.prepare("INSERT INTO InvoiceSequence (id,year,seq) VALUES (?,?,1)").run(nanoid(), year)
        return 1
      }
    })
    const seq = run()
    return `INV-${year}-${String(seq).padStart(3, "0")}`
  },

  /**
   * Create an invoice for one or more jobs.
   * Validates that every job is ISSUED and not already invoiced.
   * Returns { invoice, error } — error is a human-readable string on failure.
   */
  create(data: CreateInvoiceData): { invoice: InvoiceRow } | { error: string } {
    if (!data.items.length) return { error: "At least one job is required" }

    // Validate all jobs and keep the fetched rows so we don't re-fetch them below
    const jobsById = new Map<string, JobRow>()
    for (const item of data.items) {
      const job = jobDb.findUnique(item.jobId)
      if (!job) return { error: `Job ${item.jobId} not found` }
      if (job.status !== "ISSUED") return { error: `${job.drawingNumber} is not Issued — only Issued jobs can be invoiced` }
      if (job.invoiceId) return { error: `${job.drawingNumber} has already been invoiced` }
      jobsById.set(item.jobId, job)
    }

    const id            = nanoid()
    const invoiceNumber = this.nextNumber()
    const now           = nowIso()
    const createdBy     = data.createdBy ?? "System"

    // Calculate total value: use item.value if given, else job.quoteValue, else 0
    let total = 0
    const resolvedItems: { jobId: string; dn: string; desc: string | null; value: number }[] = []
    for (const item of data.items) {
      const job = jobsById.get(item.jobId)!
      const v   = item.value != null ? item.value : (job.quoteValue ?? 0)
      total += v
      resolvedItems.push({ jobId: item.jobId, dn: job.drawingNumber, desc: item.description ?? null, value: v })
    }

    db.transaction(() => {
      // Insert invoice header
      db.prepare(`
        INSERT INTO Invoice (id,invoiceNumber,invoiceDate,invoiceValue,clientCompany,paymentStatus,notes,createdBy,createdAt,updatedAt)
        VALUES (?,?,?,?,?,?,?,?,?,?)
      `).run(id, invoiceNumber, data.invoiceDate, total, data.clientCompany,
             data.paymentStatus ?? "DRAFT", data.notes ?? null, createdBy, now, now)

      // Insert line items + mark jobs as invoiced
      for (const ri of resolvedItems) {
        db.prepare("INSERT INTO InvoiceItem (id,invoiceId,jobId,drawingNumber,description,value) VALUES (?,?,?,?,?,?)")
          .run(nanoid(), id, ri.jobId, ri.dn, ri.desc, ri.value)
        db.prepare('UPDATE Job SET invoiceId = ?, "updatedAt" = ? WHERE id = ?')
          .run(id, now, ri.jobId)
        // Audit entry on the job
        db.prepare("INSERT INTO StatusHistory (id,jobId,fromStatus,toStatus,changedBy,changedAt,note) VALUES (?,?,?,?,?,?,?)")
          .run(nanoid(), ri.jobId, "ISSUED", "ISSUED", createdBy, now, `Invoiced: ${invoiceNumber}`)
      }
    })()

    return { invoice: this.findUnique(id)! }
  },

  /** Update payment status + record audit timestamp */
  updateStatus(id: string, paymentStatus: string, changedBy: string): InvoiceRow | null {
    const existing = this.findUnique(id)
    if (!existing) return null

    const now = nowIso()
    const sentAt = paymentStatus === "SENT" ? (existing.sentAt ?? now) : existing.sentAt
    const paidAt = paymentStatus === "PAID" ? (existing.paidAt ?? now) : existing.paidAt

    db.transaction(() => {
      db.prepare('UPDATE Invoice SET paymentStatus = ?, sentAt = ?, paidAt = ?, "updatedAt" = ? WHERE id = ?')
        .run(paymentStatus, sentAt, paidAt, now, id)

      // Audit each job on the invoice
      const items = this.itemsForInvoice(id)
      const note  = paymentStatus === "SENT" ? `Invoice ${existing.invoiceNumber} sent`
                  : paymentStatus === "PAID" ? `Invoice ${existing.invoiceNumber} paid`
                  : `Invoice ${existing.invoiceNumber} status → ${paymentStatus}`
      for (const item of items) {
        db.prepare("INSERT INTO StatusHistory (id,jobId,fromStatus,toStatus,changedBy,changedAt,note) VALUES (?,?,?,?,?,?,?)")
          .run(nanoid(), item.jobId, "ISSUED", "ISSUED", changedBy, now, note)
      }
    })()

    return this.findUnique(id)
  },

  /** Delete an invoice and un-link its jobs (so they can be re-invoiced) */
  delete(id: string): boolean {
    const invoice = this.findUnique(id)
    if (!invoice) return false
    const items = this.itemsForInvoice(id)
    db.transaction(() => {
      // Un-link jobs
      for (const item of items) {
        db.prepare('UPDATE Job SET invoiceId = NULL, "updatedAt" = ? WHERE id = ?').run(nowIso(), item.jobId)
      }
      db.prepare("DELETE FROM Invoice WHERE id = ?").run(id)
    })()
    return true
  },

  /** Invoice aggregates for stats and reporting */
  stats() {
    const total = (db.prepare("SELECT COUNT(*) as n FROM Invoice").get() as { n: number }).n
    const draft = (db.prepare("SELECT COUNT(*) as n FROM Invoice WHERE paymentStatus='DRAFT'").get() as { n: number }).n
    const sent  = (db.prepare("SELECT COUNT(*) as n FROM Invoice WHERE paymentStatus='SENT'").get() as { n: number }).n
    const paid  = (db.prepare("SELECT COUNT(*) as n FROM Invoice WHERE paymentStatus='PAID'").get() as { n: number }).n
    const outstandingValue = (db.prepare("SELECT COALESCE(SUM(invoiceValue),0) as v FROM Invoice WHERE paymentStatus IN ('DRAFT','SENT')").get() as { v: number }).v
    const totalPaid        = (db.prepare("SELECT COALESCE(SUM(invoiceValue),0) as v FROM Invoice WHERE paymentStatus='PAID'").get() as { v: number }).v
    const readyToInvoice   = (db.prepare("SELECT COUNT(*) as n FROM Job WHERE status='ISSUED' AND invoiceId IS NULL").get() as { n: number }).n
    return { total, draft, sent, paid, outstandingValue, totalPaid, readyToInvoice }
  },

  monthlyStats(month: string) {
    const totalInvoiced = (db.prepare("SELECT COALESCE(SUM(invoiceValue),0) as v FROM Invoice WHERE strftime('%Y-%m',invoiceDate)=?").get(month) as { v: number }).v
    const totalPaid     = (db.prepare("SELECT COALESCE(SUM(invoiceValue),0) as v FROM Invoice WHERE paymentStatus='PAID' AND strftime('%Y-%m',paidAt)=?").get(month) as { v: number }).v
    const outstanding   = (db.prepare("SELECT COALESCE(SUM(invoiceValue),0) as v FROM Invoice WHERE paymentStatus IN ('DRAFT','SENT')").get() as { v: number }).v
    return { totalInvoiced, totalPaid, outstanding }
  },

  revenueByClient(): { clientCompany: string; total: number; count: number }[] {
    return db.prepare(`
      SELECT clientCompany, COALESCE(SUM(invoiceValue),0) as total, COUNT(*) as count
      FROM Invoice GROUP BY clientCompany ORDER BY total DESC
    `).all() as { clientCompany: string; total: number; count: number }[]
  },
}

// ── Status history ────────────────────────────────────────────────

export const historyDb = {
  forJob(jobId: string): StatusHistoryRow[] {
    return db.prepare("SELECT * FROM StatusHistory WHERE jobId = ? ORDER BY changedAt ASC").all(jobId) as StatusHistoryRow[]
  },
  addNote(jobId: string, note: string, changedBy: string): StatusHistoryRow {
    const job = jobDb.findUnique(jobId); const id = nanoid(); const now = nowIso()
    db.prepare("INSERT INTO StatusHistory (id,jobId,fromStatus,toStatus,changedBy,changedAt,note) VALUES (?,?,?,?,?,?,?)")
      .run(id, jobId, job?.status ?? null, job?.status ?? "", changedBy, now, note)
    return db.prepare("SELECT * FROM StatusHistory WHERE id = ?").get(id) as StatusHistoryRow
  },
}

// ── Drawing sequences ─────────────────────────────────────────────

export const sequenceDb = {
  nextSequence(yearMonth: string): number {
    const run = db.transaction(() => {
      const existing = db.prepare("SELECT sequence FROM DrawingSequence WHERE yearMonth = ?").get(yearMonth) as { sequence: number } | undefined
      if (existing) {
        const next = existing.sequence + 1
        db.prepare("UPDATE DrawingSequence SET sequence = ? WHERE yearMonth = ?").run(next, yearMonth)
        return next
      } else {
        db.prepare("INSERT INTO DrawingSequence (id,yearMonth,sequence) VALUES (?,?,1)").run(nanoid(), yearMonth)
        return 1
      }
    })
    return run() as number
  },

  /**
   * Generate a reference number for non-drawing work items.
   * Format: PREFIX-YYYY-NNN  e.g. SV-2026-001
   * Prefixes: SV (Site Visit), SRV (Survey), INS (Inspection)
   */
  nextRefNumber(prefix: string): string {
    const year = new Date().getFullYear()
    const run = db.transaction((): number => {
      const existing = db.prepare("SELECT seq FROM RefSequence WHERE prefix = ? AND year = ?").get(prefix, year) as { seq: number } | undefined
      if (existing) {
        const next = existing.seq + 1
        db.prepare("UPDATE RefSequence SET seq = ? WHERE prefix = ? AND year = ?").run(next, prefix, year)
        return next
      } else {
        db.prepare("INSERT INTO RefSequence (id,prefix,year,seq) VALUES (?,?,?,1)").run(nanoid(), prefix, year)
        return 1
      }
    })
    const seq = run()
    return `${prefix}-${year}-${String(seq).padStart(3, "0")}`
  },

  currentSequence(yearMonth: string): number {
    const row = db.prepare("SELECT sequence FROM DrawingSequence WHERE yearMonth = ?").get(yearMonth) as { sequence: number } | undefined
    return row?.sequence ?? 0
  },

  /**
   * Scans every Job.drawingNumber in the database, extracts the YYMM key
   * and sequence number from each, and ensures the DrawingSequence counter
   * for that YYMM is at least as high as the highest number found. This
   * prevents duplicate drawing numbers after:
   *   - a database restore from backup
   *   - manual SQL inserts or data migration from an older system
   *   - a bulk spreadsheet import (called as a safety net after every import)
   *
   * Also reconciles RefSequence counters (SV/SRV/INS prefixes) the same way.
   *
   * Atomic: runs inside a single SQLite transaction. Idempotent: safe to
   * call repeatedly — it only ever raises counters, never lowers them.
   */
  syncFromExistingJobs(): { drawingFixups: number; refFixups: number } {
    let drawingFixups = 0
    let refFixups = 0

    db.transaction(() => {
      // ── Drawing numbers (YY/ORYX/MM/NNN) ──────────────────────
      const drawingRows = db.prepare(
        "SELECT drawingNumber FROM Job WHERE drawingNumber LIKE '%/ORYX/%'"
      ).all() as { drawingNumber: string }[]

      const maxByYearMonth = new Map<string, number>()
      for (const row of drawingRows) {
        const match = row.drawingNumber.match(/^(\d{2})\/ORYX\/(\d{2})\/(\d+)/)
        if (!match) continue
        const [, yy, mm, nnn] = match
        const key = `${yy}${mm}`
        const seq = parseInt(nnn, 10)
        const prev = maxByYearMonth.get(key) ?? 0
        if (seq > prev) maxByYearMonth.set(key, seq)
      }

      for (const [yearMonth, maxSeq] of maxByYearMonth) {
        const existing = db.prepare(
          "SELECT sequence FROM DrawingSequence WHERE yearMonth = ?"
        ).get(yearMonth) as { sequence: number } | undefined

        if (!existing) {
          db.prepare(
            "INSERT INTO DrawingSequence (id, yearMonth, sequence) VALUES (?, ?, ?)"
          ).run(nanoid(), yearMonth, maxSeq)
          drawingFixups++
        } else if (existing.sequence < maxSeq) {
          db.prepare(
            "UPDATE DrawingSequence SET sequence = ? WHERE yearMonth = ?"
          ).run(maxSeq, yearMonth)
          drawingFixups++
        }
      }

      // ── Reference numbers (PREFIX-YYYY-NNN) ───────────────────
      const refRows = db.prepare(
        "SELECT drawingNumber FROM Job WHERE drawingNumber LIKE '%-%-%'"
      ).all() as { drawingNumber: string }[]

      const maxByPrefixYear = new Map<string, number>()
      for (const row of refRows) {
        const match = row.drawingNumber.match(/^([A-Z]+)-(\d{4})-(\d+)$/)
        if (!match) continue
        const [, prefix, yearStr, nnn] = match
        const mapKey = `${prefix}||${yearStr}`
        const seq = parseInt(nnn, 10)
        const prev = maxByPrefixYear.get(mapKey) ?? 0
        if (seq > prev) maxByPrefixYear.set(mapKey, seq)
      }

      for (const [mapKey, maxSeq] of maxByPrefixYear) {
        const [prefix, yearStr] = mapKey.split("||")
        const year = parseInt(yearStr, 10)
        const existing = db.prepare(
          "SELECT seq FROM RefSequence WHERE prefix = ? AND year = ?"
        ).get(prefix, year) as { seq: number } | undefined

        if (!existing) {
          db.prepare(
            "INSERT INTO RefSequence (id, prefix, year, seq) VALUES (?, ?, ?, ?)"
          ).run(nanoid(), prefix, year, maxSeq)
          refFixups++
        } else if (existing.seq < maxSeq) {
          db.prepare(
            "UPDATE RefSequence SET seq = ? WHERE prefix = ? AND year = ?"
          ).run(maxSeq, prefix, year)
          refFixups++
        }
      }
    })()

    return { drawingFixups, refFixups }
  },
}

// Ensure drawing-number and reference-number sequence counters are at least
// as high as the highest values actually present in the Job table. Protects
// against duplicate numbers after a database restore, manual SQL inserts, or
// data migration from another system. Harmless no-op when already in sync.
;(function syncDrawingSequences() {
  const { drawingFixups, refFixups } = sequenceDb.syncFromExistingJobs()
  if (drawingFixups || refFixups) {
    console.log(`[syncDrawingSequences] Reconciled ${drawingFixups} drawing sequence(s) and ${refFixups} reference sequence(s) to match existing Job data.`)
  }
})()

// ── Billing handoff (Ready For Invoicing queue) ─────────────────────
// Replaces the Invoice/ExportBatch workflow. See the schema comment above
// BillingHandoff and PROJECT_OVERVIEW.md §19 for the full rationale.

export const billingHandoffDb = {
  findMany(opts: { cleared?: boolean; skip?: number; take?: number } = {}): BillingHandoffRow[] {
    const clauses: string[] = []
    if (opts.cleared === true)  clauses.push("clearedByAccountsAt IS NOT NULL")
    if (opts.cleared === false) clauses.push("clearedByAccountsAt IS NULL")
    const w = clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
    // Awaiting items are FIFO (oldest-added first, so accounts works through
    // a backlog in order); cleared items are most-recently-cleared first.
    const order  = opts.cleared === true ? "ORDER BY clearedByAccountsAt DESC" : "ORDER BY addedToBillingQueueAt ASC"
    const limit  = opts.take != null ? `LIMIT ${opts.take}` : ""
    const offset = opts.skip != null ? `OFFSET ${opts.skip}` : ""
    return db.prepare(`SELECT * FROM BillingHandoff ${w} ${order} ${limit} ${offset}`).all() as BillingHandoffRow[]
  },

  /** Batched fetch for building an export — preserves no particular order;
   *  callers needing input order should re-sort by id. */
  findManyByIds(ids: string[]): BillingHandoffRow[] {
    if (!ids.length) return []
    const placeholders = ids.map(() => "?").join(",")
    return db.prepare(`SELECT * FROM BillingHandoff WHERE id IN (${placeholders})`).all(...ids) as BillingHandoffRow[]
  },

  count(opts: { cleared?: boolean } = {}): number {
    const clauses: string[] = []
    if (opts.cleared === true)  clauses.push("clearedByAccountsAt IS NOT NULL")
    if (opts.cleared === false) clauses.push("clearedByAccountsAt IS NULL")
    const w = clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
    return (db.prepare(`SELECT COUNT(*) as n FROM BillingHandoff ${w}`).get() as { n: number }).n
  },

  findUnique(id: string): BillingHandoffRow | null {
    return (db.prepare("SELECT * FROM BillingHandoff WHERE id = ?").get(id) as BillingHandoffRow) ?? null
  },

  /** The job's *current, active* handoff (uncleared) — used by the job
   *  detail page to show whether this job is presently in the billing
   *  queue. A job can accumulate multiple historical (cleared) handoffs
   *  over its lifetime if it's completed, billed, reverted, and completed
   *  again, so this deliberately does not just grab "a" row — it filters
   *  to the one the partial unique index actually enforces uniqueness on.
   *  Use findHistoryBySourceJobId for the full lifetime list. */
  findBySourceJobId(jobId: string): BillingHandoffRow | null {
    return (db.prepare("SELECT * FROM BillingHandoff WHERE sourceJobId = ? AND clearedByAccountsAt IS NULL").get(jobId) as BillingHandoffRow) ?? null
  },

  /** Every handoff this job has ever had, newest first — typically one
   *  (the common case), but can be several for a job that's been
   *  completed, cleared, reverted, and completed again. */
  findHistoryBySourceJobId(jobId: string): BillingHandoffRow[] {
    return db.prepare("SELECT * FROM BillingHandoff WHERE sourceJobId = ? ORDER BY createdAt DESC").all(jobId) as BillingHandoffRow[]
  },

  /**
   * Builds the full Accounts Handover snapshot for one handoff — everything
   * accounts should need without coming back to the application. Evaluated
   * fresh at export time (per the "snapshot at the moment it is processed"
   * requirement) by joining live to Job/Client/StatusHistory/sibling
   * revisions, then frozen forever once written to BillingExportSnapshot.
   *
   * Fields that don't exist anywhere in this application's data model
   * (priority, a surveyor role distinct from designer, project lead, PO
   * number, cost centre, additional charges/variations as line items,
   * attachments) are explicitly marked rather than guessed at or left
   * silently blank — see `notTracked`.
   */
  buildAccountsHandoverSnapshot(handoff: BillingHandoffRow): AccountsHandoverSnapshot {
    const job    = jobDb.findUnique(handoff.sourceJobId)
    const client = job?.clientId ? clientDb.findUnique(job.clientId) : null
    const history = job ? historyDb.forJob(job.id) : []   // oldest first (ASC)
    const createdEntry   = history.find(h => h.fromStatus === null)
    const completedEntry = [...history].reverse().find(h => h.toStatus === "ISSUED")
    const lastEntry       = history[history.length - 1]   // most recent entry

    // Real, if modest, enhancement: if this job was converted from a quote,
    // the quote's free-text description is a genuine "Project Description"
    // — something this job's own record has no field for, but the
    // originating quote does. Falls back to null if there's no
    // quoteReference or the quote can't be found (e.g. very old data).
    const sourceQuote = job?.quoteReference ? quoteDb.findByNumber(job.quoteReference) : null

    const revisions = job ? jobDb.revisionsForJob(job.id) : []
    const revisionHistory = revisions.map(r => ({
      drawingNumber:  r.drawingNumber,
      revisionLetter: r.revisionLetter,
      status:         r.status,
      requestedDate:  r.dateCreated,
      completionDate: r.dateCompleted,
      description:    r.notes,
      charge:         r.quoteValue,
    }))
    const revisionChargesTotal = revisions.reduce((sum, r) => sum + (r.quoteValue ?? 0), 0)

    const notTracked = [
      "Billing Contact (distinct from Contact Name)",
      "Priority",
      "Request Source",
      "Internal References",
      "Purchase Order Number",
      "Cost Centre",
      "Variation Fees / Additional Charges (as distinct tracked line items — only free-text commercial notes exist)",
      "Payment Terms",
      "Surveyor (distinct role from Designer), Survey Date, Survey Notes, Survey References — this application does not track a separate survey workflow from the design workflow, even for itemType='SURVEY' jobs",
      "Attachments / Documents — this application has no file upload or document storage of any kind",
      "Description (distinct from Type of Works) for standard categories — only 'Other'-type jobs have a free-text description; Project Description above is populated only when this job was converted from a quote with its own description",
    ]

    return {
      handoffId:       handoff.id,
      billingEventType: handoff.billingEventType,
      client: {
        clientName:    client?.name ?? handoff.clientCompany,
        companyName:   client?.name ?? handoff.clientCompany,
        contactName:   client?.contactName ?? job?.requestedBy ?? null,
        contactEmail:  client?.email ?? null,
        contactTelephone: client?.phone ?? null,
        billingContact: null,   // not tracked — see notTracked
        billingAddress: client?.billingAddress ?? null,
        clientNotes:    client?.notes ?? null,
      },
      project: {
        jobNumber:      handoff.drawingNumber,
        drawingNumber:  handoff.drawingNumber,   // same underlying value — see interface comment
        // "Other" on its own tells accounts nothing useful — show the real
        // description that was captured for it instead, falling back to the
        // literal value only if somehow no description was ever recorded.
        projectName:    (job?.typeOfWorks ?? handoff.typeOfWorks) === "Other"
          ? (job?.customTypeDescription ?? handoff.customTypeDescription ?? "Other")
          : (job?.typeOfWorks ?? handoff.typeOfWorks ?? null),
        projectDescription: sourceQuote?.description ?? null,
        siteAddress:    job?.address ?? handoff.address,
        typeOfWorks:    job?.typeOfWorks ?? handoff.typeOfWorks ?? null,
        otherTypeDescription: (job?.typeOfWorks ?? handoff.typeOfWorks) === "Other"
          ? (job?.customTypeDescription ?? handoff.customTypeDescription ?? null)
          : null,
        allNotes:       job?.notes ?? null,
        jobStatus:      job?.status ?? "ISSUED",
        priority:       null,   // not tracked — see notTracked
        creationDate:   job?.dateCreated ?? handoff.createdAt,
        dueDate:        job?.requiredByDate ?? null,
        completionDate: handoff.completionDate,
      },
      request: {
        requestedBy:            job?.requestedBy ?? null,
        companyRequestingWorks: handoff.clientCompany,
        // Job.requestedDate exists as a column but the UI stopped showing or
        // setting it some time ago (see PROJECT_OVERVIEW.md §11) — it's
        // included here in case it's populated on older records, not
        // because it's reliably populated going forward.
        requestDate:            job?.requestedDate ?? null,
        requestSource:          null,   // not tracked — see notTracked
        internalReferences:     null,   // not tracked — see notTracked
        purchaseOrderNumber:    null,   // not tracked — see notTracked
        costCentre:             null,   // not tracked — see notTracked
      },
      commercial: {
        agreedFee:        handoff.quoteValue,
        quotedFee:        handoff.quoteValue,
        quoteReference:   job?.quoteReference ?? handoff.quoteReference ?? null,
        variationFees:    null,   // not tracked — see notTracked
        additionalCharges: null,  // not tracked — see notTracked
        revisionCharges:  revisions.length ? revisionChargesTotal : null,
        commercialNotes:  job?.commercialNotes ?? null,
        paymentTerms:     null,   // not tracked — see notTracked
      },
      design: {
        assignedDesigner:      handoff.designer,
        completedBy:           completedEntry?.changedBy ?? null,
        designCompletionDate:  handoff.completionDate,
        designNotes:           job?.notes ?? null,
        designReference:       handoff.drawingNumber,
      },
      survey: {
        assignedSurveyor: null,   // not tracked — see notTracked
        surveyDate:        null,
        surveyNotes:        null,
        surveyReferences:   null,
      },
      revisions: {
        revisionCount: revisions.length,
        history:       revisionHistory,
      },
      audit: {
        createdBy:        createdEntry?.changedBy ?? null,
        createdDate:      job?.dateCreated ?? handoff.createdAt,
        // Best-effort: the most recent recorded status-history entry, which
        // covers status changes, designer assignment, and similar tracked
        // events — not necessarily every field edit (e.g. editing notes or
        // address alone doesn't write a StatusHistory row).
        lastModifiedBy:   lastEntry?.changedBy ?? null,
        lastModifiedDate: job?.updatedAt ?? handoff.updatedAt,
        addedToQueueAt:   handoff.addedToBillingQueueAt,
        fullHistory:      history.map(h => ({
          fromStatus: h.fromStatus, toStatus: h.toStatus, changedBy: h.changedBy, changedAt: h.changedAt, note: h.note,
        })),
      },
      attachments: {
        note:  "This application has no file upload or document storage — no attachment metadata exists to export.",
        items: [] as { fileName: string; reference: string; uploadedAt: string }[],
      },
      notTracked,
    }
  },

  /**
   * Creates an Accounts Handover export batch for the given handoff ids:
   * builds and permanently stores a snapshot for each, marks each handoff
   * cleared and linked to the batch, and returns the batch plus the
   * snapshots (for building the XLSX response). All-or-nothing — if any
   * handoff is invalid or already cleared, nothing is written.
   */
  createExportBatch(data: { handoffIds: string[]; exportedBy: string; exportDate: string; notes?: string | null }): { batch: BillingExportBatchRow; snapshots: AccountsHandoverSnapshot[] } {
    if (!data.handoffIds.length) throw new Error("No items selected for export")

    const handoffs = this.findManyByIds(data.handoffIds)
    const byId = new Map(handoffs.map(h => [h.id, h]))
    for (const id of data.handoffIds) {
      const h = byId.get(id)
      if (!h) throw new Error(`Item ${id} not found`)
      if (h.clearedByAccountsAt) throw new Error(`${h.drawingNumber} has already been cleared`)
    }
    const orderedHandoffs = data.handoffIds.map(id => byId.get(id)!)

    const batchId     = nanoid()
    const batchNumber = sequenceDb.nextRefNumber("BATCH")
    const now         = nowIso()
    const snapshots = orderedHandoffs.map(h => this.buildAccountsHandoverSnapshot(h))

    db.transaction(() => {
      db.prepare(`
        INSERT INTO BillingExportBatch (id, batchNumber, exportDate, exportedBy, recordCount, notes, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(batchId, batchNumber, data.exportDate, data.exportedBy, orderedHandoffs.length, data.notes ?? null, now)

      orderedHandoffs.forEach((h, i) => {
        db.prepare(`
          INSERT INTO BillingExportSnapshot (id, batchId, handoffId, snapshotJson, createdAt)
          VALUES (?, ?, ?, ?, ?)
        `).run(nanoid(), batchId, h.id, JSON.stringify(snapshots[i]), now)

        db.prepare(`
          UPDATE BillingHandoff
          SET clearedByAccountsAt = ?, clearedBy = ?, exportBatchId = ?, notes = COALESCE(?, notes), "updatedAt" = ?
          WHERE id = ? AND clearedByAccountsAt IS NULL
        `).run(now, data.exportedBy, batchId, data.notes ?? null, now, h.id)
      })
    })()

    return { batch: this.findBatchUnique(batchId)!, snapshots }
  },

  findBatchUnique(id: string): BillingExportBatchRow | null {
    return (db.prepare("SELECT * FROM BillingExportBatch WHERE id = ?").get(id) as BillingExportBatchRow) ?? null
  },

  findBatches(opts: { skip?: number; take?: number } = {}): BillingExportBatchRow[] {
    const limit  = opts.take != null ? `LIMIT ${opts.take}` : ""
    const offset = opts.skip != null ? `OFFSET ${opts.skip}` : ""
    return db.prepare(`SELECT * FROM BillingExportBatch ORDER BY createdAt DESC ${limit} ${offset}`).all() as BillingExportBatchRow[]
  },

  handoffsForBatch(batchId: string): BillingHandoffRow[] {
    return db.prepare("SELECT * FROM BillingHandoff WHERE exportBatchId = ? ORDER BY drawingNumber ASC").all(batchId) as BillingHandoffRow[]
  },

  /** Re-loads the exact, frozen snapshots written for a batch — used to
   *  re-download a past export byte-for-byte, without touching live Job
   *  data (which may have changed since the export happened). */
  snapshotsForBatch(batchId: string): AccountsHandoverSnapshot[] {
    const rows = db.prepare(`
      SELECT bes.snapshotJson FROM BillingExportSnapshot bes
      JOIN BillingHandoff bh ON bh.id = bes.handoffId
      WHERE bes.batchId = ?
      ORDER BY bh.drawingNumber ASC
    `).all(batchId) as { snapshotJson: string }[]
    return rows.map(r => JSON.parse(r.snapshotJson) as AccountsHandoverSnapshot)
  },

  /** Summary for the dashboard KPI and /api/stats */
  stats(): { awaitingCount: number; awaitingValue: number; clearedCount: number } {
    const awaiting = db.prepare(
      "SELECT COUNT(*) as n, COALESCE(SUM(quoteValue),0) as v FROM BillingHandoff WHERE clearedByAccountsAt IS NULL"
    ).get() as { n: number; v: number }
    const clearedCount = (db.prepare(
      "SELECT COUNT(*) as n FROM BillingHandoff WHERE clearedByAccountsAt IS NOT NULL"
    ).get() as { n: number }).n
    return { awaitingCount: awaiting.n, awaitingValue: awaiting.v, clearedCount }
  },
}

// ── Commercial aggregates ────────────────────────────────────────
// Used by /api/stats to power the Dashboard's Admin-only "total quoted" /
// "total issued" glance figures (redacted for Engineers via
// canViewCommercialValues() in lib/permissions.ts). The Commercial report
// page that used to additionally surface a monthly breakdown and a
// jobs-by-value list has been removed — those functions went with it.

export const commercialDb = {
  totalQuotedValue(): number { return (db.prepare("SELECT COALESCE(SUM(quoteValue),0) as v FROM Job WHERE quoteValue > 0").get() as { v: number }).v },
  totalIssuedValue(): number { return (db.prepare("SELECT COALESCE(SUM(quoteValue),0) as v FROM Job WHERE status='ISSUED' AND quoteValue > 0").get() as { v: number }).v },
  avgJobValue():      number { return (db.prepare("SELECT COALESCE(AVG(quoteValue),0) as v FROM Job WHERE quoteValue > 0").get() as { v: number }).v },
}


// ── Client types ─────────────────────────────────────────────────

export interface ClientRow {
  id:             string
  name:           string
  nameLower:      string
  contactName:    string | null
  email:          string | null
  phone:          string | null
  billingAddress: string | null
  notes:          string | null
  accountCode:    string | null
  active:         number   // 1 = active, 0 = inactive/archived
  createdAt:      string
  updatedAt:      string
}

export interface CreateClientData {
  id:              string
  name:            string
  contactName?:    string | null
  email?:          string | null
  phone?:          string | null
  billingAddress?: string | null
  notes?:          string | null
  accountCode?:    string | null
}

export interface UpdateClientData {
  name?:           string
  contactName?:    string | null
  email?:          string | null
  phone?:          string | null
  billingAddress?: string | null
  notes?:          string | null
  accountCode?:    string | null
  active?:         number
}

// ── Client queries ────────────────────────────────────────────────

export const clientDb = {
  findMany(opts: { search?: string; activeOnly?: boolean; skip?: number; take?: number } = {}): ClientRow[] {
    const clauses: string[] = []
    const params:  unknown[] = []
    if (opts.search) {
      clauses.push("(nameLower LIKE ? OR contactName LIKE ? OR email LIKE ?)")
      const s = `%${opts.search.toLowerCase()}%`
      params.push(s, s, s)
    }
    if (opts.activeOnly) { clauses.push("active = 1") }
    const w      = clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
    const limit  = opts.take != null ? `LIMIT ${opts.take}` : ""
    const offset = opts.skip != null ? `OFFSET ${opts.skip}` : ""
    return db.prepare(`SELECT * FROM Client ${w} ORDER BY name ASC ${limit} ${offset}`)
             .all(...params) as ClientRow[]
  },

  /** Same as findMany, but adds activeJobCount and onHold via subqueries — feeds the clients
   *  list page so hold status and workload are visible without opening each client. */
  findManyWithMeta(opts: { search?: string; activeOnly?: boolean; skip?: number; take?: number } = {}): (ClientRow & { activeJobCount: number; onHold: boolean })[] {
    const clauses: string[] = []
    const params:  unknown[] = []
    if (opts.search) {
      clauses.push("(c.nameLower LIKE ? OR c.contactName LIKE ? OR c.email LIKE ?)")
      const s = `%${opts.search.toLowerCase()}%`
      params.push(s, s, s)
    }
    if (opts.activeOnly) { clauses.push("c.active = 1") }
    const w      = clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
    const limit  = opts.take != null ? `LIMIT ${opts.take}` : ""
    const offset = opts.skip != null ? `OFFSET ${opts.skip}` : ""
    const rows = db.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM Job j WHERE j.clientId = c.id AND j.status != 'ISSUED') as activeJobCount,
        (SELECT COUNT(*) FROM ClientHold h WHERE h.clientId = c.id AND h.status = 'ACTIVE') as onHoldCount
      FROM Client c ${w} ORDER BY c.name ASC ${limit} ${offset}
    `).all(...params) as (ClientRow & { activeJobCount: number; onHoldCount: number })[]
    return rows.map(({ onHoldCount, ...r }) => ({ ...r, onHold: onHoldCount > 0 }))
  },
  count(opts: { search?: string; activeOnly?: boolean } = {}): number {
    const clauses: string[] = []
    const params:  unknown[] = []
    if (opts.search) {
      clauses.push("(nameLower LIKE ? OR contactName LIKE ? OR email LIKE ?)")
      const s = `%${opts.search.toLowerCase()}%`
      params.push(s, s, s)
    }
    if (opts.activeOnly) { clauses.push("active = 1") }
    const w = clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
    return (db.prepare(`SELECT COUNT(*) as n FROM Client ${w}`).get(...params) as { n: number }).n
  },

  findUnique(id: string): ClientRow | null {
    return (db.prepare("SELECT * FROM Client WHERE id = ?").get(id) as ClientRow) ?? null
  },

  findByName(name: string): ClientRow | null {
    return (db.prepare("SELECT * FROM Client WHERE nameLower = ?").get(name.trim().toLowerCase()) as ClientRow) ?? null
  },

  /** Fuzzy name search — returns clients whose name contains any word of the query */
  search(q: string, limit = 10): ClientRow[] {
    const lower = q.trim().toLowerCase()
    if (!lower) return this.findMany({ activeOnly: true, take: limit })
    return db.prepare("SELECT * FROM Client WHERE nameLower LIKE ? AND active = 1 ORDER BY name ASC LIMIT ?")
             .all(`%${lower}%`, limit) as ClientRow[]
  },

  create(data: CreateClientData): ClientRow {
    const now = nowIso()
    db.prepare(`
      INSERT INTO Client (id,name,nameLower,contactName,email,phone,billingAddress,notes,accountCode,active,createdAt,updatedAt)
      VALUES (?,?,?,?,?,?,?,?,?,1,?,?)
    `).run(
      data.id, data.name.trim(), data.name.trim().toLowerCase(),
      data.contactName?.trim() || null, data.email?.trim() || null,
      data.phone?.trim() || null, data.billingAddress?.trim() || null,
      data.notes?.trim() || null, data.accountCode?.trim() || null, now, now
    )
    return this.findUnique(data.id)!
  },

  update(id: string, data: UpdateClientData): ClientRow | null {
    const existing = this.findUnique(id)
    if (!existing) return null
    const fields: string[] = []
    const params: unknown[] = []
    const isRename = data.name !== undefined && data.name.trim() !== existing.name
    if (data.name !== undefined) {
      fields.push('"name" = ?', '"nameLower" = ?')
      params.push(data.name.trim(), data.name.trim().toLowerCase())
    }
    const simple: (keyof UpdateClientData)[] = ["contactName","email","phone","billingAddress","notes","accountCode","active"]
    for (const k of simple) {
      if (data[k] !== undefined) { fields.push(`"${k}" = ?`); params.push(data[k] ?? null) }
    }
    if (!fields.length) return existing
    fields.push('"updatedAt" = ?'); params.push(nowIso(), id)
    db.transaction(() => {
      db.prepare(`UPDATE Client SET ${fields.join(", ")} WHERE id = ?`).run(...params)
      // clientCompany is a denormalized copy of Client.name kept on Job/Quote rows for
      // backwards-compatible filtering and display — see PROJECT_OVERVIEW.md §6. It must
      // never drift from the Client record once a row is linked via clientId.
      if (isRename) {
        const now = nowIso()
        db.prepare('UPDATE Job SET "clientCompany" = ?, "updatedAt" = ? WHERE clientId = ?')
          .run(data.name!.trim(), now, id)
        db.prepare('UPDATE Quote SET "clientCompany" = ?, "updatedAt" = ? WHERE clientId = ?')
          .run(data.name!.trim(), now, id)
      }
    })()
    return this.findUnique(id)
  },

  archive(id: string): ClientRow | null {
    return this.update(id, { active: 0 })
  },

  restore(id: string): ClientRow | null {
    return this.update(id, { active: 1 })
  },

  delete(id: string): boolean {
    return db.prepare("DELETE FROM Client WHERE id = ?").run(id).changes > 0
  },

  /** Stats for the client detail page */
  stats(clientId: string): {
    totalJobs:        number
    activeJobs:       number
    issuedJobs:       number
    totalRevisions:   number
    totalQuotedValue: number
    totalInvoicedValue: number
  } {
    const totalJobs          = (db.prepare("SELECT COUNT(*) as n FROM Job WHERE clientId = ?").get(clientId) as { n: number }).n
    const activeJobs         = (db.prepare("SELECT COUNT(*) as n FROM Job WHERE clientId = ? AND status NOT IN ('ISSUED')").get(clientId) as { n: number }).n
    const issuedJobs         = (db.prepare("SELECT COUNT(*) as n FROM Job WHERE clientId = ? AND status = 'ISSUED'").get(clientId) as { n: number }).n
    const totalRevisions     = (db.prepare("SELECT COUNT(*) as n FROM Job WHERE clientId = ? AND itemType = 'REVISION'").get(clientId) as { n: number }).n
    const totalQuotedValue   = (db.prepare("SELECT COALESCE(SUM(quoteValue),0) as v FROM Job WHERE clientId = ? AND quoteValue > 0").get(clientId) as { v: number }).v
    const totalInvoicedValue = (db.prepare("SELECT COALESCE(SUM(ii.value),0) as v FROM InvoiceItem ii JOIN Job j ON j.id = ii.jobId WHERE j.clientId = ?").get(clientId) as { v: number }).v
    return { totalJobs, activeJobs, issuedJobs, totalRevisions, totalQuotedValue, totalInvoicedValue }
  },

  /** Jobs for a client (all item types) */
  jobsForClient(clientId: string, limit = 50): JobRow[] {
    return db.prepare("SELECT * FROM Job WHERE clientId = ? ORDER BY createdAt DESC LIMIT ?")
             .all(clientId, limit) as JobRow[]
  },
}

// ── Client migration ──────────────────────────────────────────────
// Runs once: creates Client records from existing clientCompany strings,
// then back-populates Job.clientId. Idempotent.
;(function migrateClientsFromJobs() {
  const distinct = db.prepare(
    "SELECT DISTINCT clientCompany FROM Job WHERE clientCompany != '' AND clientId IS NULL ORDER BY clientCompany ASC"
  ).all() as { clientCompany: string }[]

  if (!distinct.length) return

  db.transaction(() => {
    for (const { clientCompany } of distinct) {
      const name = clientCompany.trim()
      if (!name) continue
      const nameLower = name.toLowerCase()
      const now = nowIso()

      // Find or create client record
      let client = db.prepare("SELECT id FROM Client WHERE nameLower = ?").get(nameLower) as { id: string } | undefined
      if (!client) {
        const newId = nanoid()
        db.prepare(`
          INSERT INTO Client (id,name,nameLower,active,createdAt,updatedAt)
          VALUES (?,?,?,1,?,?)
        `).run(newId, name, nameLower, now, now)
        client = { id: newId }
      }

      // Back-populate clientId on all matching jobs
      db.prepare("UPDATE Job SET clientId = ? WHERE clientCompany = ? AND clientId IS NULL")
        .run(client.id, clientCompany)
    }
  })()
})()


// ── ExportBatch types ─────────────────────────────────────────────

export interface ExportBatchRow {
  id:          string
  batchNumber: string
  exportDate:  string
  exportedBy:  string
  itemCount:   number
  totalValue:  number
  notes:       string | null
  createdAt:   string
}

export interface ExportBatchItemRow {
  id:            string
  batchId:       string
  jobId:         string
  drawingNumber: string
  clientCompany: string
  itemType:      string
  address:       string
  quoteValue:    number | null
  exportedAt:    string
}

// ── Export Batch queries ──────────────────────────────────────────

export const exportBatchDb = {
  /** Next batch number: BATCH-YYYY-NNN */
  nextBatchNumber(): string {
    const year = new Date().getFullYear()
    const run  = db.transaction((): number => {
      const existing = db.prepare("SELECT seq FROM RefSequence WHERE prefix = 'BATCH' AND year = ?").get(year) as { seq: number } | undefined
      if (existing) {
        const next = existing.seq + 1
        db.prepare("UPDATE RefSequence SET seq = ? WHERE prefix = 'BATCH' AND year = ?").run(next, year)
        return next
      } else {
        db.prepare("INSERT INTO RefSequence (id,prefix,year,seq) VALUES (?,?,?,1)").run(nanoid(), "BATCH", year)
        return 1
      }
    })
    return `BATCH-${year}-${String(run()).padStart(3, "0")}`
  },

  /**
   * Create an export batch for the given job IDs.
   * Marks each job with billingStatus = 'EXPORTED_TO_ACCOUNTS' and billingBatchId.
   * Returns the created batch and its items.
   * NEVER deletes records — full audit trail preserved.
   */
  createBatch(data: {
    jobIds:     string[]
    exportedBy: string
    exportDate: string
    notes?:     string | null
  }): { batch: ExportBatchRow; items: ExportBatchItemRow[] } {
    if (!data.jobIds.length) throw new Error("No jobs provided for export batch")

    const id          = nanoid()
    const batchNumber = this.nextBatchNumber()
    const now         = nowIso()

    // Fetch all jobs first to compute totals
    const jobs: JobRow[] = []
    for (const jobId of data.jobIds) {
      const j = jobDb.findUnique(jobId)
      if (!j) throw new Error(`Job ${jobId} not found`)
      if (j.status !== "ISSUED") throw new Error(`${j.drawingNumber} is not Issued`)
      if (j.billingStatus === "EXPORTED_TO_ACCOUNTS") throw new Error(`${j.drawingNumber} is already exported`)
      jobs.push(j)
    }

    const totalValue = jobs.reduce((sum, j) => sum + (j.quoteValue ?? 0), 0)
    const itemCount  = jobs.length

    db.transaction(() => {
      // Create batch header
      db.prepare(`
        INSERT INTO ExportBatch (id,batchNumber,exportDate,exportedBy,itemCount,totalValue,notes,createdAt)
        VALUES (?,?,?,?,?,?,?,?)
      `).run(id, batchNumber, data.exportDate, data.exportedBy, itemCount, totalValue, data.notes ?? null, now)

      // Create batch items + mark jobs
      for (const job of jobs) {
        db.prepare(`
          INSERT INTO ExportBatchItem (id,batchId,jobId,drawingNumber,clientCompany,itemType,address,quoteValue,exportedAt)
          VALUES (?,?,?,?,?,?,?,?,?)
        `).run(nanoid(), id, job.id, job.drawingNumber, job.clientCompany,
               job.itemType, job.address, job.quoteValue ?? null, now)

        db.prepare(`UPDATE Job SET billingStatus = 'EXPORTED_TO_ACCOUNTS', billingBatchId = ?, "updatedAt" = ? WHERE id = ?`)
          .run(id, now, job.id)

        // Audit trail on the job's status history
        db.prepare(`INSERT INTO StatusHistory (id,jobId,fromStatus,toStatus,changedBy,changedAt,note) VALUES (?,?,?,?,?,?,?)`)
          .run(nanoid(), job.id, "ISSUED", "ISSUED", data.exportedBy, now,
               `Exported to accounts: ${batchNumber}`)
      }
    })()

    const batch = this.findUnique(id)!
    const items = this.itemsForBatch(id)
    return { batch, items }
  },

  findMany(opts: { skip?: number; take?: number } = {}): ExportBatchRow[] {
    const limit  = opts.take != null ? `LIMIT ${opts.take}` : ""
    const offset = opts.skip != null ? `OFFSET ${opts.skip}` : ""
    return db.prepare(`SELECT * FROM ExportBatch ORDER BY createdAt DESC ${limit} ${offset}`)
             .all() as ExportBatchRow[]
  },

  count(): number {
    return (db.prepare("SELECT COUNT(*) as n FROM ExportBatch").get() as { n: number }).n
  },

  findUnique(id: string): ExportBatchRow | null {
    return (db.prepare("SELECT * FROM ExportBatch WHERE id = ?").get(id) as ExportBatchRow) ?? null
  },

  findByNumber(batchNumber: string): ExportBatchRow | null {
    return (db.prepare("SELECT * FROM ExportBatch WHERE batchNumber = ?").get(batchNumber) as ExportBatchRow) ?? null
  },

  itemsForBatch(batchId: string): ExportBatchItemRow[] {
    return db.prepare(
      "SELECT * FROM ExportBatchItem WHERE batchId = ? ORDER BY clientCompany ASC, drawingNumber ASC"
    ).all(batchId) as ExportBatchItemRow[]
  },

  /** Summary stats for dashboard */
  billingStats(): {
    pendingCount:   number
    pendingValue:   number
    exportedCount:  number
    exportedValue:  number
  } {
    const pending  = db.prepare(`
      SELECT COUNT(*) as n, COALESCE(SUM(quoteValue),0) as v
      FROM Job WHERE status = 'ISSUED' AND invoiceId IS NULL
        AND (billingStatus IS NULL OR billingStatus != 'EXPORTED_TO_ACCOUNTS')
    `).get() as { n: number; v: number }

    const exported = db.prepare(`
      SELECT COUNT(*) as n, COALESCE(SUM(quoteValue),0) as v
      FROM Job WHERE billingStatus = 'EXPORTED_TO_ACCOUNTS'
    `).get() as { n: number; v: number }

    return {
      pendingCount:  pending.n,
      pendingValue:  pending.v,
      exportedCount: exported.n,
      exportedValue: exported.v,
    }
  },
}


// ── Client Hold types ─────────────────────────────────────────────

export interface ClientHoldRow {
  id:            string
  clientId:      string
  status:        string   // 'ACTIVE' | 'REMOVED'
  reason:        string
  notes:         string | null
  addedBy:       string
  addedAt:       string
  removedBy:     string | null
  removedAt:     string | null
  removedReason: string | null
}

export interface ClientHoldWithClientRow extends ClientHoldRow {
  clientName:       string
  activeJobCount:   number
  quoteValueTotal:  number
}

// ── Client Hold queries ───────────────────────────────────────────

export const holdDb = {
  /** Active hold for a client, if any */
  activeHoldForClient(clientId: string): ClientHoldRow | null {
    return (db.prepare(
      "SELECT * FROM ClientHold WHERE clientId = ? AND status = 'ACTIVE' ORDER BY addedAt DESC LIMIT 1"
    ).get(clientId) as ClientHoldRow) ?? null
  },

  /** Batched version of activeHoldForClient for a list of ids — one query instead of N,
   *  for places like /api/clients/search that need to annotate many results at once. */
  activeHoldReasonsFor(clientIds: string[]): { clientId: string; reason: string }[] {
    if (!clientIds.length) return []
    const placeholders = clientIds.map(() => "?").join(",")
    return db.prepare(
      `SELECT clientId, reason FROM ClientHold WHERE status = 'ACTIVE' AND clientId IN (${placeholders})`
    ).all(...clientIds) as { clientId: string; reason: string }[]
  },

  /** Full hold history for a client */
  historyForClient(clientId: string): ClientHoldRow[] {
    return db.prepare(
      "SELECT * FROM ClientHold WHERE clientId = ? ORDER BY addedAt DESC"
    ).all(clientId) as ClientHoldRow[]
  },

  /** All active holds (for the hold list page) */
  allActive(): ClientHoldWithClientRow[] {
    return db.prepare(`
      SELECT ch.*,
             c.name         AS clientName,
             COALESCE((SELECT COUNT(*) FROM Job j WHERE j.clientId = ch.clientId AND j.status NOT IN ('ISSUED')), 0) AS activeJobCount,
             COALESCE((SELECT SUM(j.quoteValue) FROM Job j WHERE j.clientId = ch.clientId AND j.quoteValue > 0), 0)  AS quoteValueTotal
      FROM ClientHold ch
      JOIN Client c ON c.id = ch.clientId
      WHERE ch.status = 'ACTIVE'
      ORDER BY ch.addedAt DESC
    `).all() as ClientHoldWithClientRow[]
  },

  /** Count of clients currently on hold — for dashboard */
  activeCount(): number {
    return (db.prepare(
      "SELECT COUNT(DISTINCT clientId) as n FROM ClientHold WHERE status = 'ACTIVE'"
    ).get() as { n: number }).n
  },

  /** Place a client on hold — idempotent (skips if already active) */
  addHold(data: {
    clientId: string
    reason:   string
    notes?:   string | null
    addedBy:  string
  }): ClientHoldRow {
    // If there's already an active hold, update it
    const existing = this.activeHoldForClient(data.clientId)
    const now = nowIso()
    if (existing) {
      db.prepare(
        "UPDATE ClientHold SET reason = ?, notes = ?, addedBy = ?, addedAt = ? WHERE id = ?"
      ).run(data.reason.trim(), data.notes?.trim() ?? null, data.addedBy, now, existing.id)
      return db.prepare("SELECT * FROM ClientHold WHERE id = ?").get(existing.id) as ClientHoldRow
    }
    const id = nanoid()
    db.prepare(`
      INSERT INTO ClientHold (id,clientId,status,reason,notes,addedBy,addedAt)
      VALUES (?,?,  'ACTIVE',?,?,?,?)
    `).run(id, data.clientId, data.reason.trim(), data.notes?.trim() ?? null, data.addedBy, now)
    return db.prepare("SELECT * FROM ClientHold WHERE id = ?").get(id) as ClientHoldRow
  },

  /** Remove a client from hold (sets status=REMOVED, never deletes) */
  removeHold(data: {
    clientId:      string
    removedBy:     string
    removedReason?: string | null
  }): ClientHoldRow | null {
    const existing = this.activeHoldForClient(data.clientId)
    if (!existing) return null
    const now = nowIso()
    db.prepare(`
      UPDATE ClientHold
      SET status = 'REMOVED', removedBy = ?, removedAt = ?, removedReason = ?
      WHERE id = ?
    `).run(data.removedBy, now, data.removedReason?.trim() ?? null, existing.id)
    return db.prepare("SELECT * FROM ClientHold WHERE id = ?").get(existing.id) as ClientHoldRow
  },
}



// ── Health check ──────────────────────────────────────────────────

export function dbHealthCheck() {
  try {
    const jobs    = (db.prepare("SELECT COUNT(*) as n FROM Job").get() as { n: number }).n
    const history = (db.prepare("SELECT COUNT(*) as n FROM StatusHistory").get() as { n: number }).n
    return { ok: true, jobCount: jobs, historyCount: history, path: DB_PATH }
  } catch {
    return { ok: false, jobCount: -1, historyCount: -1, path: DB_PATH }
  }
}

export { db }

// ── Quote types ───────────────────────────────────────────────────

export interface QuoteRow {
  id:            string
  quoteNumber:   string
  clientId:      string | null
  clientCompany: string
  contactName:   string | null
  address:       string
  description:   string
  quoteValue:    number
  quoteDate:     string
  expiryDate:    string | null
  status:        string   // DRAFT | SENT | ACCEPTED | REJECTED | EXPIRED
  notes:         string | null
  jobId:         string | null
  createdBy:     string
  pdfPath:       string | null
  preparedBy:    string | null
  /** NULL = no VAT breakdown on the PDF (single total, old behaviour).
   *  A number (e.g. 20) shows the Subtotal/Taxable/VAT rate/VAT due/TOTAL
   *  breakdown. See addMissingQuoteColumns()'s comment for the assumption
   *  this rests on: quoteValue itself is treated as the VAT-exclusive
   *  subtotal when a rate is set, matching the reference template's
   *  Subtotal === Taxable presentation. */
  vatRate:       number | null
  createdAt:     string
  updatedAt:     string
}

export interface CreateQuoteData {
  clientId?:     string | null
  clientCompany: string
  contactName?:  string | null
  address:       string
  description:   string
  quoteValue:    number
  quoteDate:     string
  expiryDate?:   string | null
  status?:       string
  notes?:        string | null
  createdBy?:    string
  vatRate?:      number | null
}

export interface UpdateQuoteData {
  clientId?:      string | null
  clientCompany?: string
  contactName?:   string | null
  address?:       string
  description?:   string
  quoteValue?:    number
  quoteDate?:     string
  expiryDate?:    string | null
  status?:        string
  notes?:         string | null
  jobId?:         string | null
  pdfPath?:       string | null
  preparedBy?:    string | null
  vatRate?:       number | null
}

export interface QuoteLineItemRow {
  id: string; quoteId: string; description: string; amount: number
  vatApplicable: number; sortOrder: number; createdAt: string
}

export interface CreateQuoteLineItemData {
  description: string; amount: number; vatApplicable?: boolean; sortOrder?: number
}

// ── Quote queries ─────────────────────────────────────────────────

export const quoteLineItemDb = {
  findForQuote(quoteId: string): QuoteLineItemRow[] {
    return db.prepare("SELECT * FROM QuoteLineItem WHERE quoteId = ? ORDER BY sortOrder ASC, createdAt ASC").all(quoteId) as QuoteLineItemRow[]
  },

  /** Replaces every line item for a quote in one go — simplest correct
   *  semantics for "save this quote's line items" from a form that submits
   *  the whole list at once; avoids needing a separate add/remove/reorder
   *  API for what's edited as a single unit in the UI. */
  replaceForQuote(quoteId: string, items: CreateQuoteLineItemData[]) {
    db.transaction(() => {
      db.prepare("DELETE FROM QuoteLineItem WHERE quoteId = ?").run(quoteId)
      items.forEach((item, i) => {
        db.prepare(`
          INSERT INTO QuoteLineItem (id, quoteId, description, amount, vatApplicable, sortOrder, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(nanoid(), quoteId, item.description.trim(), item.amount, item.vatApplicable === false ? 0 : 1, item.sortOrder ?? i, nowIso())
      })
    })()
  },
}

export const quoteDb = {
  findByNumber(quoteNumber: string): QuoteRow | null {
    return (db.prepare("SELECT * FROM Quote WHERE quoteNumber = ?").get(quoteNumber) as QuoteRow) ?? null
  },

  findMany(opts: { search?: string; status?: string; clientId?: string; skip?: number; take?: number } = {}): QuoteRow[] {
    const clauses: string[] = []
    const params: unknown[] = []
    if (opts.search) {
      const pat = `%${opts.search}%`
      clauses.push("(quoteNumber LIKE ? OR clientCompany LIKE ? OR address LIKE ? OR description LIKE ?)")
      params.push(pat, pat, pat, pat)
    }
    if (opts.status)   { clauses.push("status = ?");   params.push(opts.status) }
    if (opts.clientId) { clauses.push("clientId = ?"); params.push(opts.clientId) }
    const w      = clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
    const limit  = opts.take != null ? `LIMIT ${opts.take}` : ""
    const offset = opts.skip != null ? `OFFSET ${opts.skip}` : ""
    return db.prepare(`SELECT * FROM Quote ${w} ORDER BY createdAt DESC ${limit} ${offset}`).all(...params) as QuoteRow[]
  },

  count(opts: { search?: string; status?: string; clientId?: string } = {}): number {
    const clauses: string[] = []
    const params: unknown[] = []
    if (opts.search) {
      const pat = `%${opts.search}%`
      clauses.push("(quoteNumber LIKE ? OR clientCompany LIKE ? OR address LIKE ? OR description LIKE ?)")
      params.push(pat, pat, pat, pat)
    }
    if (opts.status)   { clauses.push("status = ?");   params.push(opts.status) }
    if (opts.clientId) { clauses.push("clientId = ?"); params.push(opts.clientId) }
    const w = clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
    return (db.prepare(`SELECT COUNT(*) as n FROM Quote ${w}`).get(...params) as { n: number }).n
  },

  findUnique(id: string): QuoteRow | null {
    return (db.prepare("SELECT * FROM Quote WHERE id = ?").get(id) as QuoteRow) ?? null
  },

  create(data: CreateQuoteData): QuoteRow {
    const id          = nanoid()
    const quoteNumber = sequenceDb.nextRefNumber("Q")
    const now         = nowIso()
    db.prepare(`
      INSERT INTO Quote
        (id,quoteNumber,clientId,clientCompany,contactName,address,description,
         quoteValue,quoteDate,expiryDate,status,notes,createdBy,vatRate,createdAt,updatedAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      id, quoteNumber,
      data.clientId ?? null,
      data.clientCompany.trim(),
      data.contactName?.trim() || null,
      data.address.trim(),
      data.description.trim(),
      data.quoteValue,
      data.quoteDate,
      data.expiryDate ?? null,
      data.status ?? "DRAFT",
      data.notes?.trim() || null,
      data.createdBy ?? "System",
      data.vatRate ?? null,
      now, now
    )
    return this.findUnique(id)!
  },

  update(id: string, data: UpdateQuoteData): QuoteRow | null {
    const existing = this.findUnique(id)
    if (!existing) return null
    const fields: string[] = []
    const params: unknown[] = []
    const cols: (keyof UpdateQuoteData)[] = [
      "clientId","clientCompany","contactName","address","description",
      "quoteValue","quoteDate","expiryDate","status","notes","jobId",
      "pdfPath","preparedBy","vatRate",
    ]
    for (const k of cols) {
      if (data[k] !== undefined) { fields.push(`"${k}" = ?`); params.push(data[k] ?? null) }
    }
    if (!fields.length) return existing
    fields.push('"updatedAt" = ?')
    params.push(nowIso(), id)
    db.prepare(`UPDATE Quote SET ${fields.join(", ")} WHERE id = ?`).run(...params)
    return this.findUnique(id)
  },

  delete(id: string): boolean {
    return db.prepare("DELETE FROM Quote WHERE id = ?").run(id).changes > 0
  },

  stats(): {
    total:          number
    draft:          number
    sent:           number
    accepted:       number
    rejected:       number
    expired:        number
    totalValue:     number
    acceptedValue:  number
    conversionRate: number
  } {
    const rows = db.prepare(
      "SELECT status, COUNT(*) as n, COALESCE(SUM(quoteValue),0) as v FROM Quote GROUP BY status"
    ).all() as { status: string; n: number; v: number }[]
    const cnt = (s: string) => rows.find(r => r.status === s)?.n ?? 0
    const val = (s: string) => rows.find(r => r.status === s)?.v ?? 0
    const accepted = cnt("ACCEPTED")
    const rejected = cnt("REJECTED")
    const decided  = accepted + rejected
    return {
      total:          rows.reduce((a, b) => a + b.n, 0),
      draft:          cnt("DRAFT"),
      sent:           cnt("SENT"),
      accepted,
      rejected,
      expired:        cnt("EXPIRED"),
      totalValue:     rows.reduce((a, b) => a + b.v, 0),
      acceptedValue:  val("ACCEPTED"),
      conversionRate: decided > 0 ? accepted / decided : 0,
    }
  },
}

// ── Users ────────────────────────────────────────────────────────────
// Minimal user directory backing the role-based permissions system.
// There is no password/session here yet — see lib/auth.ts for the
// pre-authentication "switch user" seam that real login will replace
// without needing to touch this table or these queries.
export const userDb = {
  findMany(opts: { activeOnly?: boolean } = {}): UserRow[] {
    const where = opts.activeOnly ? "WHERE active = 1" : ""
    return db.prepare(`SELECT * FROM User ${where} ORDER BY name ASC`).all() as UserRow[]
  },

  findUnique(id: string): UserRow | null {
    return (db.prepare("SELECT * FROM User WHERE id = ?").get(id) as UserRow) ?? null
  },

  findByEmail(email: string): UserRow | null {
    const lower = email.trim().toLowerCase()
    if (!lower) return null
    return (db.prepare("SELECT * FROM User WHERE emailLower = ?").get(lower) as UserRow) ?? null
  },

  count(opts: { activeOnly?: boolean } = {}): number {
    const where = opts.activeOnly ? "WHERE active = 1" : ""
    return (db.prepare(`SELECT COUNT(*) as n FROM User ${where}`).get() as { n: number }).n
  },

  /** Count active users with the ADMIN role — used to stop the last admin being demoted/disabled */
  activeAdminCount(): number {
    return (db.prepare("SELECT COUNT(*) as n FROM User WHERE role = 'ADMIN' AND active = 1").get() as { n: number }).n
  },

  create(data: CreateUserData): UserRow {
    const now   = nowIso()
    const email = data.email?.trim() || null
    db.prepare(`
      INSERT INTO User (id,name,email,emailLower,role,active,passwordHash,mustChangePassword,createdAt,updatedAt)
      VALUES (?,?,?,?,?,1,?,?,?,?)
    `).run(
      data.id, data.name.trim(), email, email?.toLowerCase() ?? null,
      data.role ?? "ENGINEER", data.passwordHash ?? null, data.mustChangePassword ?? 0,
      now, now,
    )
    return this.findUnique(data.id)!
  },

  update(id: string, data: UpdateUserData): UserRow | null {
    const existing = this.findUnique(id)
    if (!existing) return null
    const fields: string[] = []
    const params: unknown[] = []
    if (data.name !== undefined) { fields.push('"name" = ?'); params.push(data.name.trim()) }
    if (data.email !== undefined) {
      const email = data.email?.trim() || null
      fields.push('"email" = ?', '"emailLower" = ?')
      params.push(email, email?.toLowerCase() ?? null)
    }
    if (data.role               !== undefined) { fields.push('"role" = ?');               params.push(data.role) }
    if (data.active             !== undefined) { fields.push('"active" = ?');             params.push(data.active) }
    if (data.passwordHash       !== undefined) { fields.push('"passwordHash" = ?');       params.push(data.passwordHash) }
    if (data.mustChangePassword !== undefined) { fields.push('"mustChangePassword" = ?'); params.push(data.mustChangePassword) }
    if (!fields.length) return existing
    fields.push('"updatedAt" = ?'); params.push(nowIso(), id)
    db.prepare(`UPDATE User SET ${fields.join(", ")} WHERE id = ?`).run(...params)
    return this.findUnique(id)
  },

  delete(id: string): boolean {
    return db.prepare("DELETE FROM User WHERE id = ?").run(id).changes > 0
  },
}

/** Wipes all jobs, clients, quotes, billing data, and sequences. Preserves users. */
export function resetAllData(): { jobCount: number; clientCount: number; quoteCount: number } {
  return db.transaction(() => {
    const jobCount    = (db.prepare("SELECT COUNT(*) as n FROM Job").get()    as { n: number }).n
    const clientCount = (db.prepare("SELECT COUNT(*) as n FROM Client").get() as { n: number }).n
    const quoteCount  = (db.prepare("SELECT COUNT(*) as n FROM Quote").get()  as { n: number }).n

    db.prepare("DELETE FROM CalendarAssignment").run()
    db.prepare("DELETE FROM CalendarEvent").run()
    db.prepare("DELETE FROM BillingExportSnapshot").run()
    db.prepare("DELETE FROM BillingExportBatch").run()
    db.prepare("DELETE FROM BillingHandoff").run()
    db.prepare("DELETE FROM StatusHistory").run()
    db.prepare("DELETE FROM TypeOfWorksMigrationLog").run()
    db.prepare("DELETE FROM QuoteLineItem").run()
    db.prepare("DELETE FROM Quote").run()
    db.prepare("DELETE FROM InvoiceItem").run()
    db.prepare("DELETE FROM Invoice").run()
    db.prepare("DELETE FROM InvoiceSequence").run()
    db.prepare("DELETE FROM ExportBatchItem").run()
    db.prepare("DELETE FROM ExportBatch").run()
    db.prepare("DELETE FROM Job").run()
    db.prepare("DELETE FROM DrawingSequence").run()
    db.prepare("DELETE FROM RefSequence").run()
    db.prepare("DELETE FROM ClientHold").run()
    db.prepare("DELETE FROM Client").run()

    return { jobCount, clientCount, quoteCount }
  })()
}

// ── Backup system ────────────────────────────────────────────────

export type BackupStatus  = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED"
export type BackupTrigger = "MANUAL" | "SCHEDULED" | "PRE_RESTORE_SAFETY" | "RETRY"

export interface BackupJobRow {
  id: string
  status: BackupStatus
  trigger: BackupTrigger
  triggeredBy: string
  triggeredByName: string
  folderName: string
  startedAt: string
  completedAt: string | null
  durationMs: number | null
  sizeBytes: number | null
  checksum: string | null
  rowCountsJson: string | null
  errorMessage: string | null
  retryOfId: string | null
  fileDeletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateBackupJobData {
  id: string; folderName: string; trigger: BackupTrigger
  triggeredBy: string; triggeredByName: string
  retryOfId?: string | null
}

export const backupJobDb = {
  create(data: CreateBackupJobData): BackupJobRow {
    const now = nowIso()
    db.prepare(`
      INSERT INTO BackupJob (id, status, trigger, triggeredBy, triggeredByName, folderName, startedAt, retryOfId, createdAt, updatedAt)
      VALUES (?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(data.id, data.trigger, data.triggeredBy, data.triggeredByName, data.folderName, now, data.retryOfId ?? null, now, now)
    return this.findUnique(data.id)!
  },

  findUnique(id: string): BackupJobRow | null {
    return (db.prepare("SELECT * FROM BackupJob WHERE id = ?").get(id) as BackupJobRow) ?? null
  },

  findMany(opts: { take?: number } = {}): BackupJobRow[] {
    const limit = opts.take != null ? `LIMIT ${opts.take}` : ""
    return db.prepare(`SELECT * FROM BackupJob ORDER BY createdAt DESC ${limit}`).all() as BackupJobRow[]
  },

  /** Most recent COMPLETED backup whose file hasn't been pruned — what
   *  "Download Latest Backup" actually means. */
  findLatestCompleted(): BackupJobRow | null {
    return (db.prepare(
      "SELECT * FROM BackupJob WHERE status = 'COMPLETED' AND fileDeletedAt IS NULL ORDER BY completedAt DESC LIMIT 1"
    ).get() as BackupJobRow) ?? null
  },

  markRunning(id: string) {
    const now = nowIso()
    db.prepare("UPDATE BackupJob SET status = 'RUNNING', updatedAt = ? WHERE id = ?").run(now, id)
  },

  markCompleted(id: string, data: { durationMs: number; sizeBytes: number; checksum: string; rowCounts: Record<string, number> }) {
    const now = nowIso()
    db.prepare(`
      UPDATE BackupJob SET status = 'COMPLETED', completedAt = ?, durationMs = ?, sizeBytes = ?, checksum = ?, rowCountsJson = ?, updatedAt = ?
      WHERE id = ?
    `).run(now, data.durationMs, data.sizeBytes, data.checksum, JSON.stringify(data.rowCounts), now, id)
  },

  markFailed(id: string, errorMessage: string) {
    const now = nowIso()
    db.prepare("UPDATE BackupJob SET status = 'FAILED', errorMessage = ?, completedAt = ?, updatedAt = ? WHERE id = ?")
      .run(errorMessage, now, now, id)
  },

  markFileDeleted(id: string) {
    const now = nowIso()
    db.prepare("UPDATE BackupJob SET fileDeletedAt = ?, updatedAt = ? WHERE id = ?").run(now, now, id)
  },

  /** Completed backups beyond the retention count, oldest first — what
   *  the retention-cleanup job actually deletes the files for. Never
   *  deletes the BackupJob row itself, only flags fileDeletedAt later. */
  findBeyondRetention(keepCount: number): BackupJobRow[] {
    return db.prepare(`
      SELECT * FROM BackupJob
      WHERE status = 'COMPLETED' AND fileDeletedAt IS NULL
      ORDER BY completedAt DESC
    `).all().slice(keepCount) as BackupJobRow[]
  },
}

export interface BackupAuditLogRow {
  id: string; action: string; backupId: string | null
  userId: string; userName: string; detail: string | null; createdAt: string
}

export const backupAuditDb = {
  log(data: { action: string; backupId?: string | null; userId: string; userName: string; detail?: string | null }) {
    db.prepare(`
      INSERT INTO BackupAuditLog (id, action, backupId, userId, userName, detail, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(nanoid(), data.action, data.backupId ?? null, data.userId, data.userName, data.detail ?? null, nowIso())
  },

  findMany(opts: { take?: number } = {}): BackupAuditLogRow[] {
    const limit = opts.take != null ? `LIMIT ${opts.take}` : ""
    return db.prepare(`SELECT * FROM BackupAuditLog ORDER BY createdAt DESC ${limit}`).all() as BackupAuditLogRow[]
  },

  findForBackup(backupId: string): BackupAuditLogRow[] {
    return db.prepare("SELECT * FROM BackupAuditLog WHERE backupId = ? ORDER BY createdAt ASC").all(backupId) as BackupAuditLogRow[]
  },
}

// ── Calendar ────────────────────────────────────────────────────────

export interface EventCategoryRow {
  id: string; name: string; color: string; icon: string | null
}

export interface CalendarEventRow {
  id: string; title: string; description: string | null
  categoryId: string; startDate: string; endDate: string; allDay: number
  location: string | null; priority: string; status: string
  jobId: string | null; clientId: string | null
  createdBy: string; createdAt: string; updatedAt: string
}

export interface CalendarEventWithDetails extends CalendarEventRow {
  categoryName: string; categoryColor: string
  assignees: { userId: string; userName: string }[]
  jobDrawingNumber: string | null
  clientName: string | null
  createdByName: string
}

export interface CreateCalendarEventData {
  id: string; title: string; description?: string | null
  categoryId: string; startDate: string; endDate: string; allDay?: number
  location?: string | null; priority?: string; status?: string
  jobId?: string | null; clientId?: string | null; createdBy: string
}

export interface UpdateCalendarEventData {
  title?: string; description?: string | null
  categoryId?: string; startDate?: string; endDate?: string; allDay?: number
  location?: string | null; priority?: string; status?: string
  jobId?: string | null; clientId?: string | null
}

export const calendarDb = {
  categories(): EventCategoryRow[] {
    return db.prepare("SELECT * FROM EventCategory ORDER BY name ASC").all() as EventCategoryRow[]
  },

  findMany(opts: { from: string; to: string; userId?: string; categoryId?: string; jobId?: string; clientId?: string }): CalendarEventWithDetails[] {
    const clauses = ["e.startDate <= ? AND e.endDate >= ?"]
    const params: unknown[] = [opts.to, opts.from]

    if (opts.categoryId) { clauses.push("e.categoryId = ?"); params.push(opts.categoryId) }
    if (opts.jobId)      { clauses.push("e.jobId = ?");      params.push(opts.jobId) }
    if (opts.clientId)   { clauses.push("e.clientId = ?");   params.push(opts.clientId) }
    if (opts.userId) {
      clauses.push("EXISTS (SELECT 1 FROM CalendarAssignment ca WHERE ca.eventId = e.id AND ca.userId = ?)")
      params.push(opts.userId)
    }

    const rows = db.prepare(`
      SELECT e.*, ec.name as categoryName, ec.color as categoryColor,
             j.drawingNumber as jobDrawingNumber, c.name as clientName,
             u.name as createdByName
      FROM CalendarEvent e
      LEFT JOIN EventCategory ec ON ec.id = e.categoryId
      LEFT JOIN Job j ON j.id = e.jobId
      LEFT JOIN Client c ON c.id = e.clientId
      LEFT JOIN User u ON u.id = e.createdBy
      WHERE ${clauses.join(" AND ")}
      ORDER BY e.startDate ASC, e.title ASC
    `).all(...params) as (CalendarEventRow & { categoryName: string; categoryColor: string; jobDrawingNumber: string | null; clientName: string | null; createdByName: string })[]

    return rows.map(r => ({ ...r, assignees: this.getAssignees(r.id) }))
  },

  findUnique(id: string): CalendarEventWithDetails | null {
    const row = db.prepare(`
      SELECT e.*, ec.name as categoryName, ec.color as categoryColor,
             j.drawingNumber as jobDrawingNumber, c.name as clientName,
             u.name as createdByName
      FROM CalendarEvent e
      LEFT JOIN EventCategory ec ON ec.id = e.categoryId
      LEFT JOIN Job j ON j.id = e.jobId
      LEFT JOIN Client c ON c.id = e.clientId
      LEFT JOIN User u ON u.id = e.createdBy
      WHERE e.id = ?
    `).get(id) as (CalendarEventRow & { categoryName: string; categoryColor: string; jobDrawingNumber: string | null; clientName: string | null; createdByName: string }) | undefined
    if (!row) return null
    return { ...row, assignees: this.getAssignees(id) }
  },

  create(data: CreateCalendarEventData): CalendarEventRow {
    const now = nowIso()
    db.prepare(`
      INSERT INTO CalendarEvent (id, title, description, categoryId, startDate, endDate, allDay, location, priority, status, jobId, clientId, createdBy, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.id, data.title.trim(), data.description?.trim() || null,
      data.categoryId, data.startDate, data.endDate, data.allDay ?? 1,
      data.location?.trim() || null, data.priority ?? "MEDIUM", data.status ?? "SCHEDULED",
      data.jobId ?? null, data.clientId ?? null, data.createdBy, now, now,
    )
    return db.prepare("SELECT * FROM CalendarEvent WHERE id = ?").get(data.id) as CalendarEventRow
  },

  update(id: string, data: UpdateCalendarEventData): CalendarEventRow | null {
    const existing = db.prepare("SELECT * FROM CalendarEvent WHERE id = ?").get(id) as CalendarEventRow | undefined
    if (!existing) return null
    const fields: string[] = []
    const params: unknown[] = []
    if (data.title       !== undefined) { fields.push('"title" = ?');       params.push(data.title.trim()) }
    if (data.description !== undefined) { fields.push('"description" = ?'); params.push(data.description?.trim() || null) }
    if (data.categoryId  !== undefined) { fields.push('"categoryId" = ?');  params.push(data.categoryId) }
    if (data.startDate   !== undefined) { fields.push('"startDate" = ?');   params.push(data.startDate) }
    if (data.endDate     !== undefined) { fields.push('"endDate" = ?');     params.push(data.endDate) }
    if (data.allDay      !== undefined) { fields.push('"allDay" = ?');      params.push(data.allDay) }
    if (data.location    !== undefined) { fields.push('"location" = ?');    params.push(data.location?.trim() || null) }
    if (data.priority    !== undefined) { fields.push('"priority" = ?');    params.push(data.priority) }
    if (data.status      !== undefined) { fields.push('"status" = ?');      params.push(data.status) }
    if (data.jobId       !== undefined) { fields.push('"jobId" = ?');       params.push(data.jobId) }
    if (data.clientId    !== undefined) { fields.push('"clientId" = ?');    params.push(data.clientId) }
    if (!fields.length) return existing
    fields.push('"updatedAt" = ?'); params.push(nowIso(), id)
    db.prepare(`UPDATE CalendarEvent SET ${fields.join(", ")} WHERE id = ?`).run(...params)
    return db.prepare("SELECT * FROM CalendarEvent WHERE id = ?").get(id) as CalendarEventRow
  },

  delete(id: string): boolean {
    return db.prepare("DELETE FROM CalendarEvent WHERE id = ?").run(id).changes > 0
  },

  getAssignees(eventId: string): { userId: string; userName: string }[] {
    return db.prepare(`
      SELECT ca.userId, u.name as userName
      FROM CalendarAssignment ca
      JOIN User u ON u.id = ca.userId
      WHERE ca.eventId = ?
      ORDER BY u.name ASC
    `).all(eventId) as { userId: string; userName: string }[]
  },

  setAssignees(eventId: string, userIds: string[]): void {
    db.transaction(() => {
      db.prepare("DELETE FROM CalendarAssignment WHERE eventId = ?").run(eventId)
      const insert = db.prepare("INSERT INTO CalendarAssignment (id, eventId, userId) VALUES (?, ?, ?)")
      for (const uid of userIds) {
        insert.run(nanoid(), eventId, uid)
      }
    })()
  },
}

// ── Identity switch audit log ───────────────────────────────────────

export type IdentitySwitchAction = "SESSION_STARTED" | "IMPERSONATION_STARTED" | "IMPERSONATION_ENDED" | "IMPERSONATION_REJECTED" | "LOGOUT"

export interface IdentitySwitchLogRow {
  id: string; action: IdentitySwitchAction
  realUserId: string | null; realUserName: string | null
  targetUserId: string | null; targetUserName: string | null
  detail: string | null; createdAt: string
}

export const identitySwitchLogDb = {
  log(data: {
    action: IdentitySwitchAction
    realUserId?: string | null; realUserName?: string | null
    targetUserId?: string | null; targetUserName?: string | null
    detail?: string | null
  }) {
    db.prepare(`
      INSERT INTO IdentitySwitchLog (id, action, realUserId, realUserName, targetUserId, targetUserName, detail, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      nanoid(), data.action,
      data.realUserId ?? null, data.realUserName ?? null,
      data.targetUserId ?? null, data.targetUserName ?? null,
      data.detail ?? null, nowIso(),
    )
  },

  findMany(opts: { take?: number } = {}): IdentitySwitchLogRow[] {
    const limit = opts.take != null ? `LIMIT ${opts.take}` : ""
    return db.prepare(`SELECT * FROM IdentitySwitchLog ORDER BY createdAt DESC ${limit}`).all() as IdentitySwitchLogRow[]
  },

  /** Every impersonation event (started/ended/rejected) involving a given
   *  real user — either as the admin doing the impersonating or as
   *  whoever was switched away from. Used for the Users page's audit view. */
  findForUser(userId: string, opts: { take?: number } = {}): IdentitySwitchLogRow[] {
    const limit = opts.take != null ? `LIMIT ${opts.take}` : ""
    return db.prepare(
      `SELECT * FROM IdentitySwitchLog WHERE realUserId = ? OR targetUserId = ? ORDER BY createdAt DESC ${limit}`
    ).all(userId, userId) as IdentitySwitchLogRow[]
  },
}
