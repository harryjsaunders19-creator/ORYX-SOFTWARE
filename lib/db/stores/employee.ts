/** Employee HR profile table access. */
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

function nextEmployeeId(): string {
  const row = db.prepare(
    "SELECT employeeId FROM EmployeeProfile WHERE employeeId IS NOT NULL ORDER BY employeeId DESC LIMIT 1",
  ).get() as { employeeId: string } | undefined
  if (!row?.employeeId) return "EMP-0001"
  const m = row.employeeId.match(/^EMP-(\d+)$/)
  const n = m ? parseInt(m[1], 10) + 1 : 1
  return `EMP-${String(n).padStart(4, "0")}`
}

export const employeeProfileDb = {
  findUnique(userId: string): EmployeeProfileRow | null {
    return (db.prepare("SELECT * FROM EmployeeProfile WHERE userId = ?").get(userId) as EmployeeProfileRow) ?? null
  },

  findByEmployeeId(employeeId: string): EmployeeProfileRow | null {
    return (db.prepare("SELECT * FROM EmployeeProfile WHERE employeeId = ?").get(employeeId) as EmployeeProfileRow) ?? null
  },

  ensure(userId: string): EmployeeProfileRow {
    const existing = this.findUnique(userId)
    if (existing) return existing
    const now = nowIso()
    const employeeId = nextEmployeeId()
    db.prepare(`
      INSERT INTO EmployeeProfile (userId, employeeId, employmentType, employmentStatus, annualLeaveAllowance, leaveTaken, createdAt, updatedAt)
      VALUES (?, ?, 'FULL_TIME', 'ACTIVE', 25, 0, ?, ?)
    `).run(userId, employeeId, now, now)
    return this.findUnique(userId)!
  },

  findMany(opts: {
    search?: string
    department?: string
    status?: string
    skip?: number
    take?: number
    sortBy?: string
    sortDir?: "asc" | "desc"
  } = {}): EmployeeProfileRow[] {
    const where: string[] = []
    const params: unknown[] = []
    if (opts.department) { where.push("p.department = ?"); params.push(opts.department) }
    if (opts.status) { where.push("p.employmentStatus = ?"); params.push(opts.status) }
    if (opts.search?.trim()) {
      const q = `%${opts.search.trim().toLowerCase()}%`
      where.push(`(
        LOWER(u.name) LIKE ? OR LOWER(u.email) LIKE ? OR LOWER(p.firstName) LIKE ? OR
        LOWER(p.lastName) LIKE ? OR LOWER(p.jobTitle) LIKE ? OR LOWER(p.department) LIKE ? OR
        LOWER(p.employeeId) LIKE ?
      )`)
      params.push(q, q, q, q, q, q, q)
    }
    const sortCol = opts.sortBy === "department" ? "p.department"
      : opts.sortBy === "jobTitle" ? "p.jobTitle"
      : opts.sortBy === "startDate" ? "p.startDate"
      : opts.sortBy === "status" ? "p.employmentStatus"
      : "u.name"
    const dir = opts.sortDir === "desc" ? "DESC" : "ASC"
    const limit = opts.take != null ? `LIMIT ${opts.take}` : ""
    const offset = opts.skip != null ? `OFFSET ${opts.skip}` : ""
    const sql = `
      SELECT p.* FROM EmployeeProfile p
      INNER JOIN User u ON u.id = p.userId
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY ${sortCol} ${dir}, u.name ASC
      ${limit} ${offset}
    `
    return db.prepare(sql).all(...params) as EmployeeProfileRow[]
  },

  count(opts: { search?: string; department?: string; status?: string } = {}): number {
    const where: string[] = []
    const params: unknown[] = []
    if (opts.department) { where.push("p.department = ?"); params.push(opts.department) }
    if (opts.status) { where.push("p.employmentStatus = ?"); params.push(opts.status) }
    if (opts.search?.trim()) {
      const q = `%${opts.search.trim().toLowerCase()}%`
      where.push(`(
        LOWER(u.name) LIKE ? OR LOWER(u.email) LIKE ? OR LOWER(p.firstName) LIKE ? OR
        LOWER(p.lastName) LIKE ? OR LOWER(p.jobTitle) LIKE ? OR LOWER(p.department) LIKE ? OR
        LOWER(p.employeeId) LIKE ?
      )`)
      params.push(q, q, q, q, q, q, q)
    }
    const sql = `
      SELECT COUNT(*) as n FROM EmployeeProfile p
      INNER JOIN User u ON u.id = p.userId
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    `
    return (db.prepare(sql).get(...params) as { n: number }).n
  },

  directReportIds(managerId: string): string[] {
    return (db.prepare("SELECT userId FROM EmployeeProfile WHERE managerId = ?").all(managerId) as { userId: string }[])
      .map(r => r.userId)
  },

  departments(): string[] {
    return (db.prepare(
      "SELECT DISTINCT department FROM EmployeeProfile WHERE department IS NOT NULL AND department != '' ORDER BY department",
    ).all() as { department: string }[]).map(r => r.department)
  },

  update(userId: string, data: UpdateEmployeeProfileData): EmployeeProfileRow | null {
    const existing = this.findUnique(userId)
    if (!existing) return null
    const fields: string[] = []
    const params: unknown[] = []
    const map: [keyof UpdateEmployeeProfileData, string][] = [
      ["employeeId", "employeeId"], ["profilePhotoPath", "profilePhotoPath"],
      ["firstName", "firstName"], ["lastName", "lastName"], ["preferredName", "preferredName"],
      ["phone", "phone"], ["mobile", "mobile"], ["dateOfBirth", "dateOfBirth"],
      ["gender", "gender"], ["nationality", "nationality"],
      ["address", "address"], ["city", "city"], ["county", "county"],
      ["postcode", "postcode"], ["country", "country"],
      ["emergencyContactName", "emergencyContactName"],
      ["emergencyContactPhone", "emergencyContactPhone"],
      ["emergencyContactRelationship", "emergencyContactRelationship"],
      ["jobTitle", "jobTitle"], ["department", "department"], ["managerId", "managerId"],
      ["officeLocation", "officeLocation"], ["employmentType", "employmentType"],
      ["employmentStatus", "employmentStatus"], ["startDate", "startDate"],
      ["endDate", "endDate"], ["probationEndDate", "probationEndDate"],
      ["workingHours", "workingHours"], ["salary", "salary"],
      ["annualLeaveAllowance", "annualLeaveAllowance"], ["leaveTaken", "leaveTaken"],
    ]
    for (const [key, col] of map) {
      if (data[key] !== undefined) {
        fields.push(`${col} = ?`)
        params.push(data[key])
      }
    }
    if (!fields.length) return existing
    fields.push("updatedAt = ?")
    params.push(nowIso(), userId)
    db.prepare(`UPDATE EmployeeProfile SET ${fields.join(", ")} WHERE userId = ?`).run(...params)
    return this.findUnique(userId)
  },
}

export const employeeSkillDb = {
  findByUser(userId: string): EmployeeSkillRow[] {
    return db.prepare("SELECT * FROM EmployeeSkill WHERE userId = ? ORDER BY name ASC").all(userId) as EmployeeSkillRow[]
  },
  create(row: Omit<EmployeeSkillRow, "createdAt" | "updatedAt">): EmployeeSkillRow {
    const now = nowIso()
    db.prepare(`
      INSERT INTO EmployeeSkill (id, userId, name, level, yearsExperience, category, certificatePath, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(row.id, row.userId, row.name, row.level, row.yearsExperience, row.category, row.certificatePath, now, now)
    return db.prepare("SELECT * FROM EmployeeSkill WHERE id = ?").get(row.id) as EmployeeSkillRow
  },
  delete(id: string, userId: string): boolean {
    return db.prepare("DELETE FROM EmployeeSkill WHERE id = ? AND userId = ?").run(id, userId).changes > 0
  },
}

export const employeeDocumentDb = {
  findByUser(userId: string, includeRestricted: boolean): EmployeeDocumentRow[] {
    if (includeRestricted) {
      return db.prepare("SELECT * FROM EmployeeDocument WHERE userId = ? ORDER BY createdAt DESC").all(userId) as EmployeeDocumentRow[]
    }
    return db.prepare("SELECT * FROM EmployeeDocument WHERE userId = ? AND restricted = 0 ORDER BY createdAt DESC").all(userId) as EmployeeDocumentRow[]
  },
  findUnique(id: string): EmployeeDocumentRow | null {
    return (db.prepare("SELECT * FROM EmployeeDocument WHERE id = ?").get(id) as EmployeeDocumentRow) ?? null
  },
  create(row: Omit<EmployeeDocumentRow, "createdAt" | "updatedAt">): EmployeeDocumentRow {
    const now = nowIso()
    db.prepare(`
      INSERT INTO EmployeeDocument (id, userId, name, category, filePath, mimeType, fileSize, restricted, uploadedBy, uploadedByName, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(row.id, row.userId, row.name, row.category, row.filePath, row.mimeType, row.fileSize, row.restricted, row.uploadedBy, row.uploadedByName, now, now)
    return this.findUnique(row.id)!
  },
  delete(id: string): boolean {
    return db.prepare("DELETE FROM EmployeeDocument WHERE id = ?").run(id).changes > 0
  },
}

export const employeeNoteDb = {
  findByUser(userId: string): EmployeeNoteRow[] {
    return db.prepare("SELECT * FROM EmployeeNote WHERE userId = ? ORDER BY updatedAt DESC").all(userId) as EmployeeNoteRow[]
  },
  create(row: Omit<EmployeeNoteRow, "createdAt" | "updatedAt" | "updatedBy" | "updatedByName">): EmployeeNoteRow {
    const now = nowIso()
    db.prepare(`
      INSERT INTO EmployeeNote (id, userId, content, createdBy, createdByName, updatedBy, updatedByName, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?)
    `).run(row.id, row.userId, row.content, row.createdBy, row.createdByName, now, now)
    return db.prepare("SELECT * FROM EmployeeNote WHERE id = ?").get(row.id) as EmployeeNoteRow
  },
  update(id: string, content: string, updatedBy: string, updatedByName: string): EmployeeNoteRow | null {
    const now = nowIso()
    const r = db.prepare(`
      UPDATE EmployeeNote SET content = ?, updatedBy = ?, updatedByName = ?, updatedAt = ? WHERE id = ?
    `).run(content, updatedBy, updatedByName, now, id)
    if (!r.changes) return null
    return db.prepare("SELECT * FROM EmployeeNote WHERE id = ?").get(id) as EmployeeNoteRow
  },
}

export const employeeActivityDb = {
  log(row: Omit<EmployeeActivityRow, "createdAt">): void {
    db.prepare(`
      INSERT INTO EmployeeActivity (id, userId, action, detail, performedBy, performedByName, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(row.id, row.userId, row.action, row.detail, row.performedBy, row.performedByName, nowIso())
  },
  findByUser(userId: string, take = 50): EmployeeActivityRow[] {
    return db.prepare("SELECT * FROM EmployeeActivity WHERE userId = ? ORDER BY createdAt DESC LIMIT ?").all(userId, take) as EmployeeActivityRow[]
  },
}

;(function bootstrapEmployeeProfiles() {
  try {
    const users = db.prepare("SELECT id FROM User WHERE active = 1").all() as { id: string }[]
    for (const u of users) employeeProfileDb.ensure(u.id)
  } catch {
    /* tables may not exist yet on first partial load */
  }
})()

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
    db.prepare("DELETE FROM ArchiveLog").run()
    db.prepare("DELETE FROM Client").run()

    return { jobCount, clientCount, quoteCount }
  })()
}
