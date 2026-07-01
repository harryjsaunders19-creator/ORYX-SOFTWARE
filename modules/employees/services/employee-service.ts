import { createId } from "@paralleldrive/cuid2"
import type { UserRow } from "@/lib/db/user-types"
import type {
  EmployeeProfileRow,
  EmployeeSkillRow,
  EmployeeDocumentRow,
  EmployeeNoteRow,
  EmployeeActivityRow,
  UpdateEmployeeProfileData,
  EmploymentStatus,
  SkillCategory,
} from "@/modules/employees/types/employee-types"
import {
  employeeProfileDb,
  employeeSkillDb,
  employeeDocumentDb,
  employeeNoteDb,
  employeeActivityDb,
} from "@/lib/db/stores"
import { userService } from "@/lib/services/user-service"
import { useSupabaseEmployees } from "@/lib/supabase/feature-flags"
import { supabaseEmployeeRepo } from "@/modules/employees/supabase/repository"
import {
  resolveEmployeeAccess,
  canViewEmployee,
  canViewSalary,
  canViewNotes,
  filterPatchByAccess,
  type EmployeeAccess,
} from "@/modules/employees/permissions"
import type { Role } from "@/shared/types/role"

export interface EmployeeListItem {
  userId: string
  name: string
  email: string | null
  role: Role
  active: boolean
  employeeId: string | null
  profilePhotoPath: string | null
  jobTitle: string | null
  department: string | null
  phone: string | null
  employmentStatus: EmploymentStatus
  startDate: string | null
  profileCompletion: number
}

export interface EmployeeDetail extends EmployeeListItem {
  profile: Omit<EmployeeProfileRow, "salary"> & { salary?: number | null }
  managerName: string | null
  skills: EmployeeSkillRow[]
  documents: EmployeeDocumentRow[]
  notes?: EmployeeNoteRow[]
  activity: EmployeeActivityRow[]
  leave: {
    annualLeaveAllowance: number
    leaveTaken: number
    remaining: number
    upcoming: { id: string; title: string; startDate: string; endDate: string; status?: string }[]
    history: { id: string; title: string; startDate: string; endDate: string; status?: string }[]
  }
  yearsOfService: number | null
  profileCompletion: number
}

const PROFILE_FIELDS: (keyof EmployeeProfileRow)[] = [
  "firstName", "lastName", "phone", "mobile", "jobTitle", "department",
  "startDate", "address", "emergencyContactName", "profilePhotoPath",
]

export function computeProfileCompletion(profile: EmployeeProfileRow, user: UserRow): number {
  let filled = 0
  const total = PROFILE_FIELDS.length + 1
  if (user.email) filled++
  for (const f of PROFILE_FIELDS) {
    const v = profile[f]
    if (v != null && String(v).trim() !== "") filled++
  }
  return Math.round((filled / total) * 100)
}

function buildListItem(profile: EmployeeProfileRow, user: UserRow): EmployeeListItem {
  const displayName = profile.preferredName?.trim()
    || [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim()
    || user.name
  return {
    userId: user.id,
    name: displayName,
    email: user.email,
    role: user.role as Role,
    active: !!user.active,
    employeeId: profile.employeeId,
    profilePhotoPath: profile.profilePhotoPath,
    jobTitle: profile.jobTitle,
    department: profile.department,
    phone: profile.phone ?? profile.mobile,
    employmentStatus: profile.employmentStatus,
    startDate: profile.startDate,
    profileCompletion: computeProfileCompletion(profile, user),
  }
}

function yearsOfService(startDate: string | null): number | null {
  if (!startDate) return null
  const start = new Date(startDate)
  if (Number.isNaN(start.getTime())) return null
  return Math.floor((Date.now() - start.getTime()) / (365.25 * 24 * 3600 * 1000))
}

function redactProfile(profile: EmployeeProfileRow, access: EmployeeAccess): EmployeeProfileRow {
  if (canViewSalary(access)) return profile
  return { ...profile, salary: null }
}

async function fetchLeaveEvents(userId: string) {
  const { leaveService } = await import("@/modules/leave")
  return leaveService.getLeaveSummaryForUser(userId)
}

async function mirrorProfile(row: EmployeeProfileRow | null): Promise<void> {
  if (row && useSupabaseEmployees()) await supabaseEmployeeRepo.upsertProfile(row)
}

async function ensureProfile(userId: string): Promise<EmployeeProfileRow> {
  const profile = employeeProfileDb.ensure(userId)
  await mirrorProfile(profile)
  return profile
}

export const employeeService = {
  async getDirectReportIds(managerId: string): Promise<string[]> {
    if (useSupabaseEmployees()) return supabaseEmployeeRepo.directReportIds(managerId)
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

    let profiles: EmployeeProfileRow[]
    let total: number

    if (useSupabaseEmployees()) {
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
      total = filtered.length
      profiles = filtered.slice(skip, skip + limit)
    } else {
      profiles = employeeProfileDb.findMany({
        search: opts.search,
        department: opts.department,
        status: opts.status,
        skip,
        take: limit,
        sortBy: opts.sortBy,
        sortDir: opts.sortDir,
      })
      total = employeeProfileDb.count({
        search: opts.search,
        department: opts.department,
        status: opts.status,
      })
    }

    const users = await userService.findManyByIds(profiles.map(p => p.userId))
    const userById = new Map(users.map(u => [u.id, u]))
    const employees = profiles.map(p => {
      const user = userById.get(p.userId)
      if (!user) throw new Error(`Missing user ${p.userId}`)
      return buildListItem(p, user)
    })

    const departments = useSupabaseEmployees()
      ? await supabaseEmployeeRepo.departments()
      : employeeProfileDb.departments()

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

    const skills = useSupabaseEmployees()
      ? await supabaseEmployeeRepo.findSkillsByUser(userId)
      : employeeSkillDb.findByUser(userId)
    const documents = useSupabaseEmployees()
      ? await supabaseEmployeeRepo.findDocumentsByUser(userId, includeRestricted)
      : employeeDocumentDb.findByUser(userId, includeRestricted)
    const activity = useSupabaseEmployees()
      ? await supabaseEmployeeRepo.findActivityByUser(userId, 30)
      : employeeActivityDb.findByUser(userId, 30)

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
      detail.notes = useSupabaseEmployees()
        ? await supabaseEmployeeRepo.findNotesByUser(userId)
        : employeeNoteDb.findByUser(userId)
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

    await ensureProfile(userId)
    const updated = employeeProfileDb.update(userId, filtered)
    if (updated) {
      await mirrorProfile(updated)
      employeeActivityDb.log({
        id: createId(),
        userId,
        action: "PROFILE_UPDATED",
        detail: Object.keys(filtered).join(", "),
        performedBy: viewer.id,
        performedByName: viewer.name,
      })
      if (useSupabaseEmployees()) {
        const logged = employeeActivityDb.findByUser(userId, 1)[0]
        if (logged) await supabaseEmployeeRepo.insertActivity(logged)
      }
    }
    return { profile: updated ? redactProfile(updated, access) : null }
  },

  async addSkill(viewer: UserRow, userId: string, data: {
    name: string; level?: string; yearsExperience?: number; category?: SkillCategory
  }): Promise<EmployeeSkillRow | null> {
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
    if (useSupabaseEmployees()) await supabaseEmployeeRepo.upsertSkill(skill)
    employeeActivityDb.log({
      id: createId(), userId, action: "SKILL_ADDED", detail: data.name,
      performedBy: viewer.id, performedByName: viewer.name,
    })
    if (useSupabaseEmployees()) {
      const logged = employeeActivityDb.findByUser(userId, 1)[0]
      if (logged) await supabaseEmployeeRepo.insertActivity(logged)
    }
    return skill
  },

  async removeSkill(viewer: UserRow, userId: string, skillId: string): Promise<boolean> {
    const access = await this.getAccess(viewer, userId)
    if (access !== "admin" && access !== "manager" && viewer.id !== userId) return false
    const ok = employeeSkillDb.delete(skillId, userId)
    if (ok && useSupabaseEmployees()) await supabaseEmployeeRepo.deleteSkill(skillId)
    return ok
  },

  async addNote(viewer: UserRow, userId: string, content: string): Promise<EmployeeNoteRow | null> {
    const access = await this.getAccess(viewer, userId)
    if (!canViewNotes(access) || access === "self") return null
    const note = employeeNoteDb.create({
      id: createId(), userId, content, createdBy: viewer.id, createdByName: viewer.name,
    })
    if (useSupabaseEmployees()) await supabaseEmployeeRepo.upsertNote(note)
    return note
  },

  async logActivity(userId: string, action: string, detail: string | null, viewer: UserRow) {
    employeeActivityDb.log({
      id: createId(), userId, action, detail, performedBy: viewer.id, performedByName: viewer.name,
    })
    if (useSupabaseEmployees()) {
      const logged = employeeActivityDb.findByUser(userId, 1)[0]
      if (logged) await supabaseEmployeeRepo.insertActivity(logged)
    }
  },
}
