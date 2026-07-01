/**
 * Import / export module — public API.
 * @see modules/import-export/README.md
 */
export {
  buildGlobalExportWorkbook,
  globalExportToBuffer,
} from "./services/global-export"

export {
  importFromExcelBuffer,
  shouldUseBulkImport,
} from "./services/excel-import"

export type { ImportResult, SheetResult } from "./services/excel-import"

export {
  buildClientRowFromImport,
  buildJobRowFromImport,
  buildQuoteRowFromImport,
  bulkImportClients,
  bulkImportJobs,
  bulkImportQuotes,
  formatImportError,
} from "./services/import-excel-bulk"

export { sheetDataRows } from "./utils/excel-import-rows"
