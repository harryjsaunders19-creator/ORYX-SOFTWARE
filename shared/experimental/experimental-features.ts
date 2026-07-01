import { NextResponse } from "next/server"

/**
 * Experimental modules — disabled until ready for general use.
 * Set a flag to `true` to re-enable that area.
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
