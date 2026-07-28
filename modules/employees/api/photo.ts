import { apiInternalError } from "@/shared/api-errors"
import path from "path"
import { NextRequest, NextResponse } from "next/server"
import { createId } from "@paralleldrive/cuid2"
import { requireSignIn } from "@/shared/auth/auth"
import { employeeService } from "@/modules/employees"
import { employeeProfileDb } from "@/lib/db/stores"
import {
  safeEmployeeFilename,
  writeEmployeeFile,
  readEmployeeFile,
  deleteEmployeeFile,
  PHOTO_MIME,
  MAX_PHOTO_BYTES,
  canViewEmployeePhoto,
  canEditEmployeeField,
} from "@/modules/employees"
import { userService } from "@/modules/users"
import { useSupabaseEmployees as employeesUseSupabase } from "@/shared/supabase/feature-flags"
import { supabaseEmployeeRepo } from "@/modules/employees/supabase/repository"
import type { EmployeeProfileRow } from "@/modules/employees/types/employee-types"
import { nowIso } from "@/lib/db/helpers"
import { experimentalDisabledResponse } from "@/shared/experimental/experimental-features"

type Ctx = { params: Promise<{ id: string }> }

async function loadProfile(userId: string): Promise<EmployeeProfileRow | null> {
  if (employeesUseSupabase()) return supabaseEmployeeRepo.findProfile(userId)
  return employeeProfileDb.findUnique(userId)
}

async function ensureProfile(userId: string): Promise<EmployeeProfileRow> {
  if (employeesUseSupabase()) {
    const existing = await supabaseEmployeeRepo.findProfile(userId)
    if (existing) return existing
    const now = nowIso()
    const created: EmployeeProfileRow = {
      userId,
      employeeId: null,
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
  return employeeProfileDb.ensure(userId)
}

async function setPhotoPath(userId: string, profilePhotoPath: string | null): Promise<void> {
  if (employeesUseSupabase()) {
    const profile = await ensureProfile(userId)
    await supabaseEmployeeRepo.upsertProfile({
      ...profile,
      profilePhotoPath,
      updatedAt: nowIso(),
    })
    return
  }
  employeeProfileDb.ensure(userId)
  employeeProfileDb.update(userId, { profilePhotoPath })
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const disabled = experimentalDisabledResponse("employees")
    if (disabled) return disabled

    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth
    const { id } = await ctx.params
    const profile = await loadProfile(id)
    if (!profile?.profilePhotoPath) {
      return NextResponse.json({ error: "No photo" }, { status: 404 })
    }
    const targetUser = await userService.findUnique(id)
    if (!canViewEmployeePhoto({
      viewerActive: auth.user.active === 1,
      targetHasProfile: true,
      targetUserActive: !!targetUser?.active,
    })) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const buf = await readEmployeeFile(profile.profilePhotoPath)
    if (!buf) {
      return NextResponse.json({ error: "File missing" }, { status: 404 })
    }
    const ext = path.extname(profile.profilePhotoPath).toLowerCase()
    const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg"
    return new NextResponse(new Uint8Array(buf), {
      headers: { "Content-Type": mime, "Cache-Control": "private, max-age=3600" },
    })
  } catch (err) {
    return apiInternalError("employees.api.photo", err)
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const disabled = experimentalDisabledResponse("employees")
    if (disabled) return disabled

    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth
    const { id } = await ctx.params
    const access = await employeeService.getAccess(auth.user, id)
    if (!canEditEmployeeField(access, "profilePhotoPath")) {
      return NextResponse.json({ error: "You don't have permission to upload a photo" }, { status: 403 })
    }

    const form = await req.formData()
    const file = form.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
    }
    if (!PHOTO_MIME.has(file.type)) {
      return NextResponse.json({ error: "Photo must be PNG, JPG, or WEBP" }, { status: 422 })
    }
    if (file.size > MAX_PHOTO_BYTES) {
      return NextResponse.json({ error: "Photo must be under 5 MB" }, { status: 422 })
    }

    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"
    const filename = safeEmployeeFilename(`photo-${createId()}.${ext}`)
    const buf = Buffer.from(await file.arrayBuffer())
    const storedPath = await writeEmployeeFile({
      userId: id,
      filename,
      data: buf,
      contentType: file.type,
    })

    const profile = await ensureProfile(id)
    const old = profile.profilePhotoPath
    await setPhotoPath(id, storedPath)
    if (old && old !== storedPath) await deleteEmployeeFile(old)

    await employeeService.logActivity(id, "PHOTO_UPLOADED", filename, auth.user)
    return NextResponse.json({ profilePhotoPath: storedPath })
  } catch (err) {
    return apiInternalError("employees.api.photo", err)
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const disabled = experimentalDisabledResponse("employees")
    if (disabled) return disabled

    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth
    const { id } = await ctx.params
    const access = await employeeService.getAccess(auth.user, id)
    if (!canEditEmployeeField(access, "profilePhotoPath")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const profile = await loadProfile(id)
    await deleteEmployeeFile(profile?.profilePhotoPath)
    await setPhotoPath(id, null)
    await employeeService.logActivity(id, "PHOTO_REMOVED", null, auth.user)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiInternalError("employees.api.photo", err)
  }
}
