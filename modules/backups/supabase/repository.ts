import { createAdminClient } from "@/shared/supabase/admin"
import type { BackupAuditLogRow, BackupJobRow } from "../types/backup-types"
import {
  toBackupAuditLogRow,
  toBackupJobRow,
  toSupabaseBackupAuditLogRow,
  toSupabaseBackupJobRow,
} from "./mapper"

function jobs() {
  return createAdminClient().from("backup_jobs")
}

function auditLogs() {
  return createAdminClient().from("backup_audit_logs")
}

export const supabaseBackupRepo = {
  async findJobUnique(id: string): Promise<BackupJobRow | null> {
    const { data, error } = await jobs().select("*").eq("id", id).maybeSingle()
    if (error) throw error
    return data ? toBackupJobRow(data) : null
  },

  async findJobs(opts: { take?: number } = {}): Promise<BackupJobRow[]> {
    let q = jobs().select("*").order("created_at", { ascending: false })
    if (opts.take != null) q = q.limit(opts.take)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map(toBackupJobRow)
  },

  async findLatestCompleted(): Promise<BackupJobRow | null> {
    const { data, error } = await jobs()
      .select("*")
      .eq("status", "COMPLETED")
      .is("file_deleted_at", null)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return data ? toBackupJobRow(data) : null
  },

  async findBeyondRetention(keepCount: number): Promise<BackupJobRow[]> {
    const { data, error } = await jobs()
      .select("*")
      .eq("status", "COMPLETED")
      .is("file_deleted_at", null)
      .order("completed_at", { ascending: false })
    if (error) throw error
    return (data ?? []).map(toBackupJobRow).slice(keepCount)
  },

  async upsertJob(row: BackupJobRow): Promise<void> {
    const { error } = await jobs().upsert(toSupabaseBackupJobRow(row), { onConflict: "id" })
    if (error) throw error
  },

  async findAuditMany(opts: { take?: number } = {}): Promise<BackupAuditLogRow[]> {
    let q = auditLogs().select("*").order("created_at", { ascending: false })
    if (opts.take != null) q = q.limit(opts.take)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map(toBackupAuditLogRow)
  },

  async findAuditForBackup(backupId: string): Promise<BackupAuditLogRow[]> {
    const { data, error } = await auditLogs()
      .select("*")
      .eq("backup_id", backupId)
      .order("created_at", { ascending: true })
    if (error) throw error
    return (data ?? []).map(toBackupAuditLogRow)
  },

  async upsertAudit(row: BackupAuditLogRow): Promise<void> {
    const { error } = await auditLogs().upsert(toSupabaseBackupAuditLogRow(row), { onConflict: "id" })
    if (error) throw error
  },
}
