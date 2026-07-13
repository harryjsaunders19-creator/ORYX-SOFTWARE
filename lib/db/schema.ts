/**
 * lib/db/schema.ts — table definitions and startup migrations.
 * Side-effect module: imported once at app startup via lib/db/index.ts.
 */
import { db, DB_EXISTED } from "./connection"
import { classifyLegacyWorksType } from "@/lib/works-type-migration"
import { WORKS_TYPES } from "@/lib/constants"
import { nowIso } from "./helpers"
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { nanoid } = require("nanoid") as { nanoid: () => string }

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

  CREATE TABLE IF NOT EXISTS ClientContact (
    id         TEXT PRIMARY KEY,
    clientId   TEXT NOT NULL REFERENCES Client(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    email      TEXT,
    phone      TEXT,
    role       TEXT,
    isPrimary  INTEGER NOT NULL DEFAULT 0,
    sortOrder  INTEGER NOT NULL DEFAULT 0,
    createdAt  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updatedAt  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE INDEX IF NOT EXISTS idx_clientcontact_client ON ClientContact(clientId);

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

  -- ── Archive audit log ─────────────────────────────────────────────
  -- Append-only log of every archive and restore action across all entities.
  -- Never deleted — it's the authoritative "who touched what when" trail.
  CREATE TABLE IF NOT EXISTS ArchiveLog (
    id              TEXT PRIMARY KEY,
    entityType      TEXT NOT NULL,   -- 'job' | 'quote' | 'client'
    entityId        TEXT NOT NULL,
    entityLabel     TEXT NOT NULL,   -- human-readable (drawing number, quote number, client name)
    action          TEXT NOT NULL,   -- 'archive' | 'restore'
    performedBy     TEXT NOT NULL,   -- userId
    performedByName TEXT NOT NULL,
    performedAt     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    reason          TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_archivelog_entity   ON ArchiveLog(entityType, entityId);
  CREATE INDEX IF NOT EXISTS idx_archivelog_performed ON ArchiveLog(performedAt DESC);

  -- ── Employee profiles (1:1 with User — HR extension, not a separate auth entity) ──
  CREATE TABLE IF NOT EXISTS EmployeeProfile (
    userId                        TEXT PRIMARY KEY REFERENCES User(id) ON DELETE CASCADE,
    employeeId                    TEXT UNIQUE,
    profilePhotoPath              TEXT,
    firstName                     TEXT,
    lastName                      TEXT,
    preferredName                 TEXT,
    phone                         TEXT,
    mobile                        TEXT,
    dateOfBirth                   TEXT,
    gender                        TEXT,
    nationality                   TEXT,
    address                       TEXT,
    city                          TEXT,
    county                        TEXT,
    postcode                      TEXT,
    country                       TEXT,
    emergencyContactName          TEXT,
    emergencyContactPhone         TEXT,
    emergencyContactRelationship  TEXT,
    jobTitle                      TEXT,
    department                    TEXT,
    managerId                     TEXT REFERENCES User(id) ON DELETE SET NULL,
    officeLocation                TEXT,
    employmentType                TEXT NOT NULL DEFAULT 'FULL_TIME',
    employmentStatus              TEXT NOT NULL DEFAULT 'ACTIVE',
    startDate                     TEXT,
    endDate                       TEXT,
    probationEndDate              TEXT,
    workingHours                  TEXT,
    salary                        REAL,
    annualLeaveAllowance          REAL NOT NULL DEFAULT 25,
    leaveTaken                    REAL NOT NULL DEFAULT 0,
    createdAt                     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updatedAt                     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE INDEX IF NOT EXISTS idx_employee_department ON EmployeeProfile(department);
  CREATE INDEX IF NOT EXISTS idx_employee_status     ON EmployeeProfile(employmentStatus);
  CREATE INDEX IF NOT EXISTS idx_employee_manager    ON EmployeeProfile(managerId);
  CREATE INDEX IF NOT EXISTS idx_employee_employeeid ON EmployeeProfile(employeeId);

  CREATE TABLE IF NOT EXISTS EmployeeSkill (
    id              TEXT PRIMARY KEY,
    userId          TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    level           TEXT,
    yearsExperience REAL,
    category        TEXT NOT NULL DEFAULT 'SKILL',
    certificatePath TEXT,
    createdAt       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updatedAt       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE INDEX IF NOT EXISTS idx_employeeskill_user ON EmployeeSkill(userId);

  CREATE TABLE IF NOT EXISTS EmployeeDocument (
    id              TEXT PRIMARY KEY,
    userId          TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    category        TEXT NOT NULL DEFAULT 'OTHER',
    filePath        TEXT NOT NULL,
    mimeType        TEXT NOT NULL,
    fileSize        INTEGER NOT NULL DEFAULT 0,
    restricted      INTEGER NOT NULL DEFAULT 0,
    uploadedBy      TEXT NOT NULL,
    uploadedByName  TEXT NOT NULL,
    createdAt       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updatedAt       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE INDEX IF NOT EXISTS idx_employeedoc_user ON EmployeeDocument(userId);

  CREATE TABLE IF NOT EXISTS EmployeeNote (
    id              TEXT PRIMARY KEY,
    userId          TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
    content         TEXT NOT NULL,
    createdBy       TEXT NOT NULL,
    createdByName   TEXT NOT NULL,
    updatedBy       TEXT,
    updatedByName   TEXT,
    createdAt       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updatedAt       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE INDEX IF NOT EXISTS idx_employeenote_user ON EmployeeNote(userId);

  CREATE TABLE IF NOT EXISTS EmployeeActivity (
    id              TEXT PRIMARY KEY,
    userId          TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
    action          TEXT NOT NULL,
    detail          TEXT,
    performedBy     TEXT NOT NULL,
    performedByName TEXT NOT NULL,
    createdAt       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE INDEX IF NOT EXISTS idx_employeeactivity_user ON EmployeeActivity(userId, createdAt DESC);

  -- ── Leave requests (source of truth — calendar events are synced, not duplicated) ──
  CREATE TABLE IF NOT EXISTS LeaveRequest (
    id              TEXT PRIMARY KEY,
    userId          TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
    leaveType       TEXT NOT NULL DEFAULT 'ANNUAL_LEAVE',
    startDate       TEXT NOT NULL,
    endDate         TEXT NOT NULL,
    reason          TEXT,
    status          TEXT NOT NULL DEFAULT 'PENDING',
    reviewedBy      TEXT REFERENCES User(id) ON DELETE SET NULL,
    reviewedByName  TEXT,
    reviewedAt      TEXT,
    createdAt       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updatedAt       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE INDEX IF NOT EXISTS idx_leaverequest_user   ON LeaveRequest(userId);
  CREATE INDEX IF NOT EXISTS idx_leaverequest_status ON LeaveRequest(status);
  CREATE INDEX IF NOT EXISTS idx_leaverequest_dates  ON LeaveRequest(startDate, endDate);

  CREATE TABLE IF NOT EXISTS LeaveCalendarLink (
    leaveRequestId  TEXT PRIMARY KEY REFERENCES LeaveRequest(id) ON DELETE CASCADE,
    calendarEventId TEXT NOT NULL UNIQUE REFERENCES CalendarEvent(id) ON DELETE CASCADE,
    userId          TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
    status          TEXT NOT NULL,
    createdAt       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updatedAt       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE INDEX IF NOT EXISTS idx_leavecal_event ON LeaveCalendarLink(calendarEventId);

  -- Shared company software/service credentials (not personal user passwords).
  CREATE TABLE IF NOT EXISTS PasswordVaultEntry (
    id                TEXT PRIMARY KEY,
    serviceName       TEXT NOT NULL,
    serviceNameLower  TEXT NOT NULL,
    loginUrl          TEXT,
    username          TEXT,
    usernameLower     TEXT,
    passwordEnc       TEXT NOT NULL,
    category          TEXT,
    categoryLower     TEXT,
    notes             TEXT,
    extraJson         TEXT,
    createdAt         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updatedAt         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE INDEX IF NOT EXISTS idx_pvault_service ON PasswordVaultEntry(serviceNameLower);
  CREATE INDEX IF NOT EXISTS idx_pvault_category ON PasswordVaultEntry(categoryLower);

  CREATE TABLE IF NOT EXISTS SiteVisitCalculation (
    id                       TEXT PRIMARY KEY,
    label                    TEXT,
    createdBy                TEXT NOT NULL,
    createdByName            TEXT,
    siteAddress              TEXT NOT NULL,
    siteLat                  REAL,
    siteLng                  REAL,
    oneWayDistanceMiles      REAL NOT NULL,
    oneWayDurationMinutes    REAL NOT NULL,
    siteHours                REAL NOT NULL,
    mileageRate              REAL NOT NULL DEFAULT 0.45,
    hourlyRate               REAL NOT NULL DEFAULT 95,
    vatRate                  REAL NOT NULL DEFAULT 0.2,
    mileageCost              REAL NOT NULL,
    labourCost               REAL NOT NULL,
    subtotal                 REAL NOT NULL,
    vat                      REAL NOT NULL,
    grandTotal               REAL NOT NULL,
    createdAt                TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updatedAt                TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE INDEX IF NOT EXISTS idx_site_visit_calc_created ON SiteVisitCalculation(createdAt DESC);
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
    ('cat_annual_leave',     'Annual Leave',     '#15803D', 'calendar-off'),
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
  add("variationFees",          "REAL")
  add("additionalCharges",    "REAL")
  // Soft-delete columns — NULL means active; set on archive.
  add("archivedAt", "TEXT")
  add("archivedBy", "TEXT")
  add("latitude",     "REAL")
  add("longitude",    "REAL")
  add("geocodedAt",   "TEXT")
  add("geocodedAddress", "TEXT")
  add("siteName",         "TEXT")
  add("siteAddress",      "TEXT")
  add("locationStatus",   "TEXT")
  add("locationSource",   "TEXT")
  db.exec(`UPDATE Job SET siteAddress = address WHERE (siteAddress IS NULL OR TRIM(siteAddress) = '') AND address IS NOT NULL AND TRIM(address) != ''`)
  db.exec(`UPDATE Job SET locationStatus = 'mapped', locationSource = 'geocoded' WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND locationStatus IS NULL`)
  db.exec("CREATE INDEX IF NOT EXISTS idx_job_location_status ON Job(locationStatus) WHERE status = 'ISSUED' AND archivedAt IS NULL")
  db.exec("CREATE INDEX IF NOT EXISTS idx_job_geocode ON Job(latitude, longitude)")
  db.exec("CREATE INDEX IF NOT EXISTS idx_job_latitude ON Job(latitude) WHERE latitude IS NOT NULL")
  db.exec("CREATE INDEX IF NOT EXISTS idx_job_longitude ON Job(longitude) WHERE longitude IS NOT NULL")
  db.exec(`CREATE INDEX IF NOT EXISTS idx_job_map_plotted ON Job(status, archivedAt, latitude, longitude)
    WHERE status = 'ISSUED' AND latitude IS NOT NULL AND longitude IS NOT NULL`)
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
  db.exec("CREATE INDEX IF NOT EXISTS idx_job_archived ON Job(archivedAt)")
  db.exec("CREATE INDEX IF NOT EXISTS idx_job_status_archived ON Job(status, archivedAt)")
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
  add("typeOfWorks",           "TEXT")
  add("customTypeDescription", "TEXT")
  // Soft-delete columns — NULL means active; set on archive.
  add("archivedAt", "TEXT")
  add("archivedBy", "TEXT")
  db.exec("CREATE INDEX IF NOT EXISTS idx_quote_archived ON Quote(archivedAt)")
  db.exec("CREATE INDEX IF NOT EXISTS idx_quote_status_archived ON Quote(status, archivedAt)")
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
  // Soft-delete columns — NULL means active; set on archive.
  add("archivedAt", "TEXT")
  add("archivedBy", "TEXT")
  db.exec("CREATE INDEX IF NOT EXISTS idx_client_archived ON Client(archivedAt)")
})()

;(function migrateClientContacts() {
  const tableExists = (db.prepare(
    "SELECT COUNT(*) as n FROM sqlite_master WHERE type='table' AND name='ClientContact'"
  ).get() as { n: number }).n > 0
  if (!tableExists) {
    db.exec(`
      CREATE TABLE ClientContact (
        id         TEXT PRIMARY KEY,
        clientId   TEXT NOT NULL REFERENCES Client(id) ON DELETE CASCADE,
        name       TEXT NOT NULL,
        email      TEXT,
        phone      TEXT,
        role       TEXT,
        isPrimary  INTEGER NOT NULL DEFAULT 0,
        sortOrder  INTEGER NOT NULL DEFAULT 0,
        createdAt  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updatedAt  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE INDEX IF NOT EXISTS idx_clientcontact_client ON ClientContact(clientId);
    `)
  }

  const clients = db.prepare(`
    SELECT id, contactName, email, phone, createdAt, updatedAt FROM Client
    WHERE (contactName IS NOT NULL AND contactName != '')
       OR (email IS NOT NULL AND email != '')
       OR (phone IS NOT NULL AND phone != '')
  `).all() as {
    id: string
    contactName: string | null
    email: string | null
    phone: string | null
    createdAt: string
    updatedAt: string
  }[]

  const insert = db.prepare(`
    INSERT OR IGNORE INTO ClientContact
      (id, clientId, name, email, phone, role, isPrimary, sortOrder, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, NULL, 1, 0, ?, ?)
  `)

  for (const client of clients) {
    const exists = (db.prepare(
      "SELECT COUNT(*) as n FROM ClientContact WHERE clientId = ?"
    ).get(client.id) as { n: number }).n > 0
    if (exists) continue
    insert.run(
      `${client.id}-primary`,
      client.id,
      client.contactName?.trim() || "Main contact",
      client.email,
      client.phone,
      client.createdAt,
      client.updatedAt,
    )
  }
})()
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
// Skipped in production unless ALLOW_BOOTSTRAP_TEST_ACCOUNTS=true.
;(function bootstrapAccounts() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_BOOTSTRAP_TEST_ACCOUNTS !== "true") {
    return
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { hashPassword } = require("@/lib/password") as typeof import("@/lib/password")
  const now = nowIso()

  // Pre-computed bcrypt hashes (cost=12) for the bootstrap passwords.
  // Using constants avoids running bcrypt on every cold start, which saves
  // ~500ms per container boot on serverless hosts like Vercel.
  const accounts = [
    // Fixed IDs ensure cross-container session continuity on stateless hosts (e.g. Vercel).
    // Every fresh container creates the same user with the same ID, so session cookies
    // remain valid regardless of which container handles the request.
    {
      id: "bootstrap-admin-00000001",
      email: "admin@test.com",
      name: "Admin",
      role: "ADMIN",
      passwordHash: "$2b$12$92nRgb8jPt20D4.fPVhIOudgpnPaAozVDOxbw32dArHspiSFy2OGS", // admin123
    },
    {
      id: "bootstrap-engineer-00000001",
      email: "engineer@test.com",
      name: "Engineer",
      role: "ENGINEER",
      passwordHash: "$2b$12$NWRIw4dbY47HJRDhOZStaOuY7s4Js.emZPm9QMHJysvYgj1gOrB7u", // engineer123
    },
  ]

  for (const acct of accounts) {
    const existing = db.prepare("SELECT id, passwordHash FROM User WHERE emailLower = ?").get(acct.email) as { id: string; passwordHash: string | null } | undefined
    // E2E needs stable known passwords across the suite — never force a password change.
    const mustChange = process.env.E2E === "true" ? 0 : 1
    if (!existing) {
      db.prepare(`
        INSERT INTO User (id,name,email,emailLower,role,active,passwordHash,mustChangePassword,createdAt,updatedAt)
        VALUES (?,?,?,?,?,1,?,?,?,?)
      `).run(acct.id, acct.name, acct.email, acct.email, acct.role, acct.passwordHash, mustChange, now, now)
      console.log(`[bootstrapAccounts] Created ${acct.email}`)
    } else if (process.env.E2E === "true") {
      db.prepare("UPDATE User SET passwordHash = ?, mustChangePassword = 0, active = 1 WHERE id = ?")
        .run(acct.passwordHash, existing.id)
    } else if (!existing.passwordHash) {
      db.prepare("UPDATE User SET passwordHash = ?, mustChangePassword = 1 WHERE id = ?")
        .run(acct.passwordHash, existing.id)
      console.log(`[bootstrapAccounts] Set password for ${acct.email}`)
    }
  }

  // Any other users without a password get a temp one (runtime hash is fine here — rare path)
  const noPassword = db.prepare(
    "SELECT id, name FROM User WHERE passwordHash IS NULL"
  ).all() as { id: string; name: string }[]
  for (const u of noPassword) {
    db.prepare("UPDATE User SET passwordHash = ?, mustChangePassword = 1 WHERE id = ?")
      .run(hashPassword("changeme"), u.id)
    console.log(`[bootstrapAccounts] Set temp password for ${u.name} (must change on login)`)
  }
})()
