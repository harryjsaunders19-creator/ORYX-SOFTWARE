import { NextResponse } from "next/server"
import { quoteService } from "../services/quote-service"
import { requireFullAccess } from "@/shared/auth/auth"
import { apiInternalError } from "@/shared/api-errors"

export async function DELETE() {
  try {
    const auth = await requireFullAccess()
    if (auth instanceof NextResponse) return auth

    await quoteService.expirePastDue()
    const { archived } = await quoteService.clearExpired(auth.user.id, auth.user.name)
    return NextResponse.json({ archived })
  } catch (err) {
    return apiInternalError("quotes.api.expired", err)
  }
}
