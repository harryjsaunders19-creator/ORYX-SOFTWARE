/**
 * Client hold list — sub-domain of clients module.
 * Import from `@/modules/clients` (preferred) or `@/modules/clients/hold`.
 */
export { holdService } from "./services/hold-service"

export type { ClientHoldRow, ClientHoldWithClientRow } from "./types"

export { supabaseHoldRepo } from "./supabase/repository"

export { default as HoldListPage } from "./components/hold-list-page"
