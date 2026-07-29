/**
 * Employee service — SQLite path for local/CI when Supabase admin is not configured.
 *
 * Dual-write to Supabase was removed: when admin credentials are present the
 * entry router loads employee-service-supabase.ts instead (isSupabaseOnly()).
 */
import { createId } from "@paralleldrive/cuid2"
import type { UserRow } from "@/modules/users/types"
import type {
  EmployeeProfileRow,
  EmployeeDocumentRow,
  UpdateEmployeeProfileData,
  SkillCategory,
} from "@/modules/employees/types/employee-types"
import {
  employeeProfileDb,
  employeeSkillDb,
  employeeDocumentDb,
  employeeNoteDb,
  employeeActivityDb,
} from "@/lib/db/stores"
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

function ensureProfile(userId: string): EmployeeProfileRow {
  return employeeProfileDb.ensure(userId)
}

export const employeeService = {
  async getDirectReportIds(managerId: string): Promise<string[]> {
    return employeeProfileDb.directReportIds(managerId)
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

    const profiles = employeeProfileDb.findMany({
      search: opts.search,
      department: opts.department,
      status: opts.status,
      skip,
      take: limit,
      sortBy: opts.sortBy,
      sortDir: opts.sortDir,
    })
    const total = employeeProfileDb.count({
      search: opts.search,
      department: opts.department,
      status: opts.status,
    })

    const users = await userService.findManyByIds(profiles.map(p => p.userId))
    const userById = new Map(users.map(u => [u.id, u]))
    const employees = profiles.map(p => {
      const user = userById.get(p.userId)
      if (!user) throw new Error(`Missing user ${p.userId}`)
      return buildListItem(p, user)
    })

    const departments = employeeProfileDb.departments()
    return { employees, total, departments }
  },

  async getDetail(viewer: UserRow, userId: string): Promise<EmployeeDetail | null> {
    const user = await userService.findUnique(userId)
    if (!user) return null
    const reports = await this.getDirectReportIds(viewer.id)
    const access = resolveEmployeeAccess(viewer, userId, reports)
    if (!canViewEmployee(viewer, userId, reports)) return null

    const profile = ensureProfile(userId)
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

    const skills = employeeSkillDb.findByUser(userId)
    const documents = employeeDocumentDb.findByUser(userId, includeRestricted)
    const activity = employeeActivityDb.findByUser(userId, 30)

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
      detail.notes = employeeNoteDb.findByUser(userId)
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
      const dup = employeeProfileDb.findByEmployeeId(filtered.employeeId)
      if (dup && dup.userId !== userId) {
        return { profile: null, error: "Employee ID already in use" }
      }
    }

    ensureProfile(userId)
    const updated = employeeProfileDb.update(userId, filtered)
    if (updated) {
      employeeActivityDb.log({
        id: createId(),
        userId,
        action: "PROFILE_UPDATED",
        detail: Object.keys(filtered).join(", "),
        performedBy: viewer.id,
        performedByName: viewer.name,
      })
    }
    return { profile: updated ? redactProfile(updated, access) : null }
  },

  async addSkill(viewer: UserRow, userId: string, data: {
    name: string; level?: string; yearsExperience?: number; category?: SkillCategory
  }) {
    const access = await this.getAccess(viewer, userId)
    if (access === "none") return null
    if (access === "self" && viewer.id !== userId) return null
    const skill = employeeSkillDb.create({
      id: createId(),
      userId,
      name: data.name.trim(),
      level: data.level ?? null,
      yearsExperience: data.yearsExperience ?? null,
      category: data.category ?? "SKILL",
      certificatePath: null,
    })
    employeeActivityDb.log({
      id: createId(), userId, action: "SKILL_ADDED", detail: data.name,
      performedBy: viewer.id, performedByName: viewer.name,
    })
    return skill
  },

  async removeSkill(viewer: UserRow, userId: string, skillId: string): Promise<boolean> {
    const access = await this.getAccess(viewer, userId)
    if (access !== "admin" && access !== "manager" && viewer.id !== userId) return false
    return employeeSkillDb.delete(skillId, userId)
  },

  async addNote(viewer: UserRow, userId: string, content: string) {
    const access = await this.getAccess(viewer, userId)
    if (!canViewNotes(access) || access === "self") return null
    return employeeNoteDb.create({
      id: createId(), userId, content, createdBy: viewer.id, createdByName: viewer.name,
    })
  },

  async logActivity(userId: string, action: string, detail: string | null, viewer: UserRow) {
    employeeActivityDb.log({
      id: createId(), userId, action, detail, performedBy: viewer.id, performedByName: viewer.name,
    })
  },

  async findProfile(userId: string): Promise<EmployeeProfileRow | null> {
    return employeeProfileDb.findUnique(userId)
  },

  async listDocuments(userId: string, includeRestricted: boolean): Promise<EmployeeDocumentRow[]> {
    return employeeDocumentDb.findByUser(userId, includeRestricted)
  },

  async createDocument(row: EmployeeDocumentRow): Promise<EmployeeDocumentRow> {
    return employeeDocumentDb.create({
      id: row.id,
      userId: row.userId,
      name: row.name,
      category: row.category,
      filePath: row.filePath,
      mimeType: row.mimeType,
      fileSize: row.fileSize,
      restricted: row.restricted,
      uploadedBy: row.uploadedBy,
      uploadedByName: row.uploadedByName,
    })
  },

  async findDocument(id: string): Promise<EmployeeDocumentRow | null> {
    return employeeDocumentDb.findUnique(id)
  },

  async deleteDocument(id: string): Promise<void> {
    employeeDocumentDb.delete(id)
  },

  async setPhotoPath(userId: string, path: string | null): Promise<void> {
    employeeProfileDb.ensure(userId)
    employeeProfileDb.update(userId, { profilePhotoPath: path })
  },
}
