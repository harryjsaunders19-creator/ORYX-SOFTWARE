import { NextRequest, NextResponse } from "next/server"
import { requireSignIn } from "@/shared/auth/auth"
import { passwordVaultService } from "../services/vault-service"
import { parseUpdateBody } from "./validation"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireSignIn()
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const entry = passwordVaultService.findUnique(id)
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ entry })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const existing = passwordVaultService.findUnique(id)
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    let body: Record<string, unknown>
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

    const parsed = parseUpdateBody(body)
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 422 })
    }

    const entry = passwordVaultService.update(id, parsed.data)
    if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ entry })
  } catch (err) {
    console.error("[PATCH /api/password-vault/[id]]", err)
    return NextResponse.json({ error: "Failed to update vault entry" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const ok = passwordVaultService.delete(id)
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ deleted: true })
  } catch (err) {
    console.error("[DELETE /api/password-vault/[id]]", err)
    return NextResponse.json({ error: "Failed to delete vault entry" }, { status: 500 })
  }
}
