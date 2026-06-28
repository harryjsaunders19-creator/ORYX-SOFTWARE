import { NextResponse } from "next/server"

/** Public health-check endpoint used by Railway and other load balancers. */
export async function GET() {
  return NextResponse.json({ ok: true })
}
