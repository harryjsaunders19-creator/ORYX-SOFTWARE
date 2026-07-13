import { NextResponse } from "next/server"

/**
 * Experimental modules — off for production until HR/ops sign-off.
 * Keep `employees` / `leave` false on Vercel; code and migrations remain in-repo.
 * Set a flag to `true` only after verifying Supabase migrations 014–016.
 */
export const EXPERIMENTAL = {
  employees: false,
  leave: false,
} as const

export type ExperimentalFeature = keyof typeof EXPERIMENTAL

export function isExperimentalEnabled(feature: ExperimentalFeature): boolean {
  return EXPERIMENTAL[feature]
}

/** Use at the top of experimental API routes. */
export function experimentalDisabledResponse(feature: ExperimentalFeature): NextResponse | null {
  if (isExperimentalEnabled(feature)) return null
  return NextResponse.json({ error: "This feature is not available yet" }, { status: 404 })
}
