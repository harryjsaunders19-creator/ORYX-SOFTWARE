"use client"

/**
 * Sites module — client-safe public API (components + pure helpers).
 * Do not import `@/modules/sites` from Client Components; that barrel
 * exports `siteService`, which uses Node `createRequire`.
 */
export { SiteSelector } from "./components/site-selector"
export { CreateSiteDialog } from "./components/create-site-dialog"
export { SiteSummaryCard } from "./components/site-summary"
export { SiteDetailsPanel } from "./components/site-details-panel"
export { SiteJobsList } from "./components/site-jobs-list"
export { SiteFilter } from "./components/site-filter"

export {
  formatSiteAddress,
  normalizeName,
  normalizePostcode,
  normalizeAddressLine,
  parseLegacySiteAddress,
  siteDedupKey,
  siteSimilarity,
} from "./lib/normalize"

export type {
  SiteRow,
  CreateSiteData,
  UpdateSiteData,
  SiteJobCounts,
  SiteSummary,
  SiteAuditAction,
  SiteAuditEventRow,
  MigrationReport,
} from "./types"
