import { NextRequest, NextResponse } from "next/server"
import { parseOptionalMoney } from "@/lib/utils"

/** Apply an optional money field from a JSON body onto a patch/create payload. */
export function applyOptionalMoneyField(
  body: Record<string, unknown>,
  field: "variationFees" | "additionalCharges" | "quoteValue",
  data: Record<string, unknown>,
): NextResponse | null {
  if (body[field] === undefined) return null
  const parsed = parseOptionalMoney(body[field])
  if (parsed != null && parsed < 0) {
    return NextResponse.json(
      { error: `${field === "quoteValue" ? "Quote value" : field === "variationFees" ? "Variation fees" : "Additional charges"} can't be negative`, field },
      { status: 422 },
    )
  }
  data[field] = parsed ?? null
  return null
}
