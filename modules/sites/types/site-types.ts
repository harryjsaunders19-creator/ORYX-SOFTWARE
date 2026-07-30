/** Site entity — physical location under a Client; parent of many Jobs. */

export interface SiteRow {
  id: string
  clientId: string
  name: string
  nameLower: string
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  county: string | null
  postcode: string | null
  postcodeNormalized: string | null
  country: string | null
  siteReference: string | null
  primaryContactId: string | null
  notes: string | null
  /** 1 = active (shown in New Job selectors), 0 = archived */
  isActive: number
  archivedAt: string | null
  archivedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateSiteData {
  id: string
  clientId: string
  name: string
  addressLine1?: string | null
  addressLine2?: string | null
  city?: string | null
  county?: string | null
  postcode?: string | null
  country?: string | null
  siteReference?: string | null
  primaryContactId?: string | null
  notes?: string | null
}

export interface UpdateSiteData {
  name?: string
  addressLine1?: string | null
  addressLine2?: string | null
  city?: string | null
  county?: string | null
  postcode?: string | null
  country?: string | null
  siteReference?: string | null
  primaryContactId?: string | null
  notes?: string | null
  isActive?: number
  archivedAt?: string | null
  archivedBy?: string | null
}

export interface SiteJobCounts {
  total: number
  active: number
  completed: number
}

/** Site with denormalized client name and job counts for UI. */
export interface SiteSummary extends SiteRow {
  clientName?: string | null
  jobCounts?: SiteJobCounts
}

export type SiteAuditAction =
  | "created"
  | "updated"
  | "address_updated"
  | "archived"
  | "restored"
  | "job_linked"
  | "job_moved"

export interface SiteAuditEventRow {
  id: string
  siteId: string
  action: SiteAuditAction | string
  summary: string
  jobId: string | null
  drawingNumber: string | null
  fromSiteId: string | null
  performedBy: string
  performedByName: string
  performedAt: string
  meta: string | null
}

export interface MigrationReport {
  sitesCreated: number
  jobsLinked: number
  parentJobsLinked: number
  probableDuplicates: Array<{
    clientId: string
    siteName: string
    keys: string[]
    jobIds: string[]
  }>
  ambiguousJobs: Array<{
    jobId: string
    drawingNumber: string
    reason: string
  }>
  jobsMissingSiteData: Array<{
    jobId: string
    drawingNumber: string
    clientId: string | null
  }>
  sites: Array<{ id: string; clientId: string; name: string; jobCount: number }>
}
