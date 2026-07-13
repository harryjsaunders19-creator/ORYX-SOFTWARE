import { NextResponse } from "next/server"
import { jobService } from "../services/job-service"
import { requireSignIn } from "@/shared/auth/auth"
import { listResponse } from "@/shared/utils/api-cache"
import { apiInternalError } from "@/shared/api-errors"

export async function GET() {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth
    return listResponse({ designers: jobService.distinctDesigners() })
  } catch (err) {
    return apiInternalError("jobs.api.designers", err)
  }
}
