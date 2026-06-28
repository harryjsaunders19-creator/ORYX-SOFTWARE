import { NextResponse } from "next/server"
import { quoteService } from "@/lib/services/quote-service"
import { requireSignIn } from "@/lib/auth"

export async function DELETE() {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    await quoteService.expirePastDue()
    const { deleted } = await quoteService.clearExpired()
    return NextResponse.json({ deleted })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
