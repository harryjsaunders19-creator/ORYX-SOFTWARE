import { createAdminClient } from "@/lib/supabase/admin"
import type { ArchiveLogRow } from "../types/archive-types"
import { toArchiveLogRow, toSupabaseArchiveLogRow } from "./mapper"

function table() {
  return createAdminClient().from("archive_log")
}

export const supabaseArchiveLogRepo = {
  async insert(row: ArchiveLogRow): Promise<void> {
    const { error } = await table().insert(toSupabaseArchiveLogRow(row))
    if (error) throw error
  },

  async findMany(limit = 200): Promise<ArchiveLogRow[]> {
    const { data, error } = await table()
      .select("*")
      .order("performed_at", { ascending: false })
      .limit(limit)
    if (error) throw error
    return (data ?? []).map(toArchiveLogRow)
  },

  async findForEntity(entityType: string, entityId: string): Promise<ArchiveLogRow[]> {
    const { data, error } = await table()
      .select("*")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("performed_at", { ascending: false })
    if (error) throw error
    return (data ?? []).map(toArchiveLogRow)
  },

  async findLatestArchiveForEntities(
    entityType: string,
    entityIds: string[],
  ): Promise<Map<string, ArchiveLogRow>> {
    const result = new Map<string, ArchiveLogRow>()
    if (!entityIds.length) return result
    const { data, error } = await table()
      .select("*")
      .eq("entity_type", entityType)
      .eq("action", "archive")
      .in("entity_id", entityIds)
      .order("performed_at", { ascending: false })
    if (error) throw error
    for (const row of data ?? []) {
      const mapped = toArchiveLogRow(row)
      if (!result.has(mapped.entityId)) result.set(mapped.entityId, mapped)
    }
    return result
  },
}
