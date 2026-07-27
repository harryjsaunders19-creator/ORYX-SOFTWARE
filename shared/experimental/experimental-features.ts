import { NextResponse } from "next/server"

/**
 * Experimental modules — off for production until HR/ops sign-off.
 * Employee file bytes now persist to Supabase Storage (`employee-files` bucket)
 * when admin credentials are configured; turn `employees` on only after
 * verifying migrations 014–016 + 028 and HR workflows.
 * Keep `leave` false until leave is migrated off SQLite-first writes.
 * Job Map is off for now — useful later, but currently buggy and optional for launch.
 */
export const EXPERIMENTAL = {
  employees: false,
  leave: false,
  jobMap: false,
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
