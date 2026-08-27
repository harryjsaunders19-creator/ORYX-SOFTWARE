/**
 * Jobs Register multi-user live sync.
 *
 * Architecture (service-role RLS + cookie auth):
 * - Browser cannot use postgres_changes on `jobs` (no SELECT policy for anon).
 * - Server publishes Broadcast events after mutations (no job row payload — IDs only).
 * - Clients subscribe with the anon key to the shared topic, then revalidate SWR.
 * - Visibility-aware list polling is the reliable fallback when Realtime is down.
 *
 * Authz: events carry no job fields. Clients re-fetch through cookie-authed APIs.
 */

export const JOBS_REGISTER_LIVE_TOPIC = "jobs-register"
export const JOBS_REGISTER_LIVE_EVENT = "change"

/** Soft poll while the Jobs tab is visible — not a substitute for Broadcast. */
export const JOBS_REGISTER_LIVE_POLL_MS = 8_000

export type JobsRegisterLiveReason =
  | "create"
  | "update"
  | "status"
  | "designer"
  | "delete"
  | "revision"
  | "unknown"

export type JobsRegisterLivePayload = {
  reason: JobsRegisterLiveReason
  /** Affected job / parent id when known — never includes job field values. */
  jobId?: string | null
  at: number
}

export function classifyJobsLiveReason(fields: Record<string, unknown>): JobsRegisterLiveReason {
  const meaningful = Object.keys(fields).filter(k => k !== "changedBy")
  const hasStatus = meaningful.includes("status")
  const hasDesigner = meaningful.includes("designer")
  if (hasStatus && hasDesigner) return "update"
  if (hasStatus && meaningful.length === 1) return "status"
  if (hasDesigner && meaningful.length === 1) return "designer"
  if (hasStatus || hasDesigner) return "update"
  return "update"
}
