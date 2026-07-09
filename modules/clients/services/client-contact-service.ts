import { nowIso } from "@/lib/db/helpers"
import { clientContactDb } from "@/lib/db/stores/client-contact"
import { useSupabaseClients } from "@/lib/supabase/feature-flags"
import type { ClientContactInput, ClientContactRow } from "../types/client-contact-types"
import { normalizeContactInputs } from "../types/client-contact-types"
import { supabaseClientContactRepo } from "../supabase/client-contact-repository"

export const clientContactService = {
  async findByClientId(clientId: string): Promise<ClientContactRow[]> {
    if (!useSupabaseClients()) return clientContactDb.findByClientId(clientId)
    try {
      return await supabaseClientContactRepo.findByClientId(clientId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/client_contacts|relation.*does not exist/i.test(msg)) {
        return clientContactDb.findByClientId(clientId)
      }
      return []
    }
  },

  async replaceForClient(clientId: string, contacts: ClientContactInput[]): Promise<ClientContactRow[]> {
    const normalized = normalizeContactInputs(contacts)
    const now = nowIso()

    if (!useSupabaseClients()) {
      return clientContactDb.replaceForClient(clientId, normalized)
    }

    try {
      const saved = await supabaseClientContactRepo.replaceForClient(clientId, normalized, now)
      clientContactDb.replaceForClient(clientId, normalized)
      return saved
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/client_contacts|relation.*does not exist/i.test(msg)) {
        return clientContactDb.replaceForClient(clientId, normalized)
      }
      throw err
    }
  },
}
