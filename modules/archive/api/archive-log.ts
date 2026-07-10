import { NextResponse } from "next/server"import { apiInternalError } from "@/shared/api-errors"

import { requireSignIn } from "@/shared/auth/auth"
import { archiveLogService } from "../services/archive-log-service"

export async function GET() {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const entries = await archiveLogService.findMany(500)
    return NextResponse.json(entries)
  } catch (err) {
    return apiInternalError("archive.api.archive-log", err)
  }
}
