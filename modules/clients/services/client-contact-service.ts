/**
 * Client contacts — SQLite path for local/CI.
 * Only imported from client-service-sqlite (already behind isSupabaseOnly router).
 * Supabase contacts are handled in client-service-supabase.ts.
 */
import { clientContactDb } from "@/lib/db/stores/client-contact"
import type { ClientContactInput, ClientContactRow } from "../types/client-contact-types"
import { normalizeContactInputs } from "../types/client-contact-types"

export const clientContactService = {
  async findByClientId(clientId: string): Promise<ClientContactRow[]> {
    return clientContactDb.findByClientId(clientId)
  },

  async replaceForClient(clientId: string, contacts: ClientContactInput[]): Promise<ClientContactRow[]> {
    return clientContactDb.replaceForClient(clientId, normalizeContactInputs(contacts))
  },
}
