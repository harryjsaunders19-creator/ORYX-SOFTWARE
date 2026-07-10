/** Max rows per entity in System Backup → Export Excel. */
export const MAX_GLOBAL_EXPORT_ROWS = 10_000

/** Max rows returned by GET /api/jobs?export=true. */
export const MAX_JOB_LIST_EXPORT_ROWS = 5_000

/** Max data rows imported per worksheet (header row excluded). */
export const MAX_IMPORT_SHEET_ROWS = 5_000

/** Max existing rows loaded for import deduplication lookups. */
export const MAX_IMPORT_LOOKUP_ROWS = 10_000
