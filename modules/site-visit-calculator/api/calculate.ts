import { NextRequest, NextResponse } from "next/server"
import { requireSignIn } from "@/shared/auth/auth"
import { apiInternalError } from "@/shared/api-errors"
import {
  calculateSiteVisitCost,
  GeocodeError,
  RoutingError,
} from "../services/calculator-service"
import { parseCalculateBody } from "./validation"

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

    const parsed = parseCalculateBody(body)
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 422 })
    }

    const result = await calculateSiteVisitCost(parsed.data)
    return NextResponse.json({ result })
  } catch (err) {
    if (err instanceof GeocodeError) {
      return NextResponse.json({ error: err.message }, { status: 422 })
    }
    if (err instanceof RoutingError) {
      const status = err.code === "NO_ROUTE" ? 422 : 503
      return NextResponse.json({ error: err.message }, { status })
    }
    if (err instanceof Error && err.message.includes("Time on site")) {
      return NextResponse.json({ error: err.message }, { status: 422 })
    }
    return apiInternalError("site-visit-calculator.api.calculate", err)
  }
}
