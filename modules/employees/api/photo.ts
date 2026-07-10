import fs from "fs"
import path from "path"
import { NextRequest, NextResponse } from "next/server"
import { createId } from "@paralleldrive/cuid2"
import { requireSignIn } from "@/shared/auth/auth"
import { employeeService } from "@/modules/employees"
import { employeeProfileDb } from "@/lib/db/stores"
import {
  employeeUserDir,
  safeEmployeeFilename,
  resolveEmployeeFilePath,
  PHOTO_MIME,
  MAX_PHOTO_BYTES,
  canViewEmployeePhoto,
} from "@/modules/employees"
import { canEditEmployeeField } from "@/modules/employees"
import { userService } from "@/lib/services/user-service"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth
    const { id } = await ctx.params
    const profile = employeeProfileDb.findUnique(id)
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
    const fullPath = resolveEmployeeFilePath(profile.profilePhotoPath)
    if (!fullPath || !fs.existsSync(fullPath)) {
      return NextResponse.json({ error: "File missing" }, { status: 404 })
    }
    const ext = path.extname(fullPath).toLowerCase()
    const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg"
    const buf = fs.readFileSync(fullPath)
    return new NextResponse(buf, {
      headers: { "Content-Type": mime, "Cache-Control": "private, max-age=3600" },
    })
  } catch (err) {
    console.error("[GET /api/employees/[id]/photo]", err)
    return NextResponse.json({ error: "Failed to load photo" }, { status: 500 })
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
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
    const filename = `photo-${createId()}.${ext}`
    const dir = employeeUserDir(id)
    const fullPath = path.join(dir, safeEmployeeFilename(filename))
    const buf = Buffer.from(await file.arrayBuffer())
    fs.writeFileSync(fullPath, buf)

    const relPath = path.join(".data", "employee-files", id, safeEmployeeFilename(filename)).replace(/\\/g, "/")
    employeeProfileDb.ensure(id)
    const old = employeeProfileDb.findUnique(id)?.profilePhotoPath
    employeeProfileDb.update(id, { profilePhotoPath: relPath })

    if (old) {
      const oldPath = resolveEmployeeFilePath(old)
      if (oldPath && fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath) } catch { /* ignore */ }
      }
    }

    await employeeService.logActivity(id, "PHOTO_UPLOADED", filename, auth.user)
    return NextResponse.json({ profilePhotoPath: relPath })
  } catch (err) {
    console.error("[POST /api/employees/[id]/photo]", err)
    return NextResponse.json({ error: "Failed to upload photo" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth
    const { id } = await ctx.params
    const access = await employeeService.getAccess(auth.user, id)
    if (!canEditEmployeeField(access, "profilePhotoPath")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const profile = employeeProfileDb.findUnique(id)
    const photoPath = profile?.profilePhotoPath ? resolveEmployeeFilePath(profile.profilePhotoPath) : null
    if (photoPath && fs.existsSync(photoPath)) {
      fs.unlinkSync(photoPath)
    }
    employeeProfileDb.update(id, { profilePhotoPath: null })
    await employeeService.logActivity(id, "PHOTO_REMOVED", null, auth.user)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[DELETE /api/employees/[id]/photo]", err)
    return NextResponse.json({ error: "Failed to remove photo" }, { status: 500 })
  }
}
