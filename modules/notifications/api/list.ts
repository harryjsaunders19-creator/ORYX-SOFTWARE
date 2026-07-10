import { NextResponse } from "next/server"import { apiInternalError } from "@/shared/api-errors"

import { requireSignIn } from "@/shared/auth/auth"
import { notificationService } from "../services/notification-service"
import { listResponse } from "@/shared/utils/api-cache"

export async function GET() {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    return listResponse(await notificationService.list(auth.user))
  } catch (err) {
    return apiInternalError("notifications.api.list", err)
  }
}
