import { NextResponse } from "next/server"
import { logError } from "./logger"
import { errorMessage } from "./utils/error-message"

/** Log a structured error and return a safe 500 JSON response. */
export function apiInternalError(
  event: string,
  err: unknown,
  fields?: Record<string, unknown>,
  opts?: { exposeDetail?: boolean },
): NextResponse {
  logError(event, err, fields)
  return NextResponse.json(
    {
      error: "Internal server error",
      ...(opts?.exposeDetail ? { detail: errorMessage(err) } : {}),
    },
    { status: 500 },
  )
}
