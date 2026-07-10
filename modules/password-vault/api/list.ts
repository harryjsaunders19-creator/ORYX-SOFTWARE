import { NextRequest, NextResponse } from "next/server"import { apiInternalError } from "@/shared/api-errors"

import { listResponse } from "@/shared/utils/api-cache"
import { requireRole } from "@/shared/auth/auth"
import { passwordVaultService } from "../services/vault-service"
import { parseCreateBody, parseSortOrder } from "./validation"

export async function GET(req: NextRequest) {
  try {
    const auth = await requireRole(["ADMIN"])
    if (auth instanceof NextResponse) return auth

    const sp = req.nextUrl.searchParams
    const search = sp.get("search") ?? ""
    const sort = parseSortOrder(sp.get("sort"))

    const entries = await passwordVaultService.findMany({ search, sort })
    return listResponse({ entries, total: entries.length })
  } catch (err) {
    return apiInternalError("password-vault.api.list", err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireRole(["ADMIN"])
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
    return apiInternalError("password-vault.api.list", err)
  }
}
