import { NextResponse } from "next/server"
import { apiInternalError } from "@/shared/api-errors"
import { buildSessionPayload } from "@/shared/auth/session-payload"

export async function GET() {
  try {
    const payload = await buildSessionPayload()
    return NextResponse.json(payload)
  } catch (err) {
    return apiInternalError("auth.session.get", err)
  }
}
