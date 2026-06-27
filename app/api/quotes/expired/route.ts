import { NextResponse } from "next/server"
import { quoteService } from "@/lib/services/quote-service"
import { getCurrentUser } from "@/lib/auth"

export async function DELETE() {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 })

    await quoteService.expirePastDue()
    const { deleted } = await quoteService.clearExpired()
    return NextResponse.json({ deleted })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
