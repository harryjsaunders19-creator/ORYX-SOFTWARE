/** Site table access — SQLite path. */
import { db } from "../connection"
import { nowIso } from "../helpers"
import { createId as nanoid } from "@paralleldrive/cuid2"
import type {
  SiteRow,
  CreateSiteData,
  UpdateSiteData,
  SiteJobCounts,
  SiteAuditEventRow,
  SiteAuditAction,
} from "@/modules/sites/types/site-types"
import {
  normalizeName,
  normalizePostcode,
  formatSiteAddress,
} from "@/modules/sites/lib/normalize"

function mapRow(row: SiteRow): SiteRow {
  return row
}

export const siteDb = {
  findUnique(id: string): SiteRow | null {
    const row = db.prepare("SELECT * FROM Site WHERE id = ?").get(id) as SiteRow | undefined
    return row ? mapRow(row) : null
  },

  findManyByIds(ids: string[]): SiteRow[] {
    if (!ids.length) return []
    const placeholders = ids.map(() => "?").join(",")
    return (db.prepare(`SELECT * FROM Site WHERE id IN (${placeholders})`).all(...ids) as SiteRow[]).map(mapRow)
  },

  findByClient(
    clientId: string,
    opts: { activeOnly?: boolean; search?: string; take?: number } = {},
  ): SiteRow[] {
    const clauses = ["clientId = ?"]
    const params: unknown[] = [clientId]
    if (opts.activeOnly !== false) clauses.push("isActive = 1")
    if (opts.search?.trim()) {
      const s = `%${opts.search.trim().toLowerCase()}%`
      clauses.push(
        "(nameLower LIKE ? OR lower(COALESCE(addressLine1,'')) LIKE ? OR lower(COALESCE(city,'')) LIKE ? OR lower(COALESCE(postcode,'')) LIKE ? OR COALESCE(postcodeNormalized,'') LIKE ? OR lower(COALESCE(siteReference,'')) LIKE ?)",
      )
      const pc = opts.search.replace(/\s+/g, "").toUpperCase()
      params.push(s, s, s, s, `%${pc}%`, s)
    }
    const limit = opts.take != null ? `LIMIT ${opts.take}` : ""
    return (
      db.prepare(
        `SELECT * FROM Site WHERE ${clauses.join(" AND ")} ORDER BY name ASC ${limit}`,
      ).all(...params) as SiteRow[]
    ).map(mapRow)
  },

  search(opts: {
    clientId: string
    q?: string
    activeOnly?: boolean
    includeArchived?: boolean
    limit?: number
  }): SiteRow[] {
    const clauses = ["clientId = ?"]
    const params: unknown[] = [opts.clientId]
    if (opts.includeArchived) {
      // no isActive filter
    } else if (opts.activeOnly !== false) {
      clauses.push("isActive = 1")
    }
    if (opts.q?.trim()) {
      const s = `%${opts.q.trim().toLowerCase()}%`
      const pc = opts.q.replace(/\s+/g, "").toUpperCase()
      clauses.push(
        "(nameLower LIKE ? OR lower(COALESCE(addressLine1,'')) LIKE ? OR lower(COALESCE(addressLine2,'')) LIKE ? OR lower(COALESCE(city,'')) LIKE ? OR lower(COALESCE(postcode,'')) LIKE ? OR COALESCE(postcodeNormalized,'') LIKE ? OR lower(COALESCE(siteReference,'')) LIKE ?)",
      )
      params.push(s, s, s, s, s, `%${pc}%`, s)
    }
    const limit = opts.limit ?? 12
    return (
      db.prepare(
        `SELECT * FROM Site WHERE ${clauses.join(" AND ")} ORDER BY name ASC LIMIT ?`,
      ).all(...params, limit) as SiteRow[]
    ).map(mapRow)
  },

  create(data: CreateSiteData): SiteRow {
    const now = nowIso()
    const name = data.name.trim()
    const postcode = data.postcode?.trim() || null
    db.prepare(`
      INSERT INTO Site (
        id, clientId, name, nameLower,
        addressLine1, addressLine2, city, county, postcode, postcodeNormalized, country,
        siteReference, primaryContactId, notes,
        isActive, archivedAt, archivedBy, createdAt, updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,NULL,NULL,?,?)
    `).run(
      data.id,
      data.clientId,
      name,
      normalizeName(name),
      data.addressLine1?.trim() || null,
      data.addressLine2?.trim() || null,
      data.city?.trim() || null,
      data.county?.trim() || null,
      postcode,
      postcode ? normalizePostcode(postcode) : null,
      data.country?.trim() || null,
      data.siteReference?.trim() || null,
      data.primaryContactId || null,
      data.notes?.trim() || null,
      now,
      now,
    )
    return this.findUnique(data.id)!
  },

  update(id: string, data: UpdateSiteData): SiteRow | null {
    const existing = this.findUnique(id)
    if (!existing) return null
    const fields: string[] = []
    const params: unknown[] = []

    if (data.name !== undefined) {
      fields.push("name = ?", "nameLower = ?")
      params.push(data.name.trim(), normalizeName(data.name))
    }
    const simple: (keyof UpdateSiteData)[] = [
      "addressLine1", "addressLine2", "city", "county", "country",
      "siteReference", "primaryContactId", "notes",
      "isActive", "archivedAt", "archivedBy",
    ]
    for (const k of simple) {
      if (data[k] !== undefined) {
        fields.push(`"${k}" = ?`)
        params.push(data[k] ?? null)
      }
    }
    if (data.postcode !== undefined) {
      const postcode = data.postcode?.trim() || null
      fields.push("postcode = ?", "postcodeNormalized = ?")
      params.push(postcode, postcode ? normalizePostcode(postcode) : null)
    }
    if (!fields.length) return existing
    fields.push("updatedAt = ?")
    params.push(nowIso(), id)
    db.prepare(`UPDATE Site SET ${fields.join(", ")} WHERE id = ?`).run(...params)

    // Keep denormalized siteName/siteAddress on linked jobs in sync when site identity/address changes.
    const addressChanged =
      data.name !== undefined
      || data.addressLine1 !== undefined
      || data.addressLine2 !== undefined
      || data.city !== undefined
      || data.county !== undefined
      || data.postcode !== undefined
      || data.country !== undefined
    if (addressChanged) {
      const next = this.findUnique(id)!
      const displayAddress = formatSiteAddress(next)
      const now = nowIso()
      db.prepare(`
        UPDATE Job SET siteName = ?, locationName = ?, siteAddress = ?, address = ?, postcode = ?, locationMode = 'MANAGED_SITE', updatedAt = ?
        WHERE siteId = ? AND (parentJobId IS NULL OR parentJobId = '')
      `).run(next.name, next.name, displayAddress || next.name, displayAddress || next.name, next.postcode, now, id)
      // Revisions inherit display from parent — still refresh site fields for consistency.
      db.prepare(`
        UPDATE Job SET siteName = ?, locationName = ?, siteAddress = ?, postcode = ?, updatedAt = ?
        WHERE siteId = ?
      `).run(next.name, next.name, displayAddress || next.name, next.postcode, now, id)
      try {
        db.prepare(`
          UPDATE ParentJob SET siteName = ?, locationName = ?, siteAddress = ?, address = ?, postcode = ?, locationMode = 'MANAGED_SITE', updatedAt = ?
          WHERE siteId = ?
        `).run(next.name, next.name, displayAddress || next.name, displayAddress || next.name, next.postcode, now, id)
      } catch {
        // ParentJob may not exist on older DBs mid-migration
      }
    }
    return this.findUnique(id)
  },

  jobCounts(siteId: string): SiteJobCounts {
    const total = (db.prepare(`
      SELECT COUNT(*) as n FROM Job
      WHERE siteId = ? AND parentJobId IS NULL AND archivedAt IS NULL
    `).get(siteId) as { n: number }).n
    const completed = (db.prepare(`
      SELECT COUNT(*) as n FROM Job
      WHERE siteId = ? AND parentJobId IS NULL AND archivedAt IS NULL AND status = 'ISSUED'
    `).get(siteId) as { n: number }).n
    return { total, completed, active: Math.max(0, total - completed) }
  },

  jobsForSite(siteId: string, limit = 50): Array<{
    id: string
    drawingNumber: string
    siteName: string | null
    siteAddress: string | null
    address: string
    clientCompany: string
    status: string
    typeOfWorks: string
    designer: string
    revisionLetter: string | null
    parentJobId: string | null
  }> {
    return db.prepare(`
      SELECT id, drawingNumber, siteName, siteAddress, address, clientCompany,
             status, typeOfWorks, designer, revisionLetter, parentJobId
      FROM Job
      WHERE siteId = ? AND parentJobId IS NULL AND archivedAt IS NULL
      ORDER BY createdAt DESC
      LIMIT ?
    `).all(siteId, limit) as Array<{
      id: string
      drawingNumber: string
      siteName: string | null
      siteAddress: string | null
      address: string
      clientCompany: string
      status: string
      typeOfWorks: string
      designer: string
      revisionLetter: string | null
      parentJobId: string | null
    }>
  },

  countJobs(siteId: string): number {
    return (db.prepare(`
      SELECT COUNT(*) as n FROM Job WHERE siteId = ? AND parentJobId IS NULL
    `).get(siteId) as { n: number }).n
  },

  findLikelyDuplicates(opts: {
    clientId: string
    name: string
    addressLine1?: string | null
    postcode?: string | null
    excludeId?: string
  }): SiteRow[] {
    const nameLower = normalizeName(opts.name)
    const pc = normalizePostcode(opts.postcode)
    const rows = db.prepare(`
      SELECT * FROM Site
      WHERE clientId = ? AND isActive = 1
        AND (
          nameLower = ?
          OR (? != '' AND postcodeNormalized = ?)
          OR (? != '' AND lower(COALESCE(addressLine1,'')) = lower(?))
        )
      ORDER BY name ASC
      LIMIT 8
    `).all(
      opts.clientId,
      nameLower,
      pc, pc,
      opts.addressLine1?.trim() || "", opts.addressLine1?.trim() || "",
    ) as SiteRow[]
    return rows.filter(r => r.id !== opts.excludeId).map(mapRow)
  },

  logAudit(opts: {
    siteId: string
    action: SiteAuditAction | string
    summary: string
    jobId?: string | null
    drawingNumber?: string | null
    fromSiteId?: string | null
    performedBy?: string
    performedByName?: string
    meta?: string | null
  }): SiteAuditEventRow {
    const id = nanoid()
    const performedAt = nowIso()
    const row: SiteAuditEventRow = {
      id,
      siteId: opts.siteId,
      action: opts.action,
      summary: opts.summary,
      jobId: opts.jobId ?? null,
      drawingNumber: opts.drawingNumber ?? null,
      fromSiteId: opts.fromSiteId ?? null,
      performedBy: opts.performedBy ?? "System",
      performedByName: opts.performedByName ?? "System",
      performedAt,
      meta: opts.meta ?? null,
    }
    db.prepare(`
      INSERT INTO SiteAuditEvent (
        id, siteId, action, summary, jobId, drawingNumber, fromSiteId,
        performedBy, performedByName, performedAt, meta
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      row.id, row.siteId, row.action, row.summary, row.jobId, row.drawingNumber,
      row.fromSiteId, row.performedBy, row.performedByName, row.performedAt, row.meta,
    )
    return row
  },

  listAudit(siteId: string, limit = 50): SiteAuditEventRow[] {
    return db.prepare(`
      SELECT * FROM SiteAuditEvent WHERE siteId = ? ORDER BY performedAt DESC LIMIT ?
    `).all(siteId, limit) as SiteAuditEventRow[]
  },
}
