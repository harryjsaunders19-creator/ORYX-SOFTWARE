import { apiInternalError } from "@/shared/api-errors"
import path from "path"
import { NextRequest, NextResponse } from "next/server"
import { createId } from "@paralleldrive/cuid2"
import { requireModuleAccess } from "@/shared/auth/auth"
import { employeeService } from "@/modules/employees"
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
import { experimentalDisabledResponse } from "@/shared/experimental/experimental-features"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const disabled = experimentalDisabledResponse("employees")
    if (disabled) return disabled

    const auth = await requireModuleAccess("employees")
    if (auth instanceof NextResponse) return auth
    const { id } = await ctx.params
    const profile = await employeeService.findProfile(id)
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

    const auth = await requireModuleAccess("employees")
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

    const profile = await employeeService.findProfile(id)
    const old = profile?.profilePhotoPath ?? null
    await employeeService.setPhotoPath(id, storedPath)
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

    const auth = await requireModuleAccess("employees")
    if (auth instanceof NextResponse) return auth
    const { id } = await ctx.params
    const access = await employeeService.getAccess(auth.user, id)
    if (!canEditEmployeeField(access, "profilePhotoPath")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const profile = await employeeService.findProfile(id)
    await deleteEmployeeFile(profile?.profilePhotoPath)
    await employeeService.setPhotoPath(id, null)
    await employeeService.logActivity(id, "PHOTO_REMOVED", null, auth.user)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiInternalError("employees.api.photo", err)
  }
}
