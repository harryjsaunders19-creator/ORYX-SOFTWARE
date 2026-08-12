import { NextRequest, NextResponse } from "next/server"
import { apiInternalError } from "@/shared/api-errors"

import { requireFullAccess } from "@/shared/auth/auth"
import { resourceResponse } from "@/shared/utils/api-cache"
import { passwordVaultService } from "../services/vault-service"
import { parseUpdateBody } from "./validation"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireFullAccess()
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const entry = await passwordVaultService.findUnique(id)
    if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return resourceResponse({ entry })
  } catch (err) {
    return apiInternalError("password-vault.api.by-id", err)
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireFullAccess()
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const existing = await passwordVaultService.findUnique(id)
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    let body: Record<string, unknown>
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

    const parsed = parseUpdateBody(body)
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 422 })
    }

    const entry = await passwordVaultService.update(id, parsed.data)
    if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return resourceResponse({ entry })
  } catch (err) {
    return apiInternalError("password-vault.api.by-id", err)
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireFullAccess()
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const ok = await passwordVaultService.delete(id)
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ deleted: true })
  } catch (err) {
    return apiInternalError("password-vault.api.by-id", err)
  }
}
