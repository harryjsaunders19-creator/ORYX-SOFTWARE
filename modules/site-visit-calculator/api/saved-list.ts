import { NextRequest, NextResponse } from "next/server"
import { requireSignIn, actorName } from "@/shared/auth/auth"
import { apiInternalError } from "@/shared/api-errors"
import { savedCalculationService } from "../services/saved-service"
import { parseSaveBody } from "./validation"

export async function GET() {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth
    const items = await savedCalculationService.findMany()
    return NextResponse.json({ items })
  } catch (err) {
    return apiInternalError("site-visit-calculator.api.saved.list", err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }

    const parsed = parseSaveBody(body)
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 422 })
    }

    const saved = await savedCalculationService.create(
      parsed.data,
      auth.user.id,
      actorName(auth.user),
    )
    return NextResponse.json({ item: saved }, { status: 201 })
  } catch (err) {
    return apiInternalError("site-visit-calculator.api.saved.create", err)
  }
}
