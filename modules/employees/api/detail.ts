import { NextRequest, NextResponse } from "next/server"
import { apiInternalError } from "@/shared/api-errors"

import { resourceResponse } from "@/shared/utils/api-cache"
import { requireModuleAccess } from "@/shared/auth/auth"
import { employeeService } from "@/modules/employees"
import type { UpdateEmployeeProfileData } from "@/modules/employees"
import { EMPLOYMENT_TYPES, EMPLOYMENT_STATUSES } from "@/modules/employees"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireModuleAccess("employees")
    if (auth instanceof NextResponse) return auth
    const { id } = await ctx.params
    const employee = await employeeService.getDetail(auth.user, id)
    if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 })
    return resourceResponse({ employee, access: await employeeService.getAccess(auth.user, id) })
  } catch (err) {
    return apiInternalError("employees.api.detail", err)
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireModuleAccess("employees")
    if (auth instanceof NextResponse) return auth
    const { id } = await ctx.params

    let body: Record<string, unknown>
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

    const patch: UpdateEmployeeProfileData = {}
    const str = (k: string) => typeof body[k] === "string" ? (body[k] as string).trim() || null : undefined
    const num = (k: string) => typeof body[k] === "number" ? body[k] as number : undefined

    if (body.firstName !== undefined) patch.firstName = str("firstName") ?? null
    if (body.lastName !== undefined) patch.lastName = str("lastName") ?? null
    if (body.preferredName !== undefined) patch.preferredName = str("preferredName") ?? null
    if (body.phone !== undefined) patch.phone = str("phone") ?? null
    if (body.mobile !== undefined) patch.mobile = str("mobile") ?? null
    if (body.dateOfBirth !== undefined) patch.dateOfBirth = str("dateOfBirth") ?? null
    if (body.gender !== undefined) patch.gender = str("gender") ?? null
    if (body.nationality !== undefined) patch.nationality = str("nationality") ?? null
    if (body.address !== undefined) patch.address = str("address") ?? null
    if (body.city !== undefined) patch.city = str("city") ?? null
    if (body.county !== undefined) patch.county = str("county") ?? null
    if (body.postcode !== undefined) patch.postcode = str("postcode") ?? null
    if (body.country !== undefined) patch.country = str("country") ?? null
    if (body.emergencyContactName !== undefined) patch.emergencyContactName = str("emergencyContactName") ?? null
    if (body.emergencyContactPhone !== undefined) patch.emergencyContactPhone = str("emergencyContactPhone") ?? null
    if (body.emergencyContactRelationship !== undefined) patch.emergencyContactRelationship = str("emergencyContactRelationship") ?? null
    if (body.jobTitle !== undefined) patch.jobTitle = str("jobTitle") ?? null
    if (body.department !== undefined) patch.department = str("department") ?? null
    if (body.managerId !== undefined) patch.managerId = str("managerId") ?? null
    if (body.officeLocation !== undefined) patch.officeLocation = str("officeLocation") ?? null
    if (body.workingHours !== undefined) patch.workingHours = str("workingHours") ?? null
    if (body.startDate !== undefined) patch.startDate = str("startDate") ?? null
    if (body.endDate !== undefined) patch.endDate = str("endDate") ?? null
    if (body.probationEndDate !== undefined) patch.probationEndDate = str("probationEndDate") ?? null
    if (body.employeeId !== undefined) patch.employeeId = str("employeeId") ?? null
    if (body.salary !== undefined) patch.salary = num("salary") ?? null
    if (body.annualLeaveAllowance !== undefined) patch.annualLeaveAllowance = num("annualLeaveAllowance")
    if (body.leaveTaken !== undefined) patch.leaveTaken = num("leaveTaken")
    if (typeof body.employmentType === "string" && EMPLOYMENT_TYPES.includes(body.employmentType as typeof EMPLOYMENT_TYPES[number])) {
      patch.employmentType = body.employmentType as typeof EMPLOYMENT_TYPES[number]
    }
    if (typeof body.employmentStatus === "string" && EMPLOYMENT_STATUSES.includes(body.employmentStatus as typeof EMPLOYMENT_STATUSES[number])) {
      patch.employmentStatus = body.employmentStatus as typeof EMPLOYMENT_STATUSES[number]
    }

    const { profile, error } = await employeeService.updateProfile(auth.user, id, patch)
    if (error === "Forbidden") return NextResponse.json({ error: "You don't have permission to edit this profile" }, { status: 403 })
    if (error) return NextResponse.json({ error }, { status: 422 })
    if (!profile) return NextResponse.json({ error: "Update failed" }, { status: 400 })

    return resourceResponse({ profile })
  } catch (err) {
    return apiInternalError("employees.api.detail", err)
  }
}
