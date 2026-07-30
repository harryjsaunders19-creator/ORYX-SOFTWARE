/**
 * Sites module — server / shared public API.
 * Client UI must import from `@/modules/sites/client` so `siteService`
 * (Node `createRequire`) never enters the browser bundle.
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
