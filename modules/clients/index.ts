/**
 * Clients module — public API.
 * Import from `@/modules/clients` only; do not reach into subfolders.
 */
export { clientService, ensureClientInSqlite } from "./services/client-service"

export type {
  ClientRow,
  CreateClientData,
  UpdateClientData,
} from "./types"

export { supabaseClientRepo } from "./supabase/repository"

export {
  parseClientSpreadsheet,
  markInternalClientDuplicates,
  clientDedupKey,
  CLIENT_IMPORT_FIELDS,
  type ClientImportField,
  type ParsedClientRow,
} from "./import/import-clients"

export { ClientCombobox } from "./components/client-combobox"
export { QuickCreateClientModal } from "./components/quick-create-client-modal"

export { default as ClientDirectoryPage } from "./components/client-directory-page"
export { default as ClientDetailPage } from "./components/client-detail-page"
export { default as ClientImportPage } from "./components/client-import-page"

/** Hold list sub-domain — re-exported for convenience. */
export { holdService } from "./hold"
export type { ClientHoldRow, ClientHoldWithClientRow } from "./hold"
export { default as HoldListPage } from "./hold/components/hold-list-page"
