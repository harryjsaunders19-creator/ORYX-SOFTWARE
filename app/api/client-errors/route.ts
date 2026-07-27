/**
 * POST /api/client-errors
 *
 * Receives React error-boundary reports from the browser and forwards them
 * through the server logger (console + optional ERROR_WEBHOOK_URL).
 * Keeps the webhook URL server-only.
 */
import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit, rateLimitedResponse, RATE_PRESETS } from "@/shared/auth/rate-limit"
import { logError } from "@/shared/logger"
import { getCurrentUser } from "@/lib/auth"

const MAX_TAG = 120
const MAX_MESSAGE = 2000
const MAX_STACK = 4000
const MAX_PATH = 500

function clamp(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, max)
}

export async function POST(req: NextRequest) {
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  // Always key by IP so pre-login crashes on /login are covered the same way.
  if (!(await checkRateLimit(`client-error:ip:${clientIp}`, RATE_PRESETS.clientError))) {
    return rateLimitedResponse(60)
  }

  const user = await getCurrentUser().catch(() => null)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const tag = clamp(body.tag, MAX_TAG) || "client.error"
  const message = clamp(body.message, MAX_MESSAGE) || "Unknown client error"
  const stack = clamp(body.stack, MAX_STACK)
  const digest = clamp(body.digest, 200)
  const path = clamp(body.path, MAX_PATH)

  const err = new Error(message)
  if (stack) err.stack = stack

  logError(tag, err, {
    source: "client",
    digest: digest ?? undefined,
    path: path ?? undefined,
    userId: user?.id,
    userName: user?.name,
    userAgent: req.headers.get("user-agent")?.slice(0, 300) || undefined,
  })

  return NextResponse.json({ ok: true })
}
