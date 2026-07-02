import { NextRequest, NextResponse } from "next/server"
import { listResponse } from "@/shared/utils/api-cache"
import { requireSignIn } from "@/shared/auth/auth"
import { passwordVaultService } from "../services/vault-service"
import { parseCreateBody, parseSortOrder } from "./validation"

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const sp = req.nextUrl.searchParams
    const search = sp.get("search") ?? ""
    const sort = parseSortOrder(sp.get("sort"))

    const entries = await passwordVaultService.findMany({ search, sort })
    return listResponse({ entries, total: entries.length })
  } catch (err) {
    console.error("[GET /api/password-vault]", err)
    return NextResponse.json({ error: "Failed to load password vault" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    let body: Record<string, unknown>
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

    const parsed = parseCreateBody(body)
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 422 })
    }

    const entry = await passwordVaultService.create(parsed.data)
    return NextResponse.json({ entry }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/password-vault]", err)
    return NextResponse.json({ error: "Failed to create vault entry" }, { status: 500 })
  }
}
