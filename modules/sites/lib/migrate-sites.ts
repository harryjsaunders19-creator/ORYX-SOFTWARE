/**
 * Backfill Site records from legacy Job siteName/siteAddress fields.
 * Safe: does not merge uncertain matches; flags ambiguous jobs for review.
 */
import { createId } from "@paralleldrive/cuid2"
import { db } from "@/lib/db/connection"
import { nowIso } from "@/lib/db/helpers"
import type { MigrationReport } from "@/modules/sites/types"
import {
  siteDedupKey,
  parseLegacySiteAddress,
  normalizeName,
  normalizePostcode,
} from "@/modules/sites/lib/normalize"

type LegacyJob = {
  id: string
  drawingNumber: string
  clientId: string | null
  clientCompany: string
  siteName: string | null
  siteAddress: string | null
  address: string
  siteId: string | null
  parentJobId: string | null
}

export function migrateLegacySitesSqlite(): MigrationReport {
  const report: MigrationReport = {
    sitesCreated: 0,
    jobsLinked: 0,
    parentJobsLinked: 0,
    probableDuplicates: [],
    ambiguousJobs: [],
    jobsMissingSiteData: [],
    sites: [],
  }

  const jobs = db.prepare(`
    SELECT id, drawingNumber, clientId, clientCompany, siteName, siteAddress, address, siteId, parentJobId
    FROM Job
    WHERE parentJobId IS NULL
  `).all() as LegacyJob[]

  /** key → { siteId?, jobs[], name, address fields } */
  const groups = new Map<string, {
    key: string
    clientId: string
    name: string
    addressLine1: string | null
    city: string | null
    postcode: string | null
    siteAddress: string | null
    jobIds: string[]
  }>()

  for (const job of jobs) {
    if (job.siteId) continue

    if (!job.clientId) {
      report.ambiguousJobs.push({
        jobId: job.id,
        drawingNumber: job.drawingNumber,
        reason: "Missing clientId — cannot attach site without client ownership",
      })
      continue
    }

    const rawName = (job.siteName ?? "").trim()
    const rawAddress = (job.siteAddress ?? job.address ?? "").trim()
    if (!rawName && !rawAddress) {
      report.jobsMissingSiteData.push({
        jobId: job.id,
        drawingNumber: job.drawingNumber,
        clientId: job.clientId,
      })
      continue
    }

    const parsed = parseLegacySiteAddress(rawAddress)
    const name = rawName || parsed.addressLine1 || "Unnamed site"
    const key = siteDedupKey({
      clientId: job.clientId,
      name,
      addressLine1: parsed.addressLine1,
      postcode: parsed.postcode,
      siteAddress: rawAddress,
    })

    const existing = groups.get(key)
    if (existing) {
      existing.jobIds.push(job.id)
    } else {
      groups.set(key, {
        key,
        clientId: job.clientId,
        name,
        addressLine1: parsed.addressLine1,
        city: parsed.city,
        postcode: parsed.postcode,
        siteAddress: rawAddress || null,
        jobIds: [job.id],
      })
    }
  }

  // Detect probable duplicates: same client + similar name, different keys
  const byClient = new Map<string, typeof groups extends Map<string, infer V> ? V[] : never>()
  for (const g of groups.values()) {
    const list = byClient.get(g.clientId) ?? []
    list.push(g)
    byClient.set(g.clientId, list)
  }
  for (const [clientId, list] of byClient) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]
        const b = list[j]
        if (normalizeName(a.name) === normalizeName(b.name)) {
          report.probableDuplicates.push({
            clientId,
            siteName: a.name,
            keys: [a.key, b.key],
            jobIds: [...a.jobIds, ...b.jobIds],
          })
        }
      }
    }
  }

  const now = nowIso()
  const insertSite = db.prepare(`
    INSERT INTO Site (
      id, clientId, name, nameLower,
      addressLine1, addressLine2, city, county, postcode, postcodeNormalized, country,
      siteReference, primaryContactId, notes,
      isActive, archivedAt, archivedBy, createdAt, updatedAt
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,NULL,NULL,?,?)
  `)
  const linkJob = db.prepare(`UPDATE Job SET siteId = ?, updatedAt = ? WHERE id = ?`)
  const linkRevisions = db.prepare(`
    UPDATE Job SET siteId = ?, updatedAt = ?
    WHERE parentJobId = ? AND (siteId IS NULL OR siteId = '')
  `)

  db.transaction(() => {
    for (const g of groups.values()) {
      // Only create Managed Sites where multiple jobs clearly share a location.
      // Single-job groups remain one-off — users can promote later.
      if (g.jobIds.length < 2) {
        report.ambiguousJobs.push({
          jobId: g.jobIds[0],
          drawingNumber: "",
          reason: "Single job at this address — left as one-off (promote later if needed)",
        })
        continue
      }

      const siteId = createId()
      const postcode = g.postcode
      insertSite.run(
        siteId,
        g.clientId,
        g.name,
        normalizeName(g.name),
        g.addressLine1,
        null,
        g.city,
        null,
        postcode,
        postcode ? normalizePostcode(postcode) : null,
        "United Kingdom",
        null,
        null,
        null,
        now,
        now,
      )
      report.sitesCreated++
      for (const jobId of g.jobIds) {
        linkJob.run(siteId, now, jobId)
        linkRevisions.run(siteId, now, jobId)
        report.jobsLinked++
      }
      report.sites.push({
        id: siteId,
        clientId: g.clientId,
        name: g.name,
        jobCount: g.jobIds.length,
      })
    }

    // ParentJob backfill when table exists
    try {
      const parents = db.prepare(`
        SELECT id, clientId, siteName, siteAddress, address, siteId
        FROM ParentJob WHERE siteId IS NULL OR siteId = ''
      `).all() as Array<{
        id: string
        clientId: string | null
        siteName: string | null
        siteAddress: string | null
        address: string
        siteId: string | null
      }>
      for (const p of parents) {
        if (!p.clientId) continue
        const name = (p.siteName ?? "").trim() || "Unnamed site"
        const parsed = parseLegacySiteAddress(p.siteAddress || p.address)
        // Prefer an already-created site with same client + normalised name
        let siteId = report.sites.find(s =>
          s.clientId === p.clientId && normalizeName(s.name) === normalizeName(name),
        )?.id
        if (!siteId) {
          siteId = createId()
          insertSite.run(
            siteId,
            p.clientId,
            name,
            normalizeName(name),
            parsed.addressLine1,
            null,
            parsed.city,
            null,
            parsed.postcode,
            parsed.postcode ? normalizePostcode(parsed.postcode) : null,
            "United Kingdom",
            null, null, null, now, now,
          )
          report.sitesCreated++
          report.sites.push({ id: siteId, clientId: p.clientId, name, jobCount: 0 })
        }
        db.prepare("UPDATE ParentJob SET siteId = ?, updatedAt = ? WHERE id = ?")
          .run(siteId, now, p.id)
        report.parentJobsLinked++
      }
    } catch {
      // ParentJob may not exist
    }
  })()

  return report
}
