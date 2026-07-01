import { createAdminClient } from "@/lib/supabase/admin"
import type {
  EmployeeActivityRow,
  EmployeeDocumentRow,
  EmployeeNoteRow,
  EmployeeProfileRow,
  EmployeeSkillRow,
} from "@/modules/employees/types/employee-types"
import {
  toEmployeeActivityRow,
  toEmployeeDocumentRow,
  toEmployeeNoteRow,
  toEmployeeProfileRow,
  toEmployeeSkillRow,
  toSupabaseEmployeeActivityRow,
  toSupabaseEmployeeDocumentRow,
  toSupabaseEmployeeNoteRow,
  toSupabaseEmployeeProfileRow,
  toSupabaseEmployeeSkillRow,
} from "@/modules/employees/supabase/mapper"

function profiles() {
  return createAdminClient().from("employee_profiles")
}

function skills() {
  return createAdminClient().from("employee_skills")
}

function documents() {
  return createAdminClient().from("employee_documents")
}

function notes() {
  return createAdminClient().from("employee_notes")
}

function activity() {
  return createAdminClient().from("employee_activity")
}

export const supabaseEmployeeRepo = {
  async upsertProfile(row: EmployeeProfileRow): Promise<void> {
    const { error } = await profiles().upsert(toSupabaseEmployeeProfileRow(row), { onConflict: "user_id" })
    if (error) throw error
  },

  async findProfile(userId: string): Promise<EmployeeProfileRow | null> {
    const { data, error } = await profiles().select("*").eq("user_id", userId).maybeSingle()
    if (error) throw error
    return data ? toEmployeeProfileRow(data) : null
  },

  async listProfiles(): Promise<EmployeeProfileRow[]> {
    const { data, error } = await profiles().select("*").order("updated_at", { ascending: false })
    if (error) throw error
    return (data ?? []).map(toEmployeeProfileRow)
  },

  async directReportIds(managerId: string): Promise<string[]> {
    const { data, error } = await profiles().select("user_id").eq("manager_id", managerId)
    if (error) throw error
    return (data ?? []).map(r => r.user_id as string)
  },

  async departments(): Promise<string[]> {
    const { data, error } = await profiles().select("department").not("department", "is", null)
    if (error) throw error
    return [...new Set(
      (data ?? []).map(r => (r.department as string).trim()).filter(Boolean),
    )].sort()
  },

  async upsertSkill(row: EmployeeSkillRow): Promise<void> {
    const { error } = await skills().upsert(toSupabaseEmployeeSkillRow(row), { onConflict: "id" })
    if (error) throw error
  },

  async deleteSkill(id: string): Promise<void> {
    const { error } = await skills().delete().eq("id", id)
    if (error) throw error
  },

  async findSkillsByUser(userId: string): Promise<EmployeeSkillRow[]> {
    const { data, error } = await skills().select("*").eq("user_id", userId).order("name")
    if (error) throw error
    return (data ?? []).map(toEmployeeSkillRow)
  },

  async upsertDocument(row: EmployeeDocumentRow): Promise<void> {
    const { error } = await documents().upsert(toSupabaseEmployeeDocumentRow(row), { onConflict: "id" })
    if (error) throw error
  },

  async deleteDocument(id: string): Promise<void> {
    const { error } = await documents().delete().eq("id", id)
    if (error) throw error
  },

  async findDocumentsByUser(userId: string, includeRestricted: boolean): Promise<EmployeeDocumentRow[]> {
    let q = documents().select("*").eq("user_id", userId).order("created_at", { ascending: false })
    if (!includeRestricted) q = q.eq("restricted", false)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map(toEmployeeDocumentRow)
  },

  async upsertNote(row: EmployeeNoteRow): Promise<void> {
    const { error } = await notes().upsert(toSupabaseEmployeeNoteRow(row), { onConflict: "id" })
    if (error) throw error
  },

  async findNotesByUser(userId: string): Promise<EmployeeNoteRow[]> {
    const { data, error } = await notes().select("*").eq("user_id", userId).order("updated_at", { ascending: false })
    if (error) throw error
    return (data ?? []).map(toEmployeeNoteRow)
  },

  async insertActivity(row: EmployeeActivityRow): Promise<void> {
    const { error } = await activity().upsert(toSupabaseEmployeeActivityRow(row), { onConflict: "id" })
    if (error) throw error
  },

  async findActivityByUser(userId: string, limit: number): Promise<EmployeeActivityRow[]> {
    const { data, error } = await activity()
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)
    if (error) throw error
    return (data ?? []).map(toEmployeeActivityRow)
  },
}
