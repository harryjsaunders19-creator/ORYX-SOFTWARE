/**
 * Sites module — public API.
 * Import from `@/modules/sites` only.
 */
export { siteService } from "./services/site-service"

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

export {
  formatSiteAddress,
  normalizeName,
  normalizePostcode,
  normalizeAddressLine,
  parseLegacySiteAddress,
  siteDedupKey,
  siteSimilarity,
} from "./lib/normalize"

export { SiteSelector } from "./components/site-selector"
export { CreateSiteDialog } from "./components/create-site-dialog"
export { SiteSummaryCard } from "./components/site-summary"
export { SiteDetailsPanel } from "./components/site-details-panel"
export { SiteJobsList } from "./components/site-jobs-list"
export { SiteFilter } from "./components/site-filter"
