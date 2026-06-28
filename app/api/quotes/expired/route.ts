import { NextResponse } from "next/server"
import { quoteService } from "@/lib/services/quote-service"
import { requireSignIn } from "@/lib/auth"

export async function DELETE() {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    await quoteService.expirePastDue()
    const { archived } = await quoteService.clearExpired(auth.user.id, auth.user.name)
    return NextResponse.json({ deleted: archived, archived })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
