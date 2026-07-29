/**
 * Employee service — Supabase path for production / linked-project mode.
 *
 * Pure Supabase via supabaseEmployeeRepo; no SQLite stores, no mirrors.
 * Loaded by the entry router when isSupabaseOnly() is true.
 */
import { createId } from "@paralleldrive/cuid2"
import type { UserRow } from "@/modules/users/types"
import type {
  EmployeeProfileRow,
  EmployeeActivityRow,
  EmployeeDocumentRow,
  UpdateEmployeeProfileData,
  SkillCategory,
} from "@/modules/employees/types/employee-types"
import { nowIso } from "@/lib/db/helpers"
import { supabaseEmployeeRepo } from "@/modules/employees/supabase/repository"
import { userService } from "@/modules/users"
import {
  resolveEmployeeAccess,
  canViewEmployee,
  canViewSalary,
  canViewNotes,
  filterPatchByAccess,
  type EmployeeAccess,
} from "@/modules/employees/permissions"
import {
  buildListItem,
  yearsOfService,
  redactProfile,
  computeProfileCompletion,
  type EmployeeListItem,
  type EmployeeDetail,
} from "./employee-service-shared"

async function fetchLeaveEvents(userId: string) {
  const { leaveService } = await import("@/modules/leave")
  return leaveService.getLeaveSummaryForUser(userId)
}

async function ensureProfile(userId: string): Promise<EmployeeProfileRow> {
  const existing = await supabaseEmployeeRepo.findProfile(userId)
  if (existing) return existing
  const now = nowIso()
  const allProfiles = await supabaseEmployeeRepo.listProfiles()
  const employeeId = `EMP-${String(allProfiles.length + 1).padStart(4, "0")}`
  const created: EmployeeProfileRow = {
    userId,
    employeeId,
    profilePhotoPath: null,
    firstName: null,
    lastName: null,
    preferredName: null,
    phone: null,
    mobile: null,
    dateOfBirth: null,
    gender: null,
    nationality: null,
    address: null,
    city: null,
    county: null,
    postcode: null,
    country: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    emergencyContactRelationship: null,
    jobTitle: null,
    department: null,
    managerId: null,
    officeLocation: null,
    employmentType: "FULL_TIME",
    employmentStatus: "ACTIVE",
    startDate: null,
    endDate: null,
    probationEndDate: null,
    workingHours: null,
    salary: null,
    annualLeaveAllowance: 25,
    leaveTaken: 0,
    createdAt: now,
    updatedAt: now,
  }
  await supabaseEmployeeRepo.upsertProfile(created)
  return created
}

async function logActivityRow(
  userId: string,
  action: string,
  detail: string | null,
  performedBy: string,
  performedByName: string,
): Promise<EmployeeActivityRow> {
  const row: EmployeeActivityRow = {
    id: createId(),
    userId,
    action,
    detail,
    performedBy,
    performedByName,
    createdAt: nowIso(),
  }
  await supabaseEmployeeRepo.insertActivity(row)
  return row
}

export const employeeService = {
  async getDirectReportIds(managerId: string): Promise<string[]> {
    return supabaseEmployeeRepo.directReportIds(managerId)
  },

  async getAccess(viewer: UserRow, targetUserId: string): Promise<EmployeeAccess> {
    const reports = await this.getDirectReportIds(viewer.id)
    return resolveEmployeeAccess(viewer, targetUserId, reports)
  },

  async findMany(viewer: UserRow, opts: {
    search?: string
    department?: string
    status?: string
    page?: number
    limit?: number
    sortBy?: string
    sortDir?: "asc" | "desc"
  }): Promise<{ employees: EmployeeListItem[]; total: number; departments: string[] }> {
    const page = opts.page ?? 1
    const limit = Math.min(100, opts.limit ?? 50)
    const skip = (page - 1) * limit

    const allProfiles = await supabaseEmployeeRepo.listProfiles()
    let filtered = allProfiles
    if (opts.department) filtered = filtered.filter(p => p.department === opts.department)
    if (opts.status) filtered = filtered.filter(p => p.employmentStatus === opts.status)
    if (opts.search?.trim()) {
      const users = await userService.findMany({ activeOnly: true })
      const userById = new Map(users.map(u => [u.id, u]))
      const q = opts.search.trim().toLowerCase()
      filtered = filtered.filter(p => {
        const u = userById.get(p.userId)
        const hay = [
          u?.name, u?.email, p.firstName, p.lastName, p.jobTitle, p.department, p.employeeId,
        ].filter(Boolean).join(" ").toLowerCase()
        return hay.includes(q)
      })
    }
    const total = filtered.length
    const profiles = filtered.slice(skip, skip + limit)

    const users = await userService.findManyByIds(profiles.map(p => p.userId))
    const userById = new Map(users.map(u => [u.id, u]))
    const employees = profiles.map(p => {
      const user = userById.get(p.userId)
      if (!user) throw new Error(`Missing user ${p.userId}`)
      return buildListItem(p, user)
    })

    const departments = await supabaseEmployeeRepo.departments()
    return { employees, total, departments }
  },

  async getDetail(viewer: UserRow, userId: string): Promise<EmployeeDetail | null> {
    const user = await userService.findUnique(userId)
    if (!user) return null
    const reports = await this.getDirectReportIds(viewer.id)
    const access = resolveEmployeeAccess(viewer, userId, reports)
    if (!canViewEmployee(viewer, userId, reports)) return null

    const profile = await ensureProfile(userId)
    const manager = profile.managerId ? await userService.findUnique(profile.managerId) : null
    const includeRestricted = access === "admin" || access === "manager"
    const leaveEvents = await fetchLeaveEvents(userId)

    let viewProfile = profile
    if (access === "none") {
      viewProfile = {
        ...profile,
        salary: null,
        dateOfBirth: null,
        address: null,
        city: null,
        county: null,
        postcode: null,
        country: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
        emergencyContactRelationship: null,
        gender: null,
        nationality: null,
      }
    }
    const redacted = redactProfile(viewProfile, access)

    const skills = await supabaseEmployeeRepo.findSkillsByUser(userId)
    const documents = await supabaseEmployeeRepo.findDocumentsByUser(userId, includeRestricted)
    const activity = await supabaseEmployeeRepo.findActivityByUser(userId, 30)

    const detail: EmployeeDetail = {
      ...buildListItem(profile, user),
      profile: canViewSalary(access) ? viewProfile : { ...redacted, salary: undefined },
      managerName: manager?.name ?? null,
      skills,
      documents,
      activity,
      leave: leaveEvents,
      yearsOfService: yearsOfService(profile.startDate),
      profileCompletion: computeProfileCompletion(profile, user),
    }

    if (canViewNotes(access)) {
      detail.notes = await supabaseEmployeeRepo.findNotesByUser(userId)
    }

    return detail
  },

  async updateProfile(
    viewer: UserRow,
    userId: string,
    patch: UpdateEmployeeProfileData,
  ): Promise<{ profile: EmployeeProfileRow | null; error?: string }> {
    const reports = await this.getDirectReportIds(viewer.id)
    const access = resolveEmployeeAccess(viewer, userId, reports)
    if (!canViewEmployee(viewer, userId, reports)) return { profile: null, error: "Forbidden" }

    const filtered = filterPatchByAccess(access, patch as Record<string, unknown>) as UpdateEmployeeProfileData
    if (!Object.keys(filtered).length) return { profile: null, error: "No permitted fields to update" }

    if (filtered.employeeId) {
      const allProfiles = await supabaseEmployeeRepo.listProfiles()
      const dup = allProfiles.find(p => p.employeeId === filtered.employeeId && p.userId !== userId)
      if (dup) return { profile: null, error: "Employee ID already in use" }
    }

    const profile = await ensureProfile(userId)
    const updated: EmployeeProfileRow = { ...profile, ...filtered, updatedAt: nowIso() }
    await supabaseEmployeeRepo.upsertProfile(updated)

    await logActivityRow(userId, "PROFILE_UPDATED", Object.keys(filtered).join(", "), viewer.id, viewer.name)

    return { profile: redactProfile(updated, access) }
  },

  async addSkill(viewer: UserRow, userId: string, data: {
    name: string; level?: string; yearsExperience?: number; category?: SkillCategory
  }) {
    const access = await this.getAccess(viewer, userId)
    if (access === "none") return null
    if (access === "self" && viewer.id !== userId) return null
    const now = nowIso()
    const skill = {
      id: createId(),
      userId,
      name: data.name.trim(),
      level: data.level ?? null,
      yearsExperience: data.yearsExperience ?? null,
      category: data.category ?? ("SKILL" as const),
      certificatePath: null,
      createdAt: now,
      updatedAt: now,
    }
    await supabaseEmployeeRepo.upsertSkill(skill)
    await logActivityRow(userId, "SKILL_ADDED", data.name, viewer.id, viewer.name)
    return skill
  },

  async removeSkill(viewer: UserRow, userId: string, skillId: string): Promise<boolean> {
    const access = await this.getAccess(viewer, userId)
    if (access !== "admin" && access !== "manager" && viewer.id !== userId) return false
    const skills = await supabaseEmployeeRepo.findSkillsByUser(userId)
    if (!skills.find(s => s.id === skillId)) return false
    await supabaseEmployeeRepo.deleteSkill(skillId)
    return true
  },

  async addNote(viewer: UserRow, userId: string, content: string) {
    const access = await this.getAccess(viewer, userId)
    if (!canViewNotes(access) || access === "self") return null
    const now = nowIso()
    const note = {
      id: createId(),
      userId,
      content,
      createdBy: viewer.id,
      createdByName: viewer.name,
      updatedBy: null as string | null,
      updatedByName: null as string | null,
      createdAt: now,
      updatedAt: now,
    }
    await supabaseEmployeeRepo.upsertNote(note)
    return note
  },

  async logActivity(userId: string, action: string, detail: string | null, viewer: UserRow) {
    await logActivityRow(userId, action, detail, viewer.id, viewer.name)
  },

  async findProfile(userId: string): Promise<EmployeeProfileRow | null> {
    return supabaseEmployeeRepo.findProfile(userId)
  },

  async listDocuments(userId: string, includeRestricted: boolean): Promise<EmployeeDocumentRow[]> {
    return supabaseEmployeeRepo.findDocumentsByUser(userId, includeRestricted)
  },

  async createDocument(row: EmployeeDocumentRow): Promise<EmployeeDocumentRow> {
    await supabaseEmployeeRepo.upsertDocument(row)
    return row
  },

  async findDocument(id: string): Promise<EmployeeDocumentRow | null> {
    return supabaseEmployeeRepo.findDocument(id)
  },

  async deleteDocument(id: string): Promise<void> {
    await supabaseEmployeeRepo.deleteDocument(id)
  },

  async setPhotoPath(userId: string, path: string | null): Promise<void> {
    const profile = await ensureProfile(userId)
    await supabaseEmployeeRepo.upsertProfile({ ...profile, profilePhotoPath: path, updatedAt: nowIso() })
  },
}
