/**
 * One-time Phase 13 split: lib/db/stores.ts → lib/db/stores/*.ts
 * Run: node scripts/split-db-stores.mjs
 */
import fs from "fs"
import path from "path"

const ROOT = path.resolve(import.meta.dirname, "..")
const srcPath = path.join(ROOT, "lib/db/stores.ts")
const outDir = path.join(ROOT, "lib/db/stores")

const lines = fs.readFileSync(srcPath, "utf8").split("\n")

/** @param {number} start 1-based inclusive @param {number} end 1-based inclusive */
function slice(start, end) {
  return lines.slice(start - 1, end).join("\n")
}

const files = [
  {
    name: "type-of-works-migration-log.ts",
    header: `/** TypeOfWorksMigrationLog table access. */
import { db } from "../connection"
import { nowIso } from "../helpers"
`,
    body: slice(17, 51),
  },
  {
    name: "job.ts",
    header: `/** Job table access. */
import { db } from "../connection"
import { nowIso, buildWhere, safeOrder, type WhereClause, type FindManyOptions } from "../helpers"
import { totalJobCommercialValue } from "@/shared/utils"
import { createId as nanoid } from "@paralleldrive/cuid2"
import { billingHandoffDb } from "./billing-handoff"

export type { JobRow, CreateJobData, UpdateJobData } from "../job-types"
import type { JobRow, CreateJobData, UpdateJobData } from "../job-types"

`,
    body: slice(159, 489),
  },
  {
    name: "invoice.ts",
    header: `/** Legacy Invoice table access. */
import { db } from "../connection"
import { nowIso } from "../helpers"
import { createId as nanoid } from "@paralleldrive/cuid2"
import { jobDb } from "./job"
import type { JobRow } from "../job-types"

`,
    body: slice(56, 68) + "\n\n" + slice(492, 680),
  },
  {
    name: "history.ts",
    header: `/** StatusHistory table access. */
import { db } from "../connection"
import { nowIso } from "../helpers"
import { createId as nanoid } from "@paralleldrive/cuid2"
import { jobDb } from "./job"

export type { StatusHistoryRow } from "../history-types"
import type { StatusHistoryRow } from "../history-types"

`,
    body: slice(684, 694),
  },
  {
    name: "sequence.ts",
    header: `/** DrawingSequence and RefSequence counters. */
import { db, DB_EXISTED } from "../connection"
import { createId as nanoid } from "@paralleldrive/cuid2"

`,
    body: slice(698, 870),
  },
  {
    name: "billing-handoff.ts",
    header: `/** BillingHandoff (Ready For Invoicing queue) table access. */
import { db } from "../connection"
import { nowIso } from "../helpers"
import { totalJobCommercialValue } from "@/shared/utils"
import { createId as nanoid } from "@paralleldrive/cuid2"
import { jobDb } from "./job"
import { clientDb } from "./client"
import { historyDb } from "./history"
import { sequenceDb } from "./sequence"

export type { BillingHandoffRow, BillingExportBatchRow, BillingExportSnapshotRow } from "../billing-types"
import type { BillingHandoffRow, BillingExportBatchRow } from "../billing-types"

`,
    body: slice(92, 145) + "\n\n" + slice(876, 1222),
  },
  {
    name: "commercial.ts",
    header: `/** Commercial aggregate queries (dashboard stats). */
import { db } from "../connection"

`,
    body: slice(1231, 1235),
  },
  {
    name: "client.ts",
    header: `/** Client table access. */
import { db, DB_EXISTED } from "../connection"
import { nowIso } from "../helpers"
import { createId as nanoid } from "@paralleldrive/cuid2"
import type { JobRow } from "../job-types"

export type { ClientRow, CreateClientData, UpdateClientData } from "../client-types"
import type { ClientRow, CreateClientData, UpdateClientData } from "../client-types"

`,
    body: slice(1245, 1465),
  },
  {
    name: "export-batch.ts",
    header: `/** Legacy ExportBatch table access. */
import { db } from "../connection"
import { nowIso } from "../helpers"
import { createId as nanoid } from "@paralleldrive/cuid2"
import { jobDb } from "./job"
import type { JobRow } from "../job-types"

`,
    body: slice(1470, 1624),
  },
  {
    name: "hold.ts",
    header: `/** ClientHold table access. */
import { db } from "../connection"
import { nowIso } from "../helpers"
import { createId as nanoid } from "@paralleldrive/cuid2"

export type { ClientHoldRow, ClientHoldWithClientRow } from "../hold-types"
import type { ClientHoldRow, ClientHoldWithClientRow } from "../hold-types"

`,
    body: slice(1630, 1742),
  },
  {
    name: "archive-log.ts",
    header: `/** ArchiveLog audit table access. */
import { db } from "../connection"
import { nowIso } from "../helpers"
import { createId as nanoid } from "@paralleldrive/cuid2"
import type { ArchiveLogRow } from "../archive-types"

`,
    body: slice(1750, 1792),
  },
  {
    name: "health.ts",
    header: `/** SQLite health check helper. */
import { db, DB_PATH } from "../connection"

`,
    body: slice(1796, 1804),
  },
  {
    name: "quote.ts",
    header: `/** Quote and QuoteLineItem table access. */
import { db } from "../connection"
import { nowIso } from "../helpers"
import { todayIsoDate, addDaysToIsoDate } from "@/shared/utils"
import { createId as nanoid } from "@paralleldrive/cuid2"
import { sequenceDb } from "./sequence"

export type {
  QuoteRow,
  CreateQuoteData,
  UpdateQuoteData,
  QuoteLineItemRow,
  CreateQuoteLineItemData,
} from "../quote-types"
import type {
  QuoteRow,
  CreateQuoteData,
  UpdateQuoteData,
  QuoteLineItemRow,
  CreateQuoteLineItemData,
} from "../quote-types"

`,
    body: slice(1823, 2080),
  },
  {
    name: "user.ts",
    header: `/** User directory table access. */
import { db } from "../connection"
import { nowIso } from "../helpers"
import { createId as nanoid } from "@paralleldrive/cuid2"

export type { Role, UserRow, CreateUserData, UpdateUserData, PublicUserRow } from "../user-types"
export { withoutPassword } from "../user-types"
import type { CreateUserData, UpdateUserData, UserRow } from "../user-types"

`,
    body: slice(2086, 2171),
  },
  {
    name: "employee.ts",
    header: `/** Employee HR profile table access. */
import { db } from "../connection"
import { nowIso } from "../helpers"
import { createId as nanoid } from "@paralleldrive/cuid2"

export type {
  EmployeeProfileRow,
  EmployeeSkillRow,
  EmployeeDocumentRow,
  EmployeeNoteRow,
  EmployeeActivityRow,
  UpdateEmployeeProfileData,
  EmploymentType,
  EmploymentStatus,
  SkillCategory,
  DocumentCategory,
} from "../employee-types"
import type {
  EmployeeProfileRow,
  EmployeeSkillRow,
  EmployeeDocumentRow,
  EmployeeNoteRow,
  EmployeeActivityRow,
  UpdateEmployeeProfileData,
} from "../employee-types"

`,
    body: slice(2196, 2449),
  },
  {
    name: "backup.ts",
    header: `/** Backup job and audit table access. */
import { db } from "../connection"
import { nowIso } from "../helpers"
import { createId as nanoid } from "@paralleldrive/cuid2"

export type {
  BackupStatus,
  BackupTrigger,
  BackupJobRow,
  CreateBackupJobData,
  BackupAuditLogRow,
  CreateBackupAuditLogData,
} from "../backup-types"
import type { CreateBackupAuditLogData, CreateBackupJobData, BackupAuditLogRow, BackupJobRow } from "../backup-types"

`,
    body: slice(2463, 2553),
  },
  {
    name: "leave.ts",
    header: `/** LeaveRequest table access. */
import { db } from "../connection"
import { nowIso } from "../helpers"
import { createId as nanoid } from "@paralleldrive/cuid2"
import type { LeaveRequestStatus } from "@/modules/leave/constants"

export type {
  LeaveRequestRow,
  LeaveCalendarLinkRow,
  CreateLeaveRequestData,
  LeaveRequestWithMeta,
} from "../leave-types"
import type {
  LeaveRequestRow,
  LeaveCalendarLinkRow,
  CreateLeaveRequestData,
  LeaveRequestWithMeta,
} from "../leave-types"

`,
    body: slice(2571, 2738),
  },
  {
    name: "calendar.ts",
    header: `/** CalendarEvent table access. */
import { db } from "../connection"
import { nowIso } from "../helpers"
import { createId as nanoid } from "@paralleldrive/cuid2"

export type {
  EventCategoryRow,
  CalendarEventRow,
  CalendarEventWithDetails,
  CreateCalendarEventData,
  UpdateCalendarEventData,
} from "../calendar-types"
import type {
  CalendarEventRow,
  CalendarEventWithDetails,
  CreateCalendarEventData,
  EventCategoryRow,
  UpdateCalendarEventData,
} from "../calendar-types"

`,
    body: slice(2750, 2901),
  },
  {
    name: "identity-switch-log.ts",
    header: `/** IdentitySwitchLog audit table access. */
import { db } from "../connection"
import { nowIso } from "../helpers"
import { createId as nanoid } from "@paralleldrive/cuid2"

export type { IdentitySwitchAction, IdentitySwitchLogRow, CreateIdentitySwitchLogData } from "../identity-switch-types"
import type { CreateIdentitySwitchLogData, IdentitySwitchLogRow } from "../identity-switch-types"

`,
    body: slice(2908, 2947),
  },
]

fs.mkdirSync(outDir, { recursive: true })

for (const { name, header, body } of files) {
  fs.writeFileSync(path.join(outDir, name), header + body + "\n")
}

const indexContent = `/**
 * lib/db/stores — table access objects split by domain (Phase 13).
 * Import from "@/lib/db" or "@/lib/db/stores" as before.
 */

export * from "./type-of-works-migration-log"
export * from "./job"
export * from "./invoice"
export * from "./history"
export * from "./sequence"
export * from "./billing-handoff"
export * from "./commercial"
export * from "./client"
export * from "./export-batch"
export * from "./hold"
export * from "./archive-log"
export * from "./health"
export * from "./quote"
export * from "./user"
export * from "./employee"
export * from "./backup"
export * from "./leave"
export * from "./calendar"
export * from "./identity-switch-log"
`

fs.writeFileSync(path.join(outDir, "index.ts"), indexContent)

// Replace monolith with barrel shim
fs.writeFileSync(
  srcPath,
  `/**
 * lib/db/stores.ts — re-export barrel (Phase 13 split).
 * Implementation lives in lib/db/stores/*.ts
 */
export * from "./stores/index"
`,
)

console.log(`Split ${srcPath} into ${files.length} files under lib/db/stores/`)
