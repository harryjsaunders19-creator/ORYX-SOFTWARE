import { NextRequest, NextResponse } from "next/server"
import { POST as handler } from "@/modules/site-visit-calculator/api/save-as-quotation"

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handler(req)
}
